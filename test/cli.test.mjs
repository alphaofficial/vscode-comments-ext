import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const cliSourcePath = new URL("../.vscode/bin/margin-cli.mjs", import.meta.url);

async function createWorkspaceRoot(t) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "margin-cli-"));

  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  return workspaceRoot;
}

async function installCli(workspaceRoot) {
  const cliDirectory = path.join(workspaceRoot, ".vscode", "bin");
  const cliScript = await readFile(cliSourcePath, "utf8");

  await mkdir(cliDirectory, { recursive: true });
  await writeFile(path.join(cliDirectory, "margin-cli.mjs"), cliScript, "utf8");
}

async function writeSourceFile(workspaceRoot, relativePath, contents) {
  const filePath = path.join(workspaceRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

async function readMarginData(workspaceRoot) {
  const filePath = path.join(workspaceRoot, ".vscode", "margin.json");
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function runCli(workspaceRoot, args, options = {}) {
  const commandArgs = [path.join(workspaceRoot, ".vscode", "bin", "margin-cli.mjs"), ...args];

  try {
    return await execFile(process.execPath, commandArgs, {
      cwd: workspaceRoot,
      timeout: 10_000,
    });
  } catch (error) {
    if (!options.expectFailure) {
      throw error;
    }

    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      code: error.code,
    };
  }
}

test("add creates a thread with captured anchor context", async (t) => {
  const workspaceRoot = await createWorkspaceRoot(t);
  await installCli(workspaceRoot);
  await writeSourceFile(
    workspaceRoot,
    "src/example.ts",
    [
      "export function demo() {",
      "  const alpha = 1;",
      "  const beta = 2;",
      "  return alpha + beta;",
      "}",
      "",
    ].join("\n"),
  );

  const result = await runCli(workspaceRoot, [
    "add",
    "src/example.ts",
    "3",
    "--author",
    "agent",
    "--text",
    "Check the beta value.",
  ]);
  const marginData = await readMarginData(workspaceRoot);

  assert.match(result.stdout, /Added Margin thread .* at src\/example\.ts:3\./);
  assert.equal(marginData.version, 1);
  assert.equal(marginData.threads.length, 1);

  const [thread] = marginData.threads;
  assert.equal(thread.file, "src/example.ts");
  assert.equal(thread.line, 3);
  assert.deepEqual(thread.anchor, {
    text: "  const beta = 2;",
    contextBefore: "export function demo() {\n  const alpha = 1;",
    contextAfter: "  return alpha + beta;\n}",
  });
  assert.equal(thread.resolved, false);
  assert.equal(thread.comments.length, 1);
  assert.equal(thread.comments[0].author, "agent");
  assert.equal(thread.comments[0].text, "Check the beta value.");
  assert.equal(thread.createdAt, thread.comments[0].timestamp);
  assert.equal(thread.updatedAt, thread.comments[0].timestamp);
  assert.ok(thread.id);
  assert.ok(thread.comments[0].id);
});

test("add supports --no-context and reply/resolve/reopen/delete update the same thread", async (t) => {
  const workspaceRoot = await createWorkspaceRoot(t);
  await installCli(workspaceRoot);
  await writeSourceFile(
    workspaceRoot,
    "src/example.ts",
    ["const first = 1;", "const second = 2;", ""].join("\n"),
  );

  await runCli(workspaceRoot, [
    "add",
    "src/example.ts",
    "2",
    "--author",
    "agent",
    "--text",
    "Initial note.",
    "--no-context",
  ]);

  let marginData = await readMarginData(workspaceRoot);
  const [thread] = marginData.threads;

  assert.deepEqual(thread.anchor, {
    text: "",
    contextBefore: "",
    contextAfter: "",
  });

  const replyResult = await runCli(workspaceRoot, [
    "reply",
    thread.id,
    "--author",
    "reviewer",
    "--text",
    "Follow up.",
  ]);
  assert.match(replyResult.stdout, new RegExp(`Added reply to Margin thread ${thread.id}\\.`));

  marginData = await readMarginData(workspaceRoot);
  assert.equal(marginData.threads[0].comments.length, 2);
  assert.equal(marginData.threads[0].comments[1].author, "reviewer");
  assert.equal(marginData.threads[0].comments[1].text, "Follow up.");
  assert.notEqual(marginData.threads[0].updatedAt, thread.updatedAt);

  const resolveResult = await runCli(workspaceRoot, [
    "resolve",
    thread.id,
    "--author",
    "reviewer",
  ]);
  assert.match(resolveResult.stdout, new RegExp(`Resolved Margin thread ${thread.id}\\.`));

  marginData = await readMarginData(workspaceRoot);
  assert.equal(marginData.threads[0].resolved, true);

  const reopenResult = await runCli(workspaceRoot, [
    "reopen",
    thread.id,
    "--author",
    "reviewer",
  ]);
  assert.match(reopenResult.stdout, new RegExp(`Reopened Margin thread ${thread.id}\\.`));

  marginData = await readMarginData(workspaceRoot);
  assert.equal(marginData.threads[0].resolved, false);

  const deleteResult = await runCli(workspaceRoot, [
    "delete",
    thread.id,
    "--author",
    "reviewer",
  ]);
  assert.match(deleteResult.stdout, new RegExp(`Deleted Margin thread ${thread.id}\\.`));

  marginData = await readMarginData(workspaceRoot);
  assert.deepEqual(marginData.threads, []);
});

test("CLI reports validation and lookup failures without writing invalid data", async (t) => {
  const workspaceRoot = await createWorkspaceRoot(t);
  await installCli(workspaceRoot);
  await writeSourceFile(workspaceRoot, "src/example.ts", "const onlyLine = 1;\n");

  const invalidLineResult = await runCli(
    workspaceRoot,
    [
      "add",
      "src/example.ts",
      "5",
      "--author",
      "agent",
      "--text",
      "Out of range.",
    ],
    { expectFailure: true },
  );

  assert.equal(invalidLineResult.code, 1);
  assert.match(invalidLineResult.stderr, /Line 5 is outside src\/example\.ts \(1 lines\)\./);
  await assert.rejects(access(path.join(workspaceRoot, ".vscode", "margin.json")));

  const missingThreadResult = await runCli(
    workspaceRoot,
    [
      "reply",
      "missing-thread",
      "--author",
      "agent",
      "--text",
      "Reply.",
    ],
    { expectFailure: true },
  );

  assert.equal(missingThreadResult.code, 1);
  assert.match(missingThreadResult.stderr, /Margin thread missing-thread does not exist\./);

  const marginData = await readMarginData(workspaceRoot);
  assert.deepEqual(marginData, {
    version: 1,
    threads: [],
  });
});
