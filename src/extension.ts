import * as vscode from 'vscode';

import { analyzeDocument } from './analysis/analyzeDocument';
import { getSettings } from './config/settings';
import { normalizeBubbleForHintMode } from './services/feedbackService';
import { getChangedFilesFromGit } from './services/gitService';
import { requestFollowUp } from './services/coachingService';
import { SidebarProvider } from './ui/sidebarProvider';

const OUTPUT_CHANNEL = vscode.window.createOutputChannel('Coach Potato');

export function activate(context: vscode.ExtensionContext): void {
  OUTPUT_CHANNEL.appendLine('Coach Potato activated.');

  const sidebarProvider = new SidebarProvider(context.extensionUri, {
    onAnalyzeCurrent: () => {
      void vscode.commands.executeCommand('coachPotato.analyzeCurrentFile');
    },
    onAnalyzeAllChanges: () => {
      void vscode.commands.executeCommand('coachPotato.analyzeAllChanges');
    },
    onFollowUp: (question: string) => {
      void handleFollowUp(question, sidebarProvider);
    },
    onAnalyzeWholeFile: (fileName: string) => {
      void handleAnalyzeWholeFile(fileName, sidebarProvider);
    }
  });

  sidebarProvider.setApiKeyStatus(Boolean(getSettings().apiKey));

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('coachPotato.sidebar', sidebarProvider)
  );

  const settingsListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('coachPotato.apiKey')) {
      sidebarProvider.setApiKeyStatus(Boolean(getSettings().apiKey));
    }
  });

  const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
    await analyzeDocument({
      document,
      triggeredBySave: true,
      requireDiff: true,
      sidebarProvider,
      outputChannel: OUTPUT_CHANNEL
    });
  });

  const manualCommand = vscode.commands.registerCommand('coachPotato.analyzeCurrentFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage('Coach Potato: Open a file to analyze first.');
      return;
    }

    await analyzeDocument({
      document: editor.document,
      triggeredBySave: false,
      requireDiff: false,
      sidebarProvider,
      outputChannel: OUTPUT_CHANNEL
    });
  });

  const analyzeCurrentDiffCommand = vscode.commands.registerCommand('coachPotato.analyzeCurrentDiff', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage('Coach Potato: Open a file to analyze first.');
      return;
    }

    await analyzeDocument({
      document: editor.document,
      triggeredBySave: false,
      requireDiff: true,
      sidebarProvider,
      outputChannel: OUTPUT_CHANNEL
    });
  });

  const analyzeAllChangesCommand = vscode.commands.registerCommand('coachPotato.analyzeAllChanges', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      void vscode.window.showInformationMessage('Coach Potato: Open a workspace folder first.');
      return;
    }

    const changedFiles = await getChangedFilesFromGit(workspaceFolder.uri.fsPath, OUTPUT_CHANNEL);
    if (changedFiles.length === 0) {
      void vscode.window.showInformationMessage('Coach Potato: No changed files found to analyze.');
      return;
    }

    let analyzedCount = 0;
    let failedCount = 0;

    for (const filePath of changedFiles) {
      try {
        const document = await vscode.workspace.openTextDocument(filePath);
        await analyzeDocument({
          document,
          triggeredBySave: true,
          sidebarProvider,
          outputChannel: OUTPUT_CHANNEL
        });
        analyzedCount += 1;
      } catch (error: unknown) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : String(error);
        OUTPUT_CHANNEL.appendLine(`Coach Potato analyze-all error for ${filePath}: ${message}`);
      }
    }

    void vscode.window.showInformationMessage(
      `Coach Potato: analyzed ${analyzedCount} changed file(s)${failedCount ? `, ${failedCount} failed` : ''}.`
    );
  });

  context.subscriptions.push(
    saveListener,
    manualCommand,
    analyzeCurrentDiffCommand,
    analyzeAllChangesCommand,
    settingsListener,
    OUTPUT_CHANNEL
  );
}

async function handleFollowUp(question: string, sidebarProvider: SidebarProvider): Promise<void> {
  const settings = getSettings();
  sidebarProvider.setApiKeyStatus(Boolean(settings.apiKey));

  const latestRun = sidebarProvider.getLatestRunContext();
  if (!latestRun) {
    void vscode.window.showInformationMessage('Coach Potato: Run an analysis first, then ask a follow-up.');
    return;
  }

  if (!settings.apiKey) {
    void vscode.window.showErrorMessage('Coach Potato: Missing API key. Add it in settings first.');
    return;
  }

  sidebarProvider.setThinkingLabel('Thinking... follow-up');
  try {
    sidebarProvider.addMessages([
      {
        timestamp: latestRun.timestamp,
        fileName: latestRun.fileName,
        role: 'user',
        content: question
      }
    ]);

    const response = await requestFollowUp({
      settings,
      question
    });

    if (!response) {
      return;
    }

    OUTPUT_CHANNEL.appendLine(`\n=== ${new Date().toISOString()} | Follow-up (${latestRun.fileName}) ===`);
    OUTPUT_CHANNEL.appendLine(`Q: ${question}`);
    OUTPUT_CHANNEL.appendLine(response);

    sidebarProvider.addMessages([
      {
        timestamp: latestRun.timestamp,
        fileName: latestRun.fileName,
        role: 'assistant',
        content: normalizeBubbleForHintMode(response)
      }
    ]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    OUTPUT_CHANNEL.appendLine(`Coach Potato follow-up error: ${message}`);
    void vscode.window.showErrorMessage(`Coach Potato follow-up failed: ${message}`);
  } finally {
    sidebarProvider.setThinkingLabel('');
  }
}

async function handleAnalyzeWholeFile(fileName: string, sidebarProvider: SidebarProvider): Promise<void> {
  try {
    const document = await vscode.workspace.openTextDocument(fileName);
    await analyzeDocument({
      document,
      triggeredBySave: false,
      requireDiff: false,
      sidebarProvider,
      outputChannel: OUTPUT_CHANNEL
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    OUTPUT_CHANNEL.appendLine(`Coach Potato whole-file analysis error: ${message}`);
    void vscode.window.showErrorMessage(`Coach Potato failed to analyze whole file: ${message}`);
  }
}

export function deactivate(): void {
  OUTPUT_CHANNEL.dispose();
}
