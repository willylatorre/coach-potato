import * as vscode from 'vscode';
import { generateObject, type ModelMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

import type { CoachSettings, NoiseLevel, Subtlety } from '../core/types';

const SYSTEM_PROMPT_BASE =
  'You are Coach Potato, a pragmatic senior engineer coach. Be conversational and slightly playful, but technically precise. Lead with hints and questions first. Do not output HTML. Never include concrete code changes, replacement lines, or direct step-by-step fixes before the `fix` field.';

const coachingResponseSchema = z.object({
  verdict: z.enum(['all_clear', 'issue']),
  opener: z.string(),
  title: z.string(),
  hint: z.string(),
  whyItMatters: z.string(),
  fix: z.string()
});

const followUpResponseSchema = z.object({
  opener: z.string(),
  hint: z.string(),
  whyItMatters: z.string(),
  fix: z.string()
});

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
    { role: 'system', content: buildSystemPrompt(settings.subtlety) },
    { role: 'user', content: prompt }
  ];

  const result = await generateObject({
    model: provider(settings.model),
    messages,
    schema: coachingResponseSchema,
    temperature: settings.noiseLevel === 'quiet' ? 0.2 : settings.noiseLevel === 'balanced' ? 0.5 : 0.8
  });

  const response = result.object;
  if (response.verdict === 'all_clear') {
    activeSession = {
      fileName: document.fileName,
      messages
    };
    return '';
  }

  const text = formatCoachingResponse(response);
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
      content: buildFollowUpPrompt(question)
    }
  ];

  const result = await generateObject({
    model: provider(settings.model),
    messages: nextMessages,
    schema: followUpResponseSchema,
    temperature: settings.noiseLevel === 'quiet' ? 0.2 : settings.noiseLevel === 'balanced' ? 0.5 : 0.8
  });

  const text = formatFollowUpResponse(result.object);
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

function buildSystemPrompt(subtlety: Subtlety): string {
  const subtletyInstruction =
    subtlety === 'gentle'
      ? 'Tone mode: gentle. Be supportive, calm, and encouraging. Avoid harsh phrasing.'
      : subtlety === 'direct'
        ? 'Tone mode: direct. Be concise and practical without being rude.'
        : 'Tone mode: strict. Be firm, call out risky patterns clearly, and prioritize high-impact issues.';

  return `${SYSTEM_PROMPT_BASE} ${subtletyInstruction}`;
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
    `If there are no meaningful issues, set verdict to "all_clear".`,
    toneInstruction,
    'Output for schema fields:',
    '- opener: short conversational opener (use empty string if unavailable)',
    '- title: keep empty unless absolutely necessary; prefer natural chat without headings',
    '- hint: one or two natural-language hint lines (question style), no concrete patch (empty string if all_clear)',
    '- whyItMatters: short impact statement (empty string if unavailable)',
    '- fix: concrete fix, may include fenced code block (empty string if unavailable)',
    'Critical rule: hint must not reveal the concrete patch.',
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

function buildFollowUpPrompt(question: string): string {
  return [
    'Follow-up request on the same issue context only.',
    'Do not find new issues.',
    'Return concise coaching content for schema fields.',
    '- opener: short opener (empty string if not needed)',
    '- hint: coaching guidance first, no concrete patch',
    '- whyItMatters: short impact statement (empty string if not needed)',
    '- fix: concrete fix (empty string if not needed)',
    'Question:',
    question
  ].join('\n');
}

function stripLeadingBullet(value: string): string {
  return value
    .trim()
    .replace(/^\s*[-*]\s+/, '');
}

function formatCoachingResponse(response: z.infer<typeof coachingResponseSchema>): string {
  const parts: string[] = [];
  const opener = response.opener.trim() ? stripLeadingBullet(response.opener) : "Let's see...";
  if (opener) {
    parts.push(opener);
  }

  const title = response.title.trim();
  if (response.hint.trim()) {
    const hint = stripLeadingBullet(response.hint);
    if (title) {
      parts.push(`${stripLeadingBullet(title)}. ${hint}`);
    } else {
      parts.push(hint);
    }
  } else if (title) {
    parts.push(stripLeadingBullet(title));
  }
  if (response.whyItMatters.trim()) {
    parts.push(`Why it matters: ${response.whyItMatters.trim()}`);
  }
  if (response.fix.trim()) {
    parts.push(`Fix: ${response.fix.trim()}`);
  }
  return parts.join('\n\n').trim();
}

function formatFollowUpResponse(response: z.infer<typeof followUpResponseSchema>): string {
  const parts: string[] = [];
  if (response.opener.trim()) {
    parts.push(stripLeadingBullet(response.opener));
  }
  if (response.hint.trim()) {
    parts.push(stripLeadingBullet(response.hint));
  }
  if (response.whyItMatters.trim()) {
    parts.push(`Why it matters: ${response.whyItMatters.trim()}`);
  }
  if (response.fix.trim()) {
    parts.push(`Fix: ${response.fix.trim()}`);
  }
  return parts.join('\n\n').trim();
}
