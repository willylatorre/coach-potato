import * as vscode from 'vscode';
import { generateText, type ModelMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

import type { CoachSettings, NoiseLevel, Subtlety } from '../core/types';

const ALL_CLEAR_TOKEN = 'ALL_CLEAR';
const SYSTEM_PROMPT =
  'You are Coach Potato, a pragmatic senior engineer coach. Be conversational and slightly playful, but technically precise. Lead with hints and questions first. Do not output HTML. Never include concrete code changes, replacement lines, or direct step-by-step fixes before the `Fix:` marker.';

type ActiveSession = {
  fileName: string;
  messages: ModelMessage[];
};

let activeSession: ActiveSession | undefined;

export async function requestCoaching(
  document: vscode.TextDocument,
  settings: CoachSettings,
  changedDiff: string
): Promise<string> {
  if (!settings.apiKey) {
    throw new Error('Missing API key. Set COACH_POTATO_API_KEY or coachPotato.apiKey.');
  }

  const provider = createProvider(settings);
  const prompt = buildPrompt(document, settings.noiseLevel, settings.subtlety, changedDiff);
  const messages: ModelMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];

  const result = await generateText({
    model: provider(settings.model),
    messages,
    temperature: settings.noiseLevel === 'quiet' ? 0.2 : settings.noiseLevel === 'balanced' ? 0.5 : 0.8
  });

  const text = result.text.trim();
  if (text === ALL_CLEAR_TOKEN) {
    activeSession = {
      fileName: document.fileName,
      messages
    };
    return '';
  }

  activeSession = {
    fileName: document.fileName,
    messages: [...messages, { role: 'assistant', content: text }]
  };

  return text;
}

interface FollowUpParams {
  settings: CoachSettings;
  question: string;
}

export async function requestFollowUp({ settings, question }: FollowUpParams): Promise<string> {
  if (!settings.apiKey) {
    throw new Error('Missing API key. Set COACH_POTATO_API_KEY or coachPotato.apiKey.');
  }
  if (!activeSession) {
    throw new Error('No active coaching session. Run a coach analysis first.');
  }

  const provider = createProvider(settings);
  const nextMessages: ModelMessage[] = [
    ...activeSession.messages,
    {
      role: 'user',
      content: [
        'Follow-up request on the same issue context only.',
        'Do not find new issues.',
        'Guide me with hints/questions first; keep concrete solution only under "Fix:".',
        `Question: ${question}`
      ].join('\n')
    }
  ];

  const result = await generateText({
    model: provider(settings.model),
    messages: nextMessages,
    temperature: settings.noiseLevel === 'quiet' ? 0.2 : settings.noiseLevel === 'balanced' ? 0.5 : 0.8
  });

  const text = result.text.trim();
  if (!text) {
    return '';
  }

  activeSession = {
    fileName: activeSession.fileName,
    messages: [...nextMessages, { role: 'assistant', content: text }]
  };

  return text;
}

function createProvider(settings: CoachSettings) {
  if (settings.provider === 'anthropic') {
    return createAnthropic({
      apiKey: settings.apiKey,
      baseURL: settings.apiBaseUrl
    });
  }
  return createOpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.apiBaseUrl
  });
}

function buildPrompt(document: vscode.TextDocument, noiseLevel: NoiseLevel, subtlety: Subtlety, changedDiff: string): string {
  const language = document.languageId;

  const toneInstruction =
    subtlety === 'gentle'
      ? 'Use supportive language and avoid harsh wording.'
      : subtlety === 'direct'
        ? 'Be direct and practical, without being rude.'
        : 'Be strict: call out risky patterns clearly and prioritize high-impact issues.';

  return [
    `Review this ${language} file that was just saved.`,
    'Primary task: review only the code shown in the CHANGED DIFF section when it is present.',
    'If CHANGED DIFF is empty, review FULL FILE CONTEXT instead.',
    'When CHANGED DIFF is present, do not coach about unchanged lines.',
    'Return exactly one coaching suggestion: the single highest-impact issue only.',
    `If there are no meaningful issues, return exactly "${ALL_CLEAR_TOKEN}" and nothing else.`,
    toneInstruction,
    'Keep it conversational, like a coaching chat.',
    'Start with a short opener, for example "Let\'s see..." or "Oh oh, are you sure about this part?".',
    'Use this structure exactly:',
    '- **Issue title**',
    '  One or two hint-style lines that point to the problem (question style).',
    '  Why it matters: <short impact statement>.',
    '  Fix: <concrete fix, optionally with fenced code block>.',
    'Critical rule: before "Fix:" you must not reveal the concrete patch.',
    '',
    'CHANGED DIFF:',
    '```diff',
    changedDiff,
    '```',
    '',
    'FULL FILE CONTEXT:',
    '```',
    document.getText(),
    '```'
  ].join('\n');
}
