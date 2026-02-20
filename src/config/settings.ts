import * as vscode from 'vscode';

import type { CoachSettings, NoiseLevel, Subtlety } from '../core/types';

type Provider = CoachSettings['provider'];

function hasExplicitValue<T>(cfg: vscode.WorkspaceConfiguration, key: string): boolean {
  const inspected = cfg.inspect<T>(key);
  if (!inspected) {
    return false;
  }
  return (
    inspected.globalValue !== undefined ||
    inspected.workspaceValue !== undefined ||
    inspected.workspaceFolderValue !== undefined
  );
}

function getProviderDefaults(provider: Provider): { model: string; apiBaseUrl: string } {
  if (provider === 'anthropic') {
    return {
      model: 'claude-3-5-haiku-latest',
      apiBaseUrl: 'https://api.anthropic.com/v1'
    };
  }
  return {
    model: 'gpt-4.1-mini',
    apiBaseUrl: 'https://api.openai.com/v1'
  };
}

export function getSettings(): CoachSettings {
  const cfg = vscode.workspace.getConfiguration('coachPotato');
  const envKey = process.env.COACH_POTATO_API_KEY ?? '';
  const provider = cfg.get<Provider>('provider', 'openai');
  const providerDefaults = getProviderDefaults(provider);

  const model = hasExplicitValue<string>(cfg, 'model')
    ? (cfg.get<string>('model') ?? providerDefaults.model)
    : providerDefaults.model;
  const apiBaseUrl = hasExplicitValue<string>(cfg, 'apiBaseUrl')
    ? (cfg.get<string>('apiBaseUrl') ?? providerDefaults.apiBaseUrl)
    : providerDefaults.apiBaseUrl;

  return {
    enabled: cfg.get<boolean>('enabled', true),
    analyzeOnSave: cfg.get<boolean>('analyzeOnSave', true),
    provider,
    model,
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
    apiKey: envKey || cfg.get<string>('apiKey', ''),
    noiseLevel: cfg.get<NoiseLevel>('noiseLevel', 'balanced'),
    subtlety: cfg.get<Subtlety>('subtlety', 'direct'),
    maxFileSizeKb: cfg.get<number>('maxFileSizeKb', 256)
  };
}
