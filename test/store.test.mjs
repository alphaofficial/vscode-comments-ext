import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  MARGIN_DIRECTORY,
  MARGIN_FILE_NAME,
  MARGIN_SCHEMA_VERSION,
  createDefaultMarginData,
  ensureMarginDataFile,
  getMarginFilePath,
  readMarginData,
  writeMarginData,
} from "../src/store.ts";

function sampleMarginData() {
  return {
    version: MARGIN_SCHEMA_VERSION,
    threads: [
      {
        id: "thread-1",
        file: "src/example.ts",
        line: 3,
        anchor: {
          text: "const value = 1;",
          contextBefore: "export function demo() {",
          contextAfter: "return value;",
        },
        comments: [
          {
            id: "comment-1",
            author: "agent",
            text: "Check this branch.",
            timestamp: "2026-05-03T07:00:00.000Z",
          },
        ],
        resolved: false,
        createdAt: "2026-05-03T07:00:00.000Z",
        updatedAt: "2026-05-03T07:00:00.000Z",
      },
    ],
  };
}

async function createWorkspaceRoot(t) {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "margin-store-"));
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  return workspaceRoot;
}

test("createDefaultMarginData returns a fresh empty document", () => {
  const first = createDefaultMarginData();
  const second = createDefaultMarginData();

  assert.deepEqual(first, {
    version: MARGIN_SCHEMA_VERSION,
    threads: [],
  });

  first.threads.push(sampleMarginData().threads[0]);
  assert.deepEqual(second.threads, []);
});

test("getMarginFilePath points to the workspace margin.json file", () => {
  const workspaceRoot = path.join("/tmp", "workspace");

  assert.equal(
    getMarginFilePath(workspaceRoot),
    path.join(workspaceRoot, MARGIN_DIRECTORY, MARGIN_FILE_NAME),
  );
});

test("writeMarginData persists pretty-printed data that readMarginData round-trips", async (t) => {
  const workspaceRoot = await createWorkspaceRoot(t);
  const expected = sampleMarginData();

  await writeMarginData(workspaceRoot, expected);

  const filePath = getMarginFilePath(workspaceRoot);
  const raw = await readFile(filePath, "utf8");

  assert.match(raw, /\n$/);
  assert.deepEqual(JSON.parse(raw), expected);
  assert.deepEqual(await readMarginData(workspaceRoot), expected);
});

test("ensureMarginDataFile creates a default file when one does not exist", async (t) => {
  const workspaceRoot = await createWorkspaceRoot(t);

  const data = await ensureMarginDataFile(workspaceRoot);

  assert.deepEqual(data, createDefaultMarginData());
  assert.deepEqual(await readMarginData(workspaceRoot), createDefaultMarginData());
});

test("ensureMarginDataFile preserves an existing margin.json file", async (t) => {
  const workspaceRoot = await createWorkspaceRoot(t);
  const expected = sampleMarginData();

  await writeMarginData(workspaceRoot, expected);

  assert.deepEqual(await ensureMarginDataFile(workspaceRoot), expected);
});

test("readMarginData rejects unsupported schema versions", async (t) => {
  const workspaceRoot = await createWorkspaceRoot(t);

  await writeMarginData(workspaceRoot, createDefaultMarginData());

  const filePath = getMarginFilePath(workspaceRoot);
  const invalid = {
    version: 999,
    threads: [],
  };

  await writeFile(filePath, `${JSON.stringify(invalid)}\n`, "utf8");

  await assert.rejects(
    readMarginData(workspaceRoot),
    /must use schema version 1/,
  );
});

test("writeMarginData rejects malformed data before writing", async (t) => {
  const workspaceRoot = await createWorkspaceRoot(t);

  await assert.rejects(
    writeMarginData(workspaceRoot, {
      version: MARGIN_SCHEMA_VERSION,
    }),
    /must include a threads array/,
  );
});
