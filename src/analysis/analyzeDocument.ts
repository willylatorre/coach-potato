import * as path from 'node:path';

import * as vscode from 'vscode';

import { getSettings } from '../config/settings';
import {
  createAllClearMessage,
  createNoDiffPromptMessage,
  normalizeBubbleForHintMode,
  splitFeedbackIntoBubbles
} from '../services/feedbackService';
import { getWorkingDiffForDocument } from '../services/gitService';
import { requestCoaching } from '../services/coachingService';
import { SidebarProvider } from '../ui/sidebarProvider';

interface AnalyzeDocumentParams {
  document: vscode.TextDocument;
  triggeredBySave: boolean;
  requireDiff?: boolean;
  sidebarProvider: SidebarProvider;
  outputChannel: vscode.OutputChannel;
}

export async function analyzeDocument({
  document,
  triggeredBySave,
  requireDiff = false,
  sidebarProvider,
  outputChannel
}: AnalyzeDocumentParams): Promise<void> {
  const settings = getSettings();
  sidebarProvider.setApiKeyStatus(Boolean(settings.apiKey));

  if (!settings.enabled) {
    return;
  }
  if (triggeredBySave && !settings.analyzeOnSave) {
    return;
  }

  if (document.isUntitled || document.uri.scheme !== 'file') {
    return;
  }

  if (document.getText().trim().length === 0) {
    return;
  }

  const byteLength = Buffer.byteLength(document.getText(), 'utf8');
  const maxBytes = settings.maxFileSizeKb * 1024;
  if (byteLength > maxBytes) {
    outputChannel.appendLine(`Skipping ${document.fileName}: file too large (${Math.ceil(byteLength / 1024)}KB).`);
    sidebarProvider.setResultStatus('Skipped: file too large');
    return;
  }

  const changedDiff = await getWorkingDiffForDocument(document, outputChannel);
  if (requireDiff && !changedDiff.trim()) {
    outputChannel.appendLine(`Skipping ${document.fileName}: no git diff found for this save.`);
    sidebarProvider.addMessages([createNoDiffPromptMessage(document.fileName, settings.subtlety)]);
    sidebarProvider.setResultStatus('No diff detected');
    return;
  }

  sidebarProvider.setResultStatus('');
  sidebarProvider.setThinkingLabel(`Thinking... ${path.basename(document.fileName)}`);

  try {
    const feedback = await requestCoaching(document, settings, changedDiff);
    if (!feedback) {
      sidebarProvider.addMessages([createAllClearMessage(document.fileName, settings.subtlety)]);
      sidebarProvider.setResultStatus('All clear');
      if (!triggeredBySave) {
        void vscode.window.showInformationMessage('Coach Potato: No high-impact issues found.');
      }
      return;
    }

    const timestamp = new Date().toISOString();
    outputChannel.appendLine(`\n=== ${timestamp} | ${document.fileName} ===`);
    outputChannel.appendLine(feedback);
    outputChannel.show(true);

    const bubbleMessages = splitFeedbackIntoBubbles(feedback).map((content) => ({
      timestamp,
      fileName: document.fileName,
      role: 'assistant' as const,
      content: normalizeBubbleForHintMode(content)
    }));
    sidebarProvider.addMessages(bubbleMessages);
    sidebarProvider.setResultStatus('1 issue found');

    if (!triggeredBySave) {
      void vscode.window.showInformationMessage('Coach Potato analysis complete. Check the output panel.');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`Coach Potato error: ${message}`);
    sidebarProvider.setResultStatus('Analysis failed');
    if (!triggeredBySave) {
      void vscode.window.showErrorMessage(`Coach Potato failed: ${message}`);
    }
  } finally {
    sidebarProvider.setThinkingLabel('');
  }
}
