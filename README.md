# Coach Potato VS Code Extension (Scaffold)

Coach Potato is a starter VS Code extension that analyzes a file whenever you save it and gives AI-powered coaching suggestions.

## Features

- Hooks into `onDidSaveTextDocument` and reviews saved files.
- Supports an explicit command: **Coach Potato: Analyze Current File**.
- Configurable behavior:
  - `coachPotato.noiseLevel`: `quiet | balanced | chatty`
  - `coachPotato.subtlety`: `gentle | direct | strict`
- OpenAI-compatible API integration (`/chat/completions`).

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure your API key (recommended via environment variable):

   ```bash
   export COACH_POTATO_API_KEY="your-api-key"
   ```

   Or set `coachPotato.apiKey` in your VS Code settings.

3. Build:

   ```bash
   npm run compile
   ```

4. Press `F5` in VS Code to run the Extension Development Host.

## Notes

- This repository intentionally **does not** include any real API key.
- You can point `coachPotato.apiBaseUrl` at any OpenAI-compatible endpoint.
- For production use, consider adding diff-only analysis and debounce/throttling.
