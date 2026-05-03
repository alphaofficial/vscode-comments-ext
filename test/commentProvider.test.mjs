import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import * as vscode from "vscode";

import { CommentThreadProvider } from "../src/commentProvider.ts";
import {
  MARGIN_SCHEMA_VERSION,
  createDefaultMarginData,
  getMarginFilePath,
  writeMarginData,
} from "../src/store.ts";

function createThread(overrides = {}) {
  const id = overrides.id ?? "thread-1";
  const line = overrides.line ?? 3;
  const file = overrides.file ?? "src/example.ts";
  const timestamp = overrides.timestamp ?? "2026-05-03T08:00:00.000Z";

  return {
    id,
    file,
    line,
    anchor: {
      text: overrides.anchorText ?? "const value = 1;",
      contextBefore: overrides.contextBefore ?? "export function demo() {",
      contextAfter: overrides.contextAfter ?? "return value;",
    },
    comments: overrides.comments ?? [
      {
        id: `${id}-comment-1`,
        author: "agent",
        text: "Check this branch.",
        timestamp,
      },
    ],
    resolved: overrides.resolved ?? false,
    createdAt: timestamp,
    updatedAt: overrides.updatedAt ?? timestamp,
  };
}

async function createWorkspaceRoot(t) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "margin-provider-"));

  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  return workspaceRoot;
}

test("initialize creates the margin data file for an empty workspace", async (t) => {
  vscode.__reset();
  const workspaceRoot = await createWorkspaceRoot(t);
  const provider = new CommentThreadProvider(workspaceRoot);

  t.after(() => {
    provider.dispose();
  });

  await provider.initialize();

  assert.equal(provider.getCommentThread("missing-thread"), undefined);
  const filePath = getMarginFilePath(workspaceRoot);
  assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), createDefaultMarginData());
});

test("refresh loads stored threads into VS Code comment threads", async (t) => {
  vscode.__reset();
  const workspaceRoot = await createWorkspaceRoot(t);
  const threadData = createThread();
  const provider = new CommentThreadProvider(workspaceRoot);

  t.after(() => {
    provider.dispose();
  });

  await writeMarginData(workspaceRoot, {
    version: MARGIN_SCHEMA_VERSION,
    threads: [threadData],
  });

  await provider.refresh();

  const thread = provider.getCommentThread(threadData.id);

  assert.ok(thread);
  assert.deepEqual(provider.getStoredThread(threadData.id), threadData);
  assert.equal(provider.getThreadId(thread), threadData.id);
  assert.equal(thread.uri.fsPath, path.join(workspaceRoot, threadData.file));
  assert.equal(thread.range.start.line, threadData.line - 1);
  assert.equal(thread.range.start.character, 0);
  assert.equal(thread.label, `${threadData.file}:${threadData.line}`);
  assert.equal(thread.canReply, false);
  assert.equal(thread.state, vscode.CommentThreadState.Unresolved);
  assert.equal(thread.contextValue, "margin.thread.unresolved");
  assert.deepEqual(thread.comments, [
    {
      author: { name: "agent" },
      body: "Check this branch.",
      contextValue: "margin.comment",
      label: "2026-05-03T08:00:00.000Z",
      mode: vscode.CommentMode.Preview,
    },
  ]);
});

test("refresh updates in place for same-file threads and recreates moved threads", async (t) => {
  vscode.__reset();
  const workspaceRoot = await createWorkspaceRoot(t);
  const originalThread = createThread({
    id: "thread-1",
    file: "src/original.ts",
    line: 2,
  });
  const movedThread = createThread({
    id: "thread-2",
    file: "src/before.ts",
    line: 7,
  });
  const provider = new CommentThreadProvider(workspaceRoot);

  t.after(() => {
    provider.dispose();
  });

  await writeMarginData(workspaceRoot, {
    version: MARGIN_SCHEMA_VERSION,
    threads: [originalThread, movedThread],
  });
  await provider.refresh();

  const originalCommentThread = provider.getCommentThread(originalThread.id);
  const movedCommentThread = provider.getCommentThread(movedThread.id);

  assert.ok(originalCommentThread);
  assert.ok(movedCommentThread);

  const updatedOriginal = createThread({
    id: "thread-1",
    file: "src/original.ts",
    line: 5,
    resolved: true,
    comments: [
      originalThread.comments[0],
      {
        id: "thread-1-comment-2",
        author: "reviewer",
        text: "Follow-up note.",
        timestamp: "2026-05-03T08:05:00.000Z",
      },
    ],
    updatedAt: "2026-05-03T08:05:00.000Z",
  });
  const movedReplacement = createThread({
    id: "thread-2",
    file: "src/after.ts",
    line: 9,
  });

  await writeMarginData(workspaceRoot, {
    version: MARGIN_SCHEMA_VERSION,
    threads: [updatedOriginal, movedReplacement],
  });
  await provider.refresh();

  const refreshedOriginal = provider.getCommentThread(updatedOriginal.id);
  const refreshedMoved = provider.getCommentThread(movedReplacement.id);

  assert.equal(refreshedOriginal, originalCommentThread);
  assert.equal(refreshedOriginal.range.start.line, updatedOriginal.line - 1);
  assert.equal(refreshedOriginal.state, vscode.CommentThreadState.Resolved);
  assert.equal(refreshedOriginal.contextValue, "margin.thread.resolved");
  assert.equal(refreshedOriginal.comments.length, 2);

  assert.ok(refreshedMoved);
  assert.notEqual(refreshedMoved, movedCommentThread);
  assert.equal(movedCommentThread.disposed, true);
  assert.equal(refreshedMoved.uri.fsPath, path.join(workspaceRoot, movedReplacement.file));
});

test("refresh removes deleted threads, location lookup filters correctly, and dispose cleans up", async (t) => {
  vscode.__reset();
  const workspaceRoot = await createWorkspaceRoot(t);
  const keptThread = createThread({
    id: "thread-keep",
    file: "src/example.ts",
    line: 4,
  });
  const removedThread = createThread({
    id: "thread-remove",
    file: "src/other.ts",
    line: 4,
  });
  const provider = new CommentThreadProvider(workspaceRoot);

  await writeMarginData(workspaceRoot, {
    version: MARGIN_SCHEMA_VERSION,
    threads: [keptThread, removedThread],
  });
  await provider.refresh();

  const removedCommentThread = provider.getCommentThread(removedThread.id);
  assert.ok(removedCommentThread);

  await writeMarginData(workspaceRoot, {
    version: MARGIN_SCHEMA_VERSION,
    threads: [keptThread],
  });
  await provider.refresh();

  assert.equal(provider.getCommentThread(removedThread.id), undefined);
  assert.equal(removedCommentThread.disposed, true);
  assert.deepEqual(
    provider.getThreadsForLocation(vscode.Uri.file(path.join(workspaceRoot, keptThread.file)), 4),
    [keptThread],
  );
  assert.deepEqual(
    provider.getThreadsForLocation(vscode.Uri.file(path.join(workspaceRoot, keptThread.file)), 99),
    [],
  );

  const controller = vscode.__getControllers().at(-1);
  provider.dispose();

  assert.equal(controller.disposed, true);
  assert.equal(provider.getCommentThread(keptThread.id), undefined);
  assert.equal(provider.getStoredThread(keptThread.id), undefined);
});
