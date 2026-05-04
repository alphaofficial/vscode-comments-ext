#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const MARGIN_SCHEMA_VERSION = 1;
const MARGIN_DIRECTORY = ".vscode";
const MARGIN_FILE_NAME = "margin.json";
const DEFAULT_MARGIN_DATA = {
  version: MARGIN_SCHEMA_VERSION,
  threads: [],
};

async function main() {
  try {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === "--help" || command === "-h") {
      printUsage();
      process.exit(command ? 0 : 1);
    }

    switch (command) {
      case "add":
        await handleAdd(args.slice(1));
        return;
      case "reply":
        await handleReply(args.slice(1));
        return;
      case "resolve":
        await handleResolutionUpdate(args.slice(1), true);
        return;
      case "reopen":
        await handleResolutionUpdate(args.slice(1), false);
        return;
      case "delete":
        await handleDelete(args.slice(1));
        return;
      case "clear":
        await handleClear(args.slice(1));
        return;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function handleAdd(args) {
  if (args.length < 2) {
    throw new Error("Usage: margin add <file> <line> [--author <name>] --text <content> [--no-context]");
  }

  const [fileArg, lineArg, ...optionArgs] = args;
  const options = parseOptions(optionArgs, {
    required: ["text"],
    boolean: ["no-context"],
  });
  const author = readAuthorOption(options);
  const { text } = options;
  const line = parseLineNumber(lineArg);
  const workspaceRoot = getWorkspaceRoot();
  const filePath = resolveWorkspaceFile(workspaceRoot, fileArg);
  const sourceLines = await readWorkspaceFileLines(filePath);
  assertLineExists(sourceLines, line, fileArg);
  const marginData = await ensureMarginDataFile(workspaceRoot);
  const timestamp = new Date().toISOString();

  marginData.threads.push({
    id: randomUUID(),
    file: toRelativeWorkspacePath(workspaceRoot, filePath),
    line,
    anchor: options["no-context"] ? createEmptyAnchor() : createAnchorFromLines(sourceLines, line),
    comments: [
      {
        id: randomUUID(),
        author,
        text,
        timestamp,
      },
    ],
    resolved: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await writeMarginData(workspaceRoot, marginData);
  const createdThread = marginData.threads.at(-1);
  console.log(`Added Margin thread ${createdThread.id} at ${createdThread.file}:${createdThread.line}.`);
}

async function handleReply(args) {
  if (args.length < 1) {
    throw new Error("Usage: margin reply <thread-id> [--author <name>] --text <content>");
  }

  const [threadId, ...optionArgs] = args;
  const options = parseOptions(optionArgs, {
    required: ["text"],
  });
  const author = readAuthorOption(options);
  const { text } = options;
  const workspaceRoot = getWorkspaceRoot();
  const marginData = await ensureMarginDataFile(workspaceRoot);
  const thread = findThread(marginData, threadId);
  const timestamp = new Date().toISOString();

  thread.comments.push({
    id: randomUUID(),
    author,
    text,
    timestamp,
  });
  thread.updatedAt = timestamp;

  await writeMarginData(workspaceRoot, marginData);
  console.log(`Added reply to Margin thread ${thread.id}.`);
}

async function handleResolutionUpdate(args, resolved) {
  if (args.length < 1) {
    throw new Error(
      `Usage: margin ${resolved ? "resolve" : "reopen"} <thread-id> [--author <name>]`,
    );
  }

  const [threadId, ...optionArgs] = args;
  parseOptions(optionArgs, {});

  const workspaceRoot = getWorkspaceRoot();
  const marginData = await ensureMarginDataFile(workspaceRoot);
  const thread = findThread(marginData, threadId);

  if (thread.resolved === resolved) {
    console.log(
      resolved
        ? `Margin thread ${thread.id} is already resolved.`
        : `Margin thread ${thread.id} is already open.`,
    );
    return;
  }

  thread.resolved = resolved;
  thread.updatedAt = new Date().toISOString();

  await writeMarginData(workspaceRoot, marginData);
  console.log(
    resolved ? `Resolved Margin thread ${thread.id}.` : `Reopened Margin thread ${thread.id}.`,
  );
}

async function handleDelete(args) {
  if (args.length < 1) {
    throw new Error("Usage: margin delete <thread-id> [--author <name>]");
  }

  const [threadId, ...optionArgs] = args;
  parseOptions(optionArgs, {});

  const workspaceRoot = getWorkspaceRoot();
  const marginData = await ensureMarginDataFile(workspaceRoot);
  const index = marginData.threads.findIndex((thread) => thread.id === threadId);

  if (index === -1) {
    throw new Error(`Margin thread ${threadId} does not exist.`);
  }

  const [deletedThread] = marginData.threads.splice(index, 1);
  await writeMarginData(workspaceRoot, marginData);
  console.log(`Deleted Margin thread ${deletedThread.id}.`);
}

async function handleClear(args) {
  if (args.length < 1) {
    throw new Error("Usage: margin clear <thread-id> [--author <name>]");
  }

  const [threadId, ...optionArgs] = args;
  parseOptions(optionArgs, {});

  const workspaceRoot = getWorkspaceRoot();
  const marginData = await ensureMarginDataFile(workspaceRoot);
  const index = marginData.threads.findIndex((thread) => thread.id === threadId);

  if (index === -1) {
    throw new Error(`Margin thread ${threadId} does not exist.`);
  }

  const [clearedThread] = marginData.threads.splice(index, 1);
  await writeMarginData(workspaceRoot, marginData);
  console.log(`Cleared Margin thread ${clearedThread.id}.`);
}

function parseOptions(args, config) {
  const options = {};
  const booleanOptions = new Set(config.boolean ?? []);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    const key = argument.slice(2);

    if (booleanOptions.has(key)) {
      options[key] = true;
      continue;
    }

    const value = args[index + 1];

    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Option --${key} requires a value.`);
    }

    options[key] = value.trim();
    index += 1;
  }

  for (const requiredKey of config.required ?? []) {
    if (typeof options[requiredKey] !== "string" || options[requiredKey].length === 0) {
      throw new Error(`Option --${requiredKey} is required.`);
    }
  }

  return options;
}

function parseLineNumber(value) {
  const line = Number.parseInt(value, 10);

  if (!Number.isInteger(line) || line < 1) {
    throw new Error(`Line must be a positive integer. Received: ${value}`);
  }

  return line;
}

function readAuthorOption(options) {
  return typeof options.author === "string" && options.author.length > 0 ? options.author : getDefaultAuthor();
}

function findThread(marginData, threadId) {
  const thread = marginData.threads.find((candidate) => candidate.id === threadId);

  if (!thread) {
    throw new Error(`Margin thread ${threadId} does not exist.`);
  }

  return thread;
}

function getWorkspaceRoot() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDirectory, "..", "..");
}

function resolveWorkspaceFile(workspaceRoot, fileArg) {
  const filePath = path.resolve(process.cwd(), fileArg);
  const relativePath = path.relative(workspaceRoot, filePath);

  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`File must be inside the current workspace: ${fileArg}`);
  }

  return filePath;
}

async function readWorkspaceFileLines(filePath) {
  const contents = await readFile(filePath, "utf8");
  const normalized = contents.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  if (lines.at(-1) === "" && /\r?\n$/.test(contents)) {
    lines.pop();
  }

  return lines;
}

function assertLineExists(lines, lineNumber, fileArg) {
  if (lineNumber > lines.length) {
    throw new Error(`Line ${lineNumber} is outside ${fileArg} (${lines.length} lines).`);
  }
}

function createAnchorFromLines(lines, lineNumber) {
  const anchorIndex = lineNumber - 1;

  return {
    text: lines[anchorIndex],
    contextBefore: lines.slice(Math.max(0, anchorIndex - 3), anchorIndex).join("\n"),
    contextAfter: lines.slice(anchorIndex + 1, anchorIndex + 4).join("\n"),
  };
}

function createEmptyAnchor() {
  return {
    text: "",
    contextBefore: "",
    contextAfter: "",
  };
}

function toRelativeWorkspacePath(workspaceRoot, filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join("/");
}

async function ensureMarginDataFile(workspaceRoot) {
  try {
    return await readMarginData(workspaceRoot);
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  const initialData = createDefaultMarginData();
  await writeMarginData(workspaceRoot, initialData);
  return initialData;
}

async function readMarginData(workspaceRoot) {
  const filePath = getMarginFilePath(workspaceRoot);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);

  return parseMarginData(parsed, filePath);
}

async function writeMarginData(workspaceRoot, data) {
  const filePath = getMarginFilePath(workspaceRoot);
  const directoryPath = path.dirname(filePath);
  const validated = parseMarginData(data, filePath);
  const tempFilePath = `${filePath}.tmp`;

  await mkdir(directoryPath, { recursive: true });
  await writeFile(tempFilePath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  await rename(tempFilePath, filePath);
}

function getMarginFilePath(workspaceRoot) {
  return path.join(workspaceRoot, MARGIN_DIRECTORY, MARGIN_FILE_NAME);
}

function createDefaultMarginData() {
  return {
    version: DEFAULT_MARGIN_DATA.version,
    threads: [...DEFAULT_MARGIN_DATA.threads],
  };
}

function parseMarginData(value, source) {
  if (!isRecord(value)) {
    throw new Error(`Margin data in ${source} must be a JSON object.`);
  }

  if (value.version !== MARGIN_SCHEMA_VERSION) {
    throw new Error(
      `Margin data in ${source} must use schema version ${MARGIN_SCHEMA_VERSION}.`,
    );
  }

  if (!Array.isArray(value.threads)) {
    throw new Error(`Margin data in ${source} must include a threads array.`);
  }

  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function isFileNotFoundError(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function printUsage() {
  console.error(`Usage:
  margin add <file> <line> [--author <name>] --text <content> [--no-context]
  margin reply <thread-id> [--author <name>] --text <content>
  margin resolve <thread-id> [--author <name>]
  margin reopen <thread-id> [--author <name>]
  margin delete <thread-id> [--author <name>]
  margin clear <thread-id> [--author <name>]`);
}

function getDefaultAuthor() {
  return process.env.USER ?? process.env.USERNAME ?? "local";
}

await main();
