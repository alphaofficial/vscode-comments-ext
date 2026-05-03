import * as vscode from "vscode";

import { CommentThreadProvider } from "./commentProvider";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    void vscode.window.showWarningMessage(
      "Margin requires a trusted workspace before comments can load.",
    );
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    return;
  }

  const provider = new CommentThreadProvider(workspaceFolder.uri.fsPath);
  context.subscriptions.push(provider);

  try {
    await provider.initialize();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while loading comments.";

    void vscode.window.showErrorMessage(`Margin failed to initialize: ${message}`);
  }
}

export function deactivate(): void {}
