import type { CoachMessage, Subtlety } from '../core/types';

export function createWelcomeMessage(): CoachMessage {
  return {
    timestamp: new Date().toISOString(),
    fileName: 'Coach Potato',
    role: 'assistant',
    content:
      'Good morning. Coach Potato online and ready for a coding session. Bring me your diff, and I\'ll keep the feedback sharp and actionable.'
  };
}

export function splitFeedbackIntoBubbles(feedback: string): string[] {
  const normalized = feedback.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const suggestionHeadings = normalized.match(/(^|\n)-\s+\*\*/g) ?? [];
  if (suggestionHeadings.length <= 1) {
    return [normalized];
  }

  const bulletBlocks = normalized
    .split(/\n(?=-\s+\*\*|-\s+[^\n]+)/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (bulletBlocks.length > 1) {
    return bulletBlocks;
  }

  return normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeBubbleForHintMode(bubble: string): string {
  const normalized = bubble.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return normalized;
  }

  return normalized;
}

export function createNoDiffPromptMessage(fileName: string, subtlety: Subtlety): CoachMessage {
  const content =
    subtlety === 'gentle'
      ? "I don't see any changes in this file yet. Want me to review the whole file anyway?"
      : subtlety === 'direct'
        ? "No diff detected for this file. Do you want me to analyze the whole file instead?"
        : "No changes detected in this file. Should I run a full-file analysis now?";

  return {
    timestamp: new Date().toISOString(),
    fileName,
    role: 'assistant',
    content,
    action: {
      type: 'analyzeWholeFile',
      label: 'Yes, do it',
      fileName
    }
  };
}

export function createAllClearMessage(fileName: string, subtlety: Subtlety): CoachMessage {
  const content =
    subtlety === 'gentle'
      ? 'Nice work. I reviewed it and do not see a meaningful issue to change right now.'
      : subtlety === 'direct'
        ? 'Looks good. I do not see a high-impact issue in this code right now.'
        : 'Solid pass. No high-impact issue detected in the current code.';

  return {
    timestamp: new Date().toISOString(),
    fileName,
    role: 'assistant',
    content
  };
}
