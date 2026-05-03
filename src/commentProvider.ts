import * as path from "node:path";

import * as vscode from "vscode";

import { ensureMarginDataFile, readMarginData } from "./store";
import type { Comment as MarginCommentData, Thread as MarginThreadData } from "./types";

const COMMENT_CONTROLLER_ID = "margin";
const COMMENT_CONTROLLER_LABEL = "Margin";
const COMMENT_CONTEXT_VALUE = "margin.comment";
const THREAD_CONTEXT_VALUE_PREFIX = "margin.thread";

export class CommentThreadProvider implements vscode.Disposable {
  private readonly controller: vscode.CommentController;
  private readonly commentThreads = new Map<string, vscode.CommentThread>();
  private readonly storedThreads = new Map<string, MarginThreadData>();
  private readonly threadIds = new WeakMap<vscode.CommentThread, string>();

  constructor(private readonly workspaceRoot: string) {
    this.controller = vscode.comments.createCommentController(
      COMMENT_CONTROLLER_ID,
      COMMENT_CONTROLLER_LABEL,
    );
  }

  async initialize(): Promise<void> {
    await ensureMarginDataFile(this.workspaceRoot);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const marginData = await readMarginData(this.workspaceRoot);
    const nextIds = new Set(marginData.threads.map((thread) => thread.id));

    this.storedThreads.clear();

    for (const storedThread of marginData.threads) {
      this.storedThreads.set(storedThread.id, storedThread);
      this.upsertThread(storedThread);
    }

    for (const [threadId, thread] of this.commentThreads) {
      if (nextIds.has(threadId)) {
        continue;
      }

      thread.dispose();
      this.commentThreads.delete(threadId);
      this.storedThreads.delete(threadId);
    }
  }

  getCommentThread(threadId: string): vscode.CommentThread | undefined {
    return this.commentThreads.get(threadId);
  }

  getStoredThread(threadId: string): MarginThreadData | undefined {
    return this.storedThreads.get(threadId);
  }

  getThreadId(thread: vscode.CommentThread): string | undefined {
    return this.threadIds.get(thread);
  }

  getThreadsForLocation(uri: vscode.Uri, lineNumber: number): MarginThreadData[] {
    return Array.from(this.storedThreads.values()).filter((thread) => {
      const threadPath = path.join(this.workspaceRoot, thread.file);
      return thread.line === lineNumber && path.normalize(threadPath) === path.normalize(uri.fsPath);
    });
  }

  dispose(): void {
    for (const thread of this.commentThreads.values()) {
      thread.dispose();
    }

    this.commentThreads.clear();
    this.storedThreads.clear();
    this.controller.dispose();
  }

  private upsertThread(storedThread: MarginThreadData): void {
    const range = createThreadRange(storedThread.line);
    const comments = storedThread.comments.map((comment) => createComment(comment));
    const uri = vscode.Uri.file(path.join(this.workspaceRoot, storedThread.file));
    const state = storedThread.resolved
      ? vscode.CommentThreadState.Resolved
      : vscode.CommentThreadState.Unresolved;
    const label = `${storedThread.file}:${storedThread.line}`;

    const existingThread = this.commentThreads.get(storedThread.id);

    if (existingThread) {
      if (existingThread.uri.fsPath !== uri.fsPath) {
        existingThread.dispose();
        this.commentThreads.delete(storedThread.id);
        this.createThread(storedThread, uri, range, comments, state, label);
        return;
      }

      existingThread.range = range;
      existingThread.comments = comments;
      existingThread.state = state;
      existingThread.label = label;
      existingThread.canReply = false;
      existingThread.contextValue = createThreadContextValue(storedThread);
      return;
    }

    this.createThread(storedThread, uri, range, comments, state, label);
  }

  private createThread(
    storedThread: MarginThreadData,
    uri: vscode.Uri,
    range: vscode.Range,
    comments: vscode.Comment[],
    state: vscode.CommentThreadState,
    label: string,
  ): void {
    const thread = this.controller.createCommentThread(uri, range, comments);
    thread.state = state;
    thread.label = label;
    thread.canReply = false;
    thread.contextValue = createThreadContextValue(storedThread);

    this.commentThreads.set(storedThread.id, thread);
    this.threadIds.set(thread, storedThread.id);
  }
}

function createThreadRange(lineNumber: number): vscode.Range {
  const zeroBasedLine = Math.max(lineNumber - 1, 0);

  return new vscode.Range(zeroBasedLine, 0, zeroBasedLine, 0);
}

function createComment(comment: MarginCommentData): vscode.Comment {
  return {
    author: { name: comment.author },
    body: comment.text,
    contextValue: COMMENT_CONTEXT_VALUE,
    label: comment.timestamp,
    mode: vscode.CommentMode.Preview,
  };
}

function createThreadContextValue(thread: MarginThreadData): string {
  return `${THREAD_CONTEXT_VALUE_PREFIX}.${thread.resolved ? "resolved" : "unresolved"}`;
}
