"use strict";

const { randomUUID } = require("node:crypto");
const { chmod, mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");
const vscode = require("vscode");
const { CommentThreadProvider } = require("./commentProvider");
const { createMarginFileWatcher } = require("./fileWatcher");
const { ensureMarginDataFile, MARGIN_DIRECTORY, readMarginData, writeMarginData } = require("./store");
const CLI_TEMPLATE_DIRECTORY = path.join(".vscode", "bin");
const CLI_SCRIPT_NAME = "margin";
const CLI_MODULE_NAME = "margin-cli.mjs";
const GIT_EXCLUDE_PATTERNS = [
    `${MARGIN_DIRECTORY}/margin.json`,
    `${CLI_TEMPLATE_DIRECTORY}/${CLI_SCRIPT_NAME}`,
    `${CLI_TEMPLATE_DIRECTORY}/${CLI_MODULE_NAME}`
];
async function activate(context) {
    if (!vscode.workspace.isTrusted) {
        void vscode.window.showWarningMessage("Margin requires a trusted workspace before comments can load.");
        return;
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }
    const provider = new CommentThreadProvider(workspaceFolder.uri.fsPath);
    context.subscriptions.push(provider);
    context.subscriptions.push(vscode.commands.registerCommand("margin.addThread", async ()=>{
        await addThread(provider, workspaceFolder);
    }), vscode.commands.registerCommand("margin.addReply", async (commentThread)=>{
        await addReply(provider, workspaceFolder, commentThread);
    }), vscode.commands.registerCommand("margin.resolve", async (commentThread)=>{
        await updateThreadResolution(provider, workspaceFolder, commentThread, true);
    }), vscode.commands.registerCommand("margin.reopen", async (commentThread)=>{
        await updateThreadResolution(provider, workspaceFolder, commentThread, false);
    }), vscode.commands.registerCommand("margin.deleteThread", async (commentThread)=>{
        await deleteThread(provider, workspaceFolder, commentThread);
    }), vscode.commands.registerCommand("margin.clear", async ()=>{
        await clearAllThreads(provider, workspaceFolder);
    }), vscode.commands.registerCommand("margin.init", async ()=>{
        await initializeMarginWorkspace(context, workspaceFolder, provider);
    }));
    const autoInit = vscode.workspace.getConfiguration("margin").get("autoInit", false);
    try {
        await provider.initialize();
        context.subscriptions.push(createMarginFileWatcher(workspaceFolder, provider));
        if (autoInit) {
            await initializeMarginWorkspace(context, workspaceFolder, provider);
        }
    } catch (error) {
        if (isFileNotFoundError(error)) {
            if (autoInit) {
                await initializeMarginWorkspace(context, workspaceFolder, provider);
                context.subscriptions.push(createMarginFileWatcher(workspaceFolder, provider));
                return;
            }
            void vscode.window.showInformationMessage("Run 'Margin: Initialize Margin' to set up Margin in this workspace.");
            return;
        }
        const message = error instanceof Error ? error.message : "Unknown error while loading comments.";
        void vscode.window.showErrorMessage(`Margin failed to initialize: ${message}`);
    }
}
function deactivate() {}
async function initializeMarginWorkspace(context, workspaceFolder, provider) {
    try {
        await ensureMarginDataFile(workspaceFolder.uri.fsPath);
        const createdFiles = await installCliBinaries(context, workspaceFolder.uri.fsPath);
        const addedPatterns = await updateGitExclude(workspaceFolder.uri.fsPath);
        await provider.refresh();
        const statusParts = [
            "Margin initialized"
        ];
        if (createdFiles.length > 0) {
            statusParts.push(`wrote ${createdFiles.join(", ")}`);
        }
        if (addedPatterns.length > 0) {
            statusParts.push(`updated .git/info/exclude`);
        }
        void vscode.window.showInformationMessage(`${statusParts.join("; ")}.`);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error while initializing Margin.";
        void vscode.window.showErrorMessage(`Margin init failed: ${message}`);
        throw error;
    }
}
async function addThread(provider, workspaceFolder) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        void vscode.window.showErrorMessage("Open a workspace file to add a Margin thread.");
        return;
    }
    if (!isWorkspaceDocument(editor.document.uri, workspaceFolder)) {
        void vscode.window.showErrorMessage("Margin can only comment on files in the current workspace.");
        return;
    }
    const commentInput = await promptForComment("New Margin thread");
    if (!commentInput) {
        return;
    }
    const timestamp = new Date().toISOString();
    const marginData = await readMarginData(workspaceFolder.uri.fsPath);
    const lineNumber = editor.selection.active.line + 1;
    const anchor = createAnchorFromDocument(editor.document, editor.selection.active.line);
    marginData.threads.push({
        id: randomUUID(),
        file: toRelativeWorkspacePath(workspaceFolder.uri.fsPath, editor.document.uri.fsPath),
        line: lineNumber,
        anchor,
        comments: [
            {
                id: randomUUID(),
                author: commentInput.author,
                text: commentInput.text,
                timestamp
            }
        ],
        resolved: false,
        createdAt: timestamp,
        updatedAt: timestamp
    });
    await persistMarginData(workspaceFolder.uri.fsPath, marginData, provider);
    void vscode.window.showInformationMessage("Margin thread added.");
}
async function addReply(provider, workspaceFolder, commentThread) {
    const storedThread = await resolveTargetThread(provider, workspaceFolder, commentThread);
    if (!storedThread) {
        return;
    }
    const commentInput = await promptForComment("Reply to Margin thread");
    if (!commentInput) {
        return;
    }
    const timestamp = new Date().toISOString();
    await mutateThread(workspaceFolder.uri.fsPath, storedThread.id, provider, (thread)=>{
        thread.comments.push({
            id: randomUUID(),
            author: commentInput.author,
            text: commentInput.text,
            timestamp
        });
        thread.updatedAt = timestamp;
    });
    void vscode.window.showInformationMessage("Margin reply added.");
}
async function updateThreadResolution(provider, workspaceFolder, commentThread, resolved) {
    const storedThread = await resolveTargetThread(provider, workspaceFolder, commentThread);
    if (!storedThread) {
        return;
    }
    if (storedThread.resolved === resolved) {
        const message = resolved ? "Thread is already resolved." : "Thread is already open.";
        void vscode.window.showInformationMessage(message);
        return;
    }
    const timestamp = new Date().toISOString();
    await mutateThread(workspaceFolder.uri.fsPath, storedThread.id, provider, (thread)=>{
        thread.resolved = resolved;
        thread.updatedAt = timestamp;
    });
    void vscode.window.showInformationMessage(resolved ? "Margin thread resolved." : "Margin thread reopened.");
}
async function deleteThread(provider, workspaceFolder, commentThread) {
    const storedThread = await resolveTargetThread(provider, workspaceFolder, commentThread);
    if (!storedThread) {
        return;
    }
    const confirmation = await vscode.window.showWarningMessage(`Delete Margin thread at ${storedThread.file}:${storedThread.line}?`, {
        modal: true
    }, "Delete");
    if (confirmation !== "Delete") {
        return;
    }
    const marginData = await readMarginData(workspaceFolder.uri.fsPath);
    const nextThreads = marginData.threads.filter((thread)=>thread.id !== storedThread.id);
    if (nextThreads.length === marginData.threads.length) {
        throw new Error(`Margin thread ${storedThread.id} no longer exists.`);
    }
    marginData.threads = nextThreads;
    await persistMarginData(workspaceFolder.uri.fsPath, marginData, provider);
    void vscode.window.showInformationMessage("Margin thread deleted.");
}
async function clearAllThreads(provider, workspaceFolder) {
    const confirmation = await vscode.window.showWarningMessage("Clear all Margin comments in this workspace?", "Clear All");
    if (confirmation !== "Clear All") {
        return;
    }
    const marginData = await readMarginData(workspaceFolder.uri.fsPath);
    const clearedCount = marginData.threads.length;
    if (clearedCount === 0) {
        void vscode.window.showInformationMessage("No Margin comments to clear.");
        return;
    }
    marginData.threads = [];
    await persistMarginData(workspaceFolder.uri.fsPath, marginData, provider);
    void vscode.window.showInformationMessage(`Cleared ${clearedCount} Margin comment${clearedCount === 1 ? "" : "s"}.`);
}
async function mutateThread(workspaceRoot, threadId, provider, mutate) {
    const marginData = await readMarginData(workspaceRoot);
    const thread = marginData.threads.find((candidate)=>candidate.id === threadId);
    if (!thread) {
        throw new Error(`Margin thread ${threadId} no longer exists.`);
    }
    mutate(thread);
    await persistMarginData(workspaceRoot, marginData, provider);
}
async function persistMarginData(workspaceRoot, marginData, provider) {
    try {
        await writeMarginData(workspaceRoot, marginData);
        await provider.refresh();
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error while updating comments.";
        void vscode.window.showErrorMessage(`Margin update failed: ${message}`);
        throw error;
    }
}
async function promptForComment(title) {
    const author = await vscode.window.showInputBox({
        prompt: `${title}: author`,
        placeHolder: "Author name",
        value: getDefaultAuthor(),
        validateInput: (value)=>{
            return value.trim().length === 0 ? "Author is required." : undefined;
        }
    });
    if (author === undefined) {
        return undefined;
    }
    const text = await vscode.window.showInputBox({
        prompt: `${title}: comment`,
        placeHolder: "Comment text",
        validateInput: (value)=>{
            return value.trim().length === 0 ? "Comment text is required." : undefined;
        }
    });
    if (text === undefined) {
        return undefined;
    }
    return {
        author: author.trim(),
        text: text.trim()
    };
}
async function resolveTargetThread(provider, workspaceFolder, explicitThread) {
    if (explicitThread) {
        const threadId = provider.getThreadId(explicitThread);
        if (!threadId) {
            void vscode.window.showErrorMessage("Margin could not identify the selected thread.");
            return undefined;
        }
        const storedThread = provider.getStoredThread(threadId);
        if (!storedThread) {
            void vscode.window.showErrorMessage("Margin thread is no longer available.");
            return undefined;
        }
        return storedThread;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        void vscode.window.showErrorMessage("Open a workspace file to select a Margin thread.");
        return undefined;
    }
    if (!isWorkspaceDocument(editor.document.uri, workspaceFolder)) {
        void vscode.window.showErrorMessage("Margin can only manage files in the current workspace.");
        return undefined;
    }
    const lineNumber = editor.selection.active.line + 1;
    const threads = provider.getThreadsForLocation(editor.document.uri, lineNumber);
    if (threads.length === 0) {
        void vscode.window.showErrorMessage(`No Margin thread found at line ${lineNumber}.`);
        return undefined;
    }
    if (threads.length === 1) {
        return threads[0];
    }
    const selected = await vscode.window.showQuickPick(threads.map((thread)=>({
            label: `${thread.file}:${thread.line}`,
            description: thread.resolved ? "resolved" : "open",
            detail: summarizeThread(thread.comments),
            thread
        })), {
        placeHolder: "Select a Margin thread"
    });
    return selected?.thread;
}
function summarizeThread(comments) {
    return comments.map((comment)=>`${comment.author}: ${comment.text}`).join(" | ").slice(0, 120);
}
function getDefaultAuthor() {
    return process.env.USER ?? process.env.USERNAME ?? "local";
}
function isWorkspaceDocument(uri, workspaceFolder) {
    if (uri.scheme !== "file") {
        return false;
    }
    const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    return relativePath.length > 0 && relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}
