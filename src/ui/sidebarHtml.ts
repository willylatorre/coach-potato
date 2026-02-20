import * as vscode from 'vscode';

export function getSidebarHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'coach-potato.svg'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'sidebar.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'sidebar.js'));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src ${webview.cspSource};" />
  <title>Coach Potato</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div class="topBar">
    <h1 class="title"><img src="${iconUri}" alt="" />Coach Potato</h1>
    <button id="coachNowBtn" class="actionBtn topActionBtn" type="button">Coach now</button>
  </div>
  <div id="apiWarning" class="warning hidden">
    No API key set. Coach Potato cannot analyze files yet. <a href="command:workbench.action.openSettings?%22coachPotato.apiKey%22">Open Settings</a> and add <code>coachPotato.apiKey</code> (or set <code>COACH_POTATO_API_KEY</code>).
  </div>
  <div class="messagesWrap">
    <div id="thinking" class="thinking hidden">Thinking...</div>
    <div id="resultStatus" class="resultStatus hidden"></div>
    <div id="messages" class="empty">No feedback yet. Save a file or run the analyze command.</div>
  </div>
  <form id="followUpForm" class="followUp" autocomplete="off">
    <textarea id="followUpInput" class="followUpInput" rows="3" placeholder="Ask for a deeper hint about this issue..."></textarea>
    <button id="followUpSubmit" class="followUpSubmit" type="submit" aria-label="Send follow-up">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-up-icon lucide-square-arrow-up"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/></svg>
    </button>
  </form>
  <div class="followUpHint">Coach Potato will coach you toward the answer before showing fixes.</div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
}
