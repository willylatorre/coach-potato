import * as vscode from 'vscode';

import type { CoachMessage } from '../core/types';
import { createWelcomeMessage } from '../services/feedbackService';
import { getSidebarHtml } from './sidebarHtml';

interface SidebarHandlers {
  onAnalyzeCurrent: () => void;
  onAnalyzeAllChanges: () => void;
  onFollowUp: (question: string) => void;
  onAnalyzeWholeFile: (fileName: string) => void;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private messages: CoachMessage[] = [createWelcomeMessage()];
  private hasApiKey = false;
  private thinkingLabel = '';
  private resultStatus = '';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly handlers: SidebarHandlers
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [this.extensionUri]
    };
    view.webview.html = getSidebarHtml(view.webview, this.extensionUri);
    view.webview.onDidReceiveMessage((message) => {
      if (message?.type === 'analyzeCurrent') {
        this.handlers.onAnalyzeCurrent();
      }
      if (message?.type === 'analyzeAllChanges') {
        this.handlers.onAnalyzeAllChanges();
      }
      if (message?.type === 'followUp') {
        const question = String(message?.question ?? '').trim();
        if (question) {
          this.handlers.onFollowUp(question);
        }
      }
      if (message?.type === 'analyzeWholeFile') {
        const fileName = String(message?.fileName ?? '').trim();
        if (fileName) {
          this.handlers.onAnalyzeWholeFile(fileName);
        }
      }
    });
    this.postMessages();
  }

  addMessages(messages: CoachMessage[]): void {
    if (messages.length === 0) {
      return;
    }
    this.messages = [...this.messages, ...messages].slice(-50);
    this.postMessages();
  }

  setApiKeyStatus(hasApiKey: boolean): void {
    this.hasApiKey = hasApiKey;
    this.postMessages();
  }

  setThinkingLabel(label: string): void {
    this.thinkingLabel = label;
    this.postMessages();
  }

  setResultStatus(label: string): void {
    this.resultStatus = label;
    this.postMessages();
  }

  getLatestRunContext(): { timestamp: string; fileName: string; messages: string[] } | undefined {
    const latestNonWelcome = [...this.messages].reverse().find((message) => message.fileName !== 'Coach Potato');
    if (!latestNonWelcome) {
      return undefined;
    }

    const key = `${latestNonWelcome.timestamp}|${latestNonWelcome.fileName}`;
    const runMessages: string[] = [];

    for (const message of this.messages) {
      const messageKey = `${message.timestamp}|${message.fileName}`;
      if (messageKey === key) {
        runMessages.push(message.content);
      }
    }

    return {
      timestamp: latestNonWelcome.timestamp,
      fileName: latestNonWelcome.fileName,
      messages: runMessages
    };
  }

  private postMessages(): void {
    if (!this.view) {
      return;
    }
    void this.view.webview.postMessage({
      type: 'messages',
      messages: this.messages,
      hasApiKey: this.hasApiKey,
      thinkingLabel: this.thinkingLabel,
      resultStatus: this.resultStatus
    });
  }
}
