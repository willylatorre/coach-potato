import * as vscode from 'vscode';

type NoiseLevel = 'quiet' | 'balanced' | 'chatty';
type Subtlety = 'gentle' | 'direct' | 'strict';

interface CoachSettings {
  enabled: boolean;
  provider: 'openai' | 'compatible';
  model: string;
  apiBaseUrl: string;
  apiKey: string;
  noiseLevel: NoiseLevel;
  subtlety: Subtlety;
  maxFileSizeKb: number;
}

interface ChatCompletionChoice {
  message?: {
    content?: string;
  };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

const OUTPUT_CHANNEL = vscode.window.createOutputChannel('Coach Potato');

export function activate(context: vscode.ExtensionContext): void {
  OUTPUT_CHANNEL.appendLine('Coach Potato activated.');

  const saveListener = vscode.workspace.onDidSaveTextDocument(async (doc) => {
    await analyzeDocument(doc, true);
  });

  const manualCommand = vscode.commands.registerCommand('coachPotato.analyzeCurrentFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage('Coach Potato: Open a file to analyze first.');
      return;
    }

    await analyzeDocument(editor.document, false);
  });

  context.subscriptions.push(saveListener, manualCommand, OUTPUT_CHANNEL);
}

export function deactivate(): void {
  OUTPUT_CHANNEL.dispose();
}

async function analyzeDocument(document: vscode.TextDocument, triggeredBySave: boolean): Promise<void> {
  const settings = getSettings();

  if (!settings.enabled) {
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
    OUTPUT_CHANNEL.appendLine(`Skipping ${document.fileName}: file too large (${Math.ceil(byteLength / 1024)}KB).`);
    return;
  }

  try {
    const feedback = await requestCoaching(document, settings);
    if (!feedback) {
      return;
    }

    OUTPUT_CHANNEL.appendLine(`\n=== ${new Date().toISOString()} | ${document.fileName} ===`);
    OUTPUT_CHANNEL.appendLine(feedback);
    OUTPUT_CHANNEL.show(true);

    if (!triggeredBySave) {
      void vscode.window.showInformationMessage('Coach Potato analysis complete. Check the output panel.');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    OUTPUT_CHANNEL.appendLine(`Coach Potato error: ${message}`);
    if (!triggeredBySave) {
      void vscode.window.showErrorMessage(`Coach Potato failed: ${message}`);
    }
  }
}

function getSettings(): CoachSettings {
  const cfg = vscode.workspace.getConfiguration('coachPotato');
  const envKey = process.env.COACH_POTATO_API_KEY ?? '';

  return {
    enabled: cfg.get<boolean>('enabled', true),
    provider: cfg.get<'openai' | 'compatible'>('provider', 'openai'),
    model: cfg.get<string>('model', 'gpt-4.1-mini'),
    apiBaseUrl: cfg.get<string>('apiBaseUrl', 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey: envKey || cfg.get<string>('apiKey', ''),
    noiseLevel: cfg.get<NoiseLevel>('noiseLevel', 'balanced'),
    subtlety: cfg.get<Subtlety>('subtlety', 'direct'),
    maxFileSizeKb: cfg.get<number>('maxFileSizeKb', 256)
  };
}

async function requestCoaching(document: vscode.TextDocument, settings: CoachSettings): Promise<string> {
  if (!settings.apiKey) {
    throw new Error('Missing API key. Set COACH_POTATO_API_KEY or coachPotato.apiKey.');
  }

  const prompt = buildPrompt(document, settings.noiseLevel, settings.subtlety);
  const endpoint = `${settings.apiBaseUrl}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: 'system',
          content:
            'You are Coach Potato, a concise senior engineer giving actionable code review feedback. Focus on correctness, readability, maintainability, and potential bugs. Prefer bullet points.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: settings.noiseLevel === 'quiet' ? 0.2 : settings.noiseLevel === 'balanced' ? 0.5 : 0.8
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  return payload.choices?.[0]?.message?.content?.trim() ?? '';
}

function buildPrompt(document: vscode.TextDocument, noiseLevel: NoiseLevel, subtlety: Subtlety): string {
  const language = document.languageId;
  const maxItems = noiseLevel === 'quiet' ? 3 : noiseLevel === 'balanced' ? 6 : 10;

  const toneInstruction =
    subtlety === 'gentle'
      ? 'Use supportive language and avoid harsh wording.'
      : subtlety === 'direct'
        ? 'Be direct and practical, without being rude.'
        : 'Be strict: call out risky patterns clearly and prioritize high-impact issues.';

  return [
    `Review this ${language} file that was just saved.`,
    `Return at most ${maxItems} suggestions, sorted by impact.`,
    toneInstruction,
    'For each point, include:',
    '- issue summary',
    '- why it matters',
    '- concrete fix',
    '',
    'Code:',
    '```',
    document.getText(),
    '```'
  ].join('\n');
}
