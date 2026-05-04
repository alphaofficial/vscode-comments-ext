import * as vscode from "vscode";

import { ensureMarginDataFile, MARGIN_DIRECTORY, MARGIN_FILE_NAME } from "./store";
import { CommentThreadProvider } from "./commentProvider";

const REFRESH_DEBOUNCE_MS = 150;

export function createMarginFileWatcher(
  workspaceFolder: vscode.WorkspaceFolder,
  provider: CommentThreadProvider,
): vscode.Disposable {
  const pattern = new vscode.RelativePattern(
    workspaceFolder,
    `${MARGIN_DIRECTORY}/${MARGIN_FILE_NAME}`,
  );
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleRefresh = (): void => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void refreshThreads();
    }, REFRESH_DEBOUNCE_MS);
  };

  const refreshThreads = async (): Promise<void> => {
    try {
      await ensureMarginDataFile(workspaceFolder.uri.fsPath);
      await provider.refresh();
    } catch (error) {
      // Guard against malformed margin.json (e.g., file watcher fired during partial write)
      if (error instanceof TypeError && error.message.includes("map")) {
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Unknown error while refreshing comments.";

      void vscode.window.showErrorMessage(`Margin failed to refresh: ${message}`);
    }
  };

  const subscriptions: vscode.Disposable[] = [
    watcher,
    watcher.onDidChange(scheduleRefresh),
    watcher.onDidCreate(scheduleRefresh),
    watcher.onDidDelete(scheduleRefresh),
    new vscode.Disposable(() => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = undefined;
      }
    }),
  ];

  return vscode.Disposable.from(...subscriptions);
}
