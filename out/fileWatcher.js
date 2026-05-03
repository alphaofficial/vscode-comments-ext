"use strict";

const vscode = require("vscode");
const { ensureMarginDataFile, MARGIN_DIRECTORY, MARGIN_FILE_NAME } = require("./store");
const { CommentThreadProvider } = require("./commentProvider");
const REFRESH_DEBOUNCE_MS = 150;
function createMarginFileWatcher(workspaceFolder, provider) {
    const pattern = new vscode.RelativePattern(workspaceFolder, `${MARGIN_DIRECTORY}/${MARGIN_FILE_NAME}`);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    let refreshTimer;
    const scheduleRefresh = ()=>{
        if (refreshTimer) {
            clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(()=>{
            refreshTimer = undefined;
            void refreshThreads();
        }, REFRESH_DEBOUNCE_MS);
    };
    const refreshThreads = async ()=>{
        try {
            await ensureMarginDataFile(workspaceFolder.uri.fsPath);
            await provider.refresh();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error while refreshing comments.";
            void vscode.window.showErrorMessage(`Margin failed to refresh: ${message}`);
        }
    };
    const subscriptions = [
        watcher,
        watcher.onDidChange(scheduleRefresh),
        watcher.onDidCreate(scheduleRefresh),
        watcher.onDidDelete(scheduleRefresh),
        new vscode.Disposable(()=>{
            if (refreshTimer) {
                clearTimeout(refreshTimer);
                refreshTimer = undefined;
            }
        })
    ];
    return vscode.Disposable.from(...subscriptions);
}

module.exports = { createMarginFileWatcher };
