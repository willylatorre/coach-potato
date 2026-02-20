const vscode = acquireVsCodeApi();
const container = document.getElementById('messages');
const warning = document.getElementById('apiWarning');
const thinking = document.getElementById('thinking');
const coachNowBtn = document.getElementById('coachNowBtn');
const followUpForm = document.getElementById('followUpForm');
const followUpInput = document.getElementById('followUpInput');
let previousMessageCount = 0;

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderInlineMarkdown = (value) => {
  let safe = escapeHtml(value);
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return safe;
};

const renderTextBlocks = (value) => {
  const normalized = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return '';
  }

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const isList = lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line));
      if (isList) {
        const items = lines
          .map((line) => line.replace(/^[-*]\s+/, ''))
          .map((line) => '<li>' + renderInlineMarkdown(line) + '</li>')
          .join('');
        return '<ul>' + items + '</ul>';
      }

      return '<p>' + renderInlineMarkdown(lines.join(' ')) + '</p>';
    })
    .join('');
};

const renderWithCodeFences = (value) => {
  const parts = String(value ?? '').split(/```/);
  let html = '';

  for (let i = 0; i < parts.length; i += 1) {
    if (i % 2 === 0) {
      html += renderTextBlocks(parts[i]);
      continue;
    }

    const codeBlock = parts[i].replace(/^\n+/, '');
    const codeLines = codeBlock.split('\n');
    if (codeLines.length > 1 && /^[a-zA-Z0-9_-]+$/.test(codeLines[0].trim())) {
      codeLines.shift();
    }

    const code = codeLines.join('\n').trimEnd();
    if (code) {
      html += '<pre><code>' + escapeHtml(code) + '</code></pre>';
    }
  }

  return html;
};

const renderMarkdown = (value) => {
  const normalized = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return '';
  }

  const fixMatch = normalized.match(/(?:^|\n)(?:\*\*Fix:\*\*|Fix:)\s*/i);
  if (!fixMatch) {
    return renderWithCodeFences(normalized);
  }

  const markerIndex = fixMatch.index ?? -1;
  if (markerIndex < 0) {
    return renderWithCodeFences(normalized);
  }

  const hintPart = normalized.slice(0, markerIndex).trim();
  const fixPart = normalized.slice(markerIndex + fixMatch[0].length).trim();
  let html = renderWithCodeFences(hintPart);
  if (fixPart) {
    html += '<details class="fix"><summary>See fix</summary>' + renderWithCodeFences(fixPart) + '</details>';
  }

  return html;
};

const renderMessageAction = (action) => {
  if (!action || action.type !== 'analyzeWholeFile') {
    return '';
  }

  const label = escapeHtml(action.label || 'Yes, do it');
  const fileName = escapeHtml(action.fileName || '');
  return (
    '<button class="messageActionBtn" type="button" data-action-type="analyzeWholeFile" data-file-name="' +
    fileName +
    '">' +
    label +
    '</button>'
  );
};

window.addEventListener('message', (event) => {
  const { type, messages, hasApiKey, thinkingLabel } = event.data || {};
  if (type !== 'messages') {
    return;
  }

  if (warning) {
    warning.className = hasApiKey ? 'warning hidden' : 'warning';
  }

  if (thinking) {
    const activeThinkingLabel = String(thinkingLabel ?? '').trim();
    if (activeThinkingLabel) {
      thinking.className = 'thinking';
      thinking.textContent = activeThinkingLabel;
    } else {
      thinking.className = 'thinking hidden';
      thinking.textContent = 'Thinking...';
    }
  }

  if (!messages || messages.length === 0) {
    container.className = 'empty';
    container.textContent = 'No feedback yet. Save a file or run the analyze command.';
    previousMessageCount = 0;
    return;
  }

  const groups = [];
  for (const item of messages) {
    const key = String(item.timestamp ?? '') + '|' + String(item.fileName ?? '');
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup || lastGroup.key !== key) {
      groups.push({
        key,
        timestamp: item.timestamp ?? '',
        fileName: item.fileName ?? '',
        items: [item]
      });
    } else {
      lastGroup.items.push(item);
    }
  }

  container.className = '';
  container.innerHTML = groups
    .map((group) => {
      const safeFile = escapeHtml(group.fileName);
      const safeTime = escapeHtml(group.timestamp);
      const bubbles = group.items
        .map((item) => {
          const role = item.role === 'user' ? 'user' : 'assistant';
          const messageContent = role === 'user' ? renderTextBlocks(item.content ?? '') : renderMarkdown(item.content ?? '');
          const actionHtml = role === 'assistant' ? renderMessageAction(item.action) : '';
          return (
            '<div class="message ' +
            role +
            ' pending"><div class="content">' +
            messageContent +
            '</div>' +
            actionHtml +
            '</div>'
          );
        })
        .join('');
      return '<div class="group"><div class="groupMeta">' + safeTime + ' • ' + safeFile + '</div>' + bubbles + '</div>';
    })
    .join('');

  const newMessageCount = Math.max(0, messages.length - previousMessageCount);
  const pending = container.querySelectorAll('.message.pending');
  pending.forEach((node, idx) => {
    const delay = idx < newMessageCount ? idx * 140 : 0;
    window.setTimeout(() => {
      node.classList.remove('pending');
      node.classList.add('revealed');
    }, delay);
  });

  previousMessageCount = messages.length;
});

if (coachNowBtn) {
  coachNowBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'analyzeCurrent' });
  });
}

if (followUpForm && followUpInput) {
  followUpForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = String(followUpInput.value ?? '').trim();
    if (!question) {
      return;
    }

    vscode.postMessage({ type: 'followUp', question });
    followUpInput.value = '';
    followUpInput.focus();
  });
}

if (container) {
  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest('.messageActionBtn');
    if (!button) {
      return;
    }

    const actionType = button.getAttribute('data-action-type');
    const fileName = button.getAttribute('data-file-name') || '';
    if (actionType === 'analyzeWholeFile' && fileName) {
      vscode.postMessage({ type: 'analyzeWholeFile', fileName });
    }
  });
}
