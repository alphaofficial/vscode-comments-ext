import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import * as vscode from "vscode";

import { activate } from "../src/extension.ts";
import { MARGIN_SCHEMA_VERSION, readMarginData, writeMarginData } from "../src/store.ts";

const extensionRoot = fileURLToPath(new URL("..", import.meta.url));
const bundledCliScriptPath = path.join(extensionRoot, "assets", "cli", "margin");
const bundledCliModulePath = path.join(extensionRoot, "assets", "cli", "margin-cli.mjs");

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
      contextBefore: overrides.contextBefore ?? "",
      contextAfter: overrides.contextAfter ?? "",
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
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "margin-extension-"));

  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  return workspaceRoot;
}

test("activate loads stored threads, registers commands, and watcher refreshes", async (t) => {
  vscode.__reset();
  const workspaceRoot = await createWorkspaceRoot(t);
  const initialThread = createThread();
  const addedThread = createThread({
    id: "thread-2",
    file: "src/added.ts",
    line: 8,
    comments: [
      {
        id: "thread-2-comment-1",
        author: "reviewer",
        text: "New thread from file watcher.",
        timestamp: "2026-05-03T08:05:00.000Z",
      },
    ],
    timestamp: "2026-05-03T08:05:00.000Z",
  });

  await writeMarginData(workspaceRoot, {
    version: MARGIN_SCHEMA_VERSION,
    threads: [initialThread],
  });

  vscode.__setWorkspaceFolders([workspaceRoot]);
  const context = {
    extensionPath: extensionRoot,
    subscriptions: [],
  };

  t.after(() => {
    for (const subscription of context.subscriptions.reverse()) {
      subscription.dispose();
    }
  });

  await activate(context);

  assert.deepEqual(vscode.__getRegisteredCommands().sort(), [
    "margin.addReply",
    "margin.addThread",
    "margin.clear",
    "margin.deleteThread",
    "margin.init",
    "margin.reopen",
    "margin.resolve",
  ]);

  const controller = vscode.__getControllers().at(-1);
  assert.ok(controller);
  assert.equal(controller.createdThreads.length, 1);
  assert.equal(controller.createdThreads[0].label, "src/example.ts:3");

  const watcher = vscode.__getWatchers().at(-1);
  assert.ok(watcher);

  await writeMarginData(workspaceRoot, {
    version: MARGIN_SCHEMA_VERSION,
    threads: [initialThread, addedThread],
  });
  watcher.__fireChange();
  await delay(250);

  assert.equal(controller.createdThreads.length, 2);
  assert.equal(controller.createdThreads[1].label, "src/added.ts:8");
  assert.deepEqual(vscode.__getMessages().error, []);
});

test("autoInit setting initializes workspace on activation", async (t) => {
  vscode.__reset();
  const workspaceRoot = await createWorkspaceRoot(t);

  await mkdir(path.join(workspaceRoot, ".git", "info"), { recursive: true });
  await writeFile(path.join(workspaceRoot, ".git", "info", "exclude"), "", "utf8");
  await mkdir(path.join(workspaceRoot, ".vscode", "bin"), { recursive: true });
  await writeFile(path.join(workspaceRoot, ".vscode", "bin", "margin"), "#!/usr/bin/env node\n", "utf8");
  await writeFile(path.join(workspaceRoot, ".vscode", "bin", "margin-cli.mjs"), "export {};\n", "utf8");

  vscode.__setConfiguration("margin.autoInit", true);
  vscode.__setWorkspaceFolders([workspaceRoot]);
  const context = {
    extensionPath: extensionRoot,
    subscriptions: [],
  };

  t.after(() => {
    for (const subscription of context.subscriptions.reverse()) {
      subscription.dispose();
    }
  });

  await activate(context);

  assert.deepEqual(vscode.__getMessages().error, []);
  assert.ok(vscode.__getMessages().information.some((message) => message.startsWith("Margin initialized")));
  assert.equal(
    await readFile(path.join(workspaceRoot, ".vscode", "bin", "margin"), "utf8"),
    await readFile(bundledCliScriptPath, "utf8"),
  );
  assert.equal(
    await readFile(path.join(workspaceRoot, ".vscode", "bin", "margin-cli.mjs"), "utf8"),
    await readFile(bundledCliModulePath, "utf8"),
  );
});

test("clear command removes the selected stored and displayed thread", async (t) => {
  vscode.__reset();
  const workspaceRoot = await createWorkspaceRoot(t);
  const firstThread = createThread({ id: "thread-1", file: "src/one.ts", line: 1 });
  const secondThread = createThread({ id: "thread-2", file: "src/two.ts", line: 2 });

  await writeMarginData(workspaceRoot, {
    version: MARGIN_SCHEMA_VERSION,
    threads: [firstThread, secondThread],
  });

  vscode.__setWorkspaceFolders([workspaceRoot]);
  const context = {
    extensionPath: extensionRoot,
    subscriptions: [],
  };

  t.after(() => {
    for (const subscription of context.subscriptions.reverse()) {
      subscription.dispose();
    }
  });

  await activate(context);

  const controller = vscode.__getControllers().at(-1);
  assert.ok(controller);
  assert.equal(controller.createdThreads.length, 2);

  await vscode.commands.executeCommand("margin.clear", controller.createdThreads[0]);

  const marginData = await readMarginData(workspaceRoot);
  assert.deepEqual(marginData.threads, [secondThread]);
  assert.equal(controller.createdThreads[0].disposed, true);
  assert.equal(controller.createdThreads[1].disposed, false);
  assert.ok(vscode.__getMessages().information.includes("Margin thread cleared."));
});

test("activate refreshes existing workspace cli binaries from bundled assets", async (t) => {
  vscode.__reset();
  const workspaceRoot = await createWorkspaceRoot(t);

  await writeMarginData(workspaceRoot, {
    version: MARGIN_SCHEMA_VERSION,
    threads: [],
  });
  await mkdir(path.join(workspaceRoot, ".vscode", "bin"), { recursive: true });
  await writeFile(path.join(workspaceRoot, ".vscode", "bin", "margin"), "#!/usr/bin/env sh\nexit 1\n", "utf8");
  await writeFile(path.join(workspaceRoot, ".vscode", "bin", "margin-cli.mjs"), "throw new Error('stale');\n", "utf8");

  vscode.__setWorkspaceFolders([workspaceRoot]);
  const context = {
    extensionPath: extensionRoot,
    subscriptions: [],
  };

  t.after(() => {
    for (const subscription of context.subscriptions.reverse()) {
      subscription.dispose();
    }
  });

  await activate(context);

  assert.equal(
    await readFile(path.join(workspaceRoot, ".vscode", "bin", "margin"), "utf8"),
    await readFile(bundledCliScriptPath, "utf8"),
  );
  assert.equal(
    await readFile(path.join(workspaceRoot, ".vscode", "bin", "margin-cli.mjs"), "utf8"),
    await readFile(bundledCliModulePath, "utf8"),
  );
});