function toRelativeWorkspacePath(workspaceRoot, filePath) {
    return path.relative(workspaceRoot, filePath).split(path.sep).join("/");
}
function createAnchorFromDocument(document, anchorLineIndex) {
    const anchorLine = document.lineAt(anchorLineIndex).text;
    const contextBefore = collectDocumentLines(document, Math.max(0, anchorLineIndex - 3), anchorLineIndex);
    const contextAfter = collectDocumentLines(document, anchorLineIndex + 1, Math.min(document.lineCount, anchorLineIndex + 4));
    return {
        text: anchorLine,
        contextBefore,
        contextAfter
    };
}
function collectDocumentLines(document, startLineIndex, endLineIndex) {
    const lines = [];
    for(let lineIndex = startLineIndex; lineIndex < endLineIndex; lineIndex += 1){
        lines.push(document.lineAt(lineIndex).text);
    }
    return lines.join("\n");
}
async function installCliBinaries(context, workspaceRoot) {
    const targetDirectory = path.join(workspaceRoot, CLI_TEMPLATE_DIRECTORY);
    await mkdir(targetDirectory, {
        recursive: true
    });
    const results = await Promise.all([
        copyCliTemplate(path.join(context.extensionPath, CLI_TEMPLATE_DIRECTORY, CLI_SCRIPT_NAME), path.join(targetDirectory, CLI_SCRIPT_NAME), 0o755),
        copyCliTemplate(path.join(context.extensionPath, CLI_TEMPLATE_DIRECTORY, CLI_MODULE_NAME), path.join(targetDirectory, CLI_MODULE_NAME), 0o644)
    ]);
    return results.filter((result)=>result !== undefined);
}
async function copyCliTemplate(sourcePath, targetPath, mode) {
    const contents = await readFile(sourcePath, "utf8");
    let existingContents;
    try {
        existingContents = await readFile(targetPath, "utf8");
    } catch (error) {
        if (!isFileNotFoundError(error)) {
            throw error;
        }
    }
    if (existingContents === contents) {
        await chmod(targetPath, mode);
        return undefined;
    }
    await writeFile(targetPath, contents, {
        encoding: "utf8",
        mode
    });
    await chmod(targetPath, mode);
    return path.basename(targetPath);
}
async function updateGitExclude(workspaceRoot) {
    const excludePath = path.join(workspaceRoot, ".git", "info", "exclude");
    let rawContents;
    try {
        rawContents = await readFile(excludePath, "utf8");
    } catch (error) {
        if (isFileNotFoundError(error)) {
            throw new Error("Margin init requires a Git repository with .git/info/exclude.");
        }
        throw error;
    }
    const existingLines = rawContents.split(/\r?\n/);
    const addedPatterns = GIT_EXCLUDE_PATTERNS.filter((pattern)=>!existingLines.includes(pattern));
    if (addedPatterns.length === 0) {
        return [];
    }
    const nextContents = rawContents.endsWith("\n") ? rawContents : `${rawContents}\n`;
    await writeFile(excludePath, `${nextContents}${addedPatterns.join("\n")}\n`, "utf8");
    return addedPatterns;
}
function isFileNotFoundError(error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

module.exports = { activate, deactivate };
