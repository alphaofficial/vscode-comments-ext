import { randomUUID } from "node:crypto";
import * as path from "node:path";

import * as vscode from "vscode";

import { CommentThreadProvider } from "./commentProvider";
import { readMarginData, writeMarginData } from "./store";
import type { Comment, MarginData, Thread } from "./types";

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
  context.subscriptions.push(
    vscode.commands.registerCommand("margin.addThread", async () => {
      await addThread(provider, workspaceFolder);
    }),
    vscode.commands.registerCommand(
      "margin.addReply",
      async (commentThread?: vscode.CommentThread) => {
        await addReply(provider, workspaceFolder, commentThread);
      },
    ),
    vscode.commands.registerCommand(
      "margin.resolve",
      async (commentThread?: vscode.CommentThread) => {
        await updateThreadResolution(provider, workspaceFolder, commentThread, true);
      },
    ),
    vscode.commands.registerCommand(
      "margin.reopen",
      async (commentThread?: vscode.CommentThread) => {
        await updateThreadResolution(provider, workspaceFolder, commentThread, false);
      },
    ),
    vscode.commands.registerCommand(
      "margin.deleteThread",
      async (commentThread?: vscode.CommentThread) => {
        await deleteThread(provider, workspaceFolder, commentThread);
      },
    ),
  );

  try {
    await provider.initialize();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while loading comments.";

    void vscode.window.showErrorMessage(`Margin failed to initialize: ${message}`);
  }
}

export function deactivate(): void {}

async function addThread(
  provider: CommentThreadProvider,
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<void> {
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

  marginData.threads.push({
    id: randomUUID(),
    file: toRelativeWorkspacePath(workspaceFolder.uri.fsPath, editor.document.uri.fsPath),
    line: editor.selection.active.line + 1,
    anchor: {
      text: "",
      contextBefore: "",
      contextAfter: "",
    },
    comments: [
      {
        id: randomUUID(),
        author: commentInput.author,
        text: commentInput.text,
        timestamp,
      },
    ],
    resolved: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await persistMarginData(workspaceFolder.uri.fsPath, marginData, provider);
  void vscode.window.showInformationMessage("Margin thread added.");
}

async function addReply(
  provider: CommentThreadProvider,
  workspaceFolder: vscode.WorkspaceFolder,
  commentThread?: vscode.CommentThread,
): Promise<void> {
  const storedThread = await resolveTargetThread(provider, workspaceFolder, commentThread);

  if (!storedThread) {
    return;
  }

  const commentInput = await promptForComment("Reply to Margin thread");

  if (!commentInput) {
    return;
  }

  const timestamp = new Date().toISOString();

  await mutateThread(workspaceFolder.uri.fsPath, storedThread.id, provider, (thread) => {
    thread.comments.push({
      id: randomUUID(),
      author: commentInput.author,
      text: commentInput.text,
      timestamp,
    });
    thread.updatedAt = timestamp;
  });

  void vscode.window.showInformationMessage("Margin reply added.");
}

async function updateThreadResolution(
  provider: CommentThreadProvider,
  workspaceFolder: vscode.WorkspaceFolder,
  commentThread: vscode.CommentThread | undefined,
  resolved: boolean,
): Promise<void> {
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

  await mutateThread(workspaceFolder.uri.fsPath, storedThread.id, provider, (thread) => {
    thread.resolved = resolved;
    thread.updatedAt = timestamp;
  });

  void vscode.window.showInformationMessage(
    resolved ? "Margin thread resolved." : "Margin thread reopened.",
  );
}

async function deleteThread(
  provider: CommentThreadProvider,
  workspaceFolder: vscode.WorkspaceFolder,
  commentThread?: vscode.CommentThread,
): Promise<void> {
  const storedThread = await resolveTargetThread(provider, workspaceFolder, commentThread);

  if (!storedThread) {
    return;
  }

  const confirmation = await vscode.window.showWarningMessage(
    `Delete Margin thread at ${storedThread.file}:${storedThread.line}?`,
    { modal: true },
    "Delete",
  );

  if (confirmation !== "Delete") {
    return;
  }

  const marginData = await readMarginData(workspaceFolder.uri.fsPath);
  const nextThreads = marginData.threads.filter((thread) => thread.id !== storedThread.id);

  if (nextThreads.length === marginData.threads.length) {
    throw new Error(`Margin thread ${storedThread.id} no longer exists.`);
  }

  marginData.threads = nextThreads;
  await persistMarginData(workspaceFolder.uri.fsPath, marginData, provider);
  void vscode.window.showInformationMessage("Margin thread deleted.");
}

async function mutateThread(
  workspaceRoot: string,
  threadId: string,
  provider: CommentThreadProvider,
  mutate: (thread: Thread) => void,
): Promise<void> {
  const marginData = await readMarginData(workspaceRoot);
  const thread = marginData.threads.find((candidate) => candidate.id === threadId);

  if (!thread) {
    throw new Error(`Margin thread ${threadId} no longer exists.`);
  }

  mutate(thread);
  await persistMarginData(workspaceRoot, marginData, provider);
}

async function persistMarginData(
  workspaceRoot: string,
  marginData: MarginData,
  provider: CommentThreadProvider,
): Promise<void> {
  try {
    await writeMarginData(workspaceRoot, marginData);
    await provider.refresh();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while updating comments.";
    void vscode.window.showErrorMessage(`Margin update failed: ${message}`);
    throw error;
  }
}

async function promptForComment(
  title: string,
): Promise<{ author: string; text: string } | undefined> {
  const author = await vscode.window.showInputBox({
    prompt: `${title}: author`,
    placeHolder: "Author name",
    value: getDefaultAuthor(),
    validateInput: (value) => {
      return value.trim().length === 0 ? "Author is required." : undefined;
    },
  });

  if (author === undefined) {
    return undefined;
  }

  const text = await vscode.window.showInputBox({
    prompt: `${title}: comment`,
    placeHolder: "Comment text",
    validateInput: (value) => {
      return value.trim().length === 0 ? "Comment text is required." : undefined;
    },
  });

  if (text === undefined) {
    return undefined;
  }

  return {
    author: author.trim(),
    text: text.trim(),
  };
}

async function resolveTargetThread(
  provider: CommentThreadProvider,
  workspaceFolder: vscode.WorkspaceFolder,
  explicitThread?: vscode.CommentThread,
): Promise<Thread | undefined> {
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

  const selected = await vscode.window.showQuickPick(
    threads.map((thread) => ({
      label: `${thread.file}:${thread.line}`,
      description: thread.resolved ? "resolved" : "open",
      detail: summarizeThread(thread.comments),
      thread,
    })),
    {
      placeHolder: "Select a Margin thread",
    },
  );

  return selected?.thread;
}

function summarizeThread(comments: Comment[]): string {
  return comments
    .map((comment) => `${comment.author}: ${comment.text}`)
    .join(" | ")
    .slice(0, 120);
}

function getDefaultAuthor(): string {
  return process.env.USER ?? process.env.USERNAME ?? "local";
}

function isWorkspaceDocument(
  uri: vscode.Uri,
  workspaceFolder: vscode.WorkspaceFolder,
): boolean {
  if (uri.scheme !== "file") {
    return false;
  }

  const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
  return (
    relativePath.length > 0 &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function toRelativeWorkspacePath(workspaceRoot: string, filePath: string): string {
  return path.relative(workspaceRoot, filePath).split(path.sep).join("/");
}
