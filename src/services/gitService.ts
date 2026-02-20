import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';

import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

export async function getChangedFilesFromGit(
  workspaceRoot: string,
  outputChannel: vscode.OutputChannel
): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', workspaceRoot, 'status', '--porcelain']);
    const files = new Set<string>();

    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      const rawPath = line.slice(3).trim();
      const normalizedPath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() ?? rawPath : rawPath;
      files.add(path.resolve(workspaceRoot, normalizedPath));
    }

    return [...files];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`Coach Potato git status failed: ${message}`);
    return [];
  }
}

export async function getWorkingDiffForDocument(
  document: vscode.TextDocument,
  outputChannel: vscode.OutputChannel
): Promise<string> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    return '';
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const relativePath = path.relative(workspaceRoot, document.fileName);
  if (!relativePath || relativePath.startsWith('..')) {
    return '';
  }

  const fullFileDiff = createSyntheticFullFileDiff(relativePath, document.getText());

  try {
    await execFileAsync('git', ['-C', workspaceRoot, 'rev-parse', '--is-inside-work-tree']);
  } catch {
    outputChannel.appendLine(`Coach Potato: no git repository detected for ${relativePath}; analyzing full file.`);
    return fullFileDiff;
  }

  try {
    await execFileAsync('git', ['-C', workspaceRoot, 'rev-parse', '--verify', 'HEAD']);
    const { stdout } = await execFileAsync('git', ['-C', workspaceRoot, 'diff', '--no-color', '-U0', 'HEAD', '--', relativePath]);
    if (stdout.trim()) {
      return stdout.trim();
    }
  } catch {
    try {
      const [unstaged, staged] = await Promise.all([
        execFileAsync('git', ['-C', workspaceRoot, 'diff', '--no-color', '-U0', '--', relativePath]),
        execFileAsync('git', ['-C', workspaceRoot, 'diff', '--no-color', '-U0', '--cached', '--', relativePath])
      ]);
      const merged = [unstaged.stdout.trim(), staged.stdout.trim()].filter(Boolean).join('\n\n');
      if (merged) {
        return merged;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      outputChannel.appendLine(`Coach Potato git diff failed for ${relativePath}: ${message}`);
      return fullFileDiff;
    }
  }

  try {
    await execFileAsync('git', ['-C', workspaceRoot, 'ls-files', '--error-unmatch', '--', relativePath]);
    return '';
  } catch {
    return fullFileDiff;
  }
}

function createSyntheticFullFileDiff(relativePath: string, content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const additions = lines.map((line) => `+${line}`).join('\n');
  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${relativePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    additions
  ].join('\n');
}
