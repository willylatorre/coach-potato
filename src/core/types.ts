export type NoiseLevel = 'quiet' | 'balanced' | 'chatty';
export type Subtlety = 'gentle' | 'direct' | 'strict';

export interface CoachSettings {
  enabled: boolean;
  analyzeOnSave: boolean;
  provider: 'openai' | 'anthropic';
  model: string;
  apiBaseUrl: string;
  apiKey: string;
  noiseLevel: NoiseLevel;
  subtlety: Subtlety;
  maxFileSizeKb: number;
}

export interface CoachMessage {
  timestamp: string;
  fileName: string;
  role?: 'assistant' | 'user';
  content: string;
  action?: {
    type: 'analyzeWholeFile';
    label: string;
    fileName: string;
  };
}
