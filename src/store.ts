import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";

import type { MarginData } from "./types";

export const MARGIN_SCHEMA_VERSION = 1;
export const MARGIN_DIRECTORY = ".vscode";
export const MARGIN_FILE_NAME = "margin.json";

const DEFAULT_MARGIN_DATA: MarginData = {
  version: MARGIN_SCHEMA_VERSION,
  threads: [],
};

export function createDefaultMarginData(): MarginData {
  return {
    version: DEFAULT_MARGIN_DATA.version,
    threads: [...DEFAULT_MARGIN_DATA.threads],
  };
}

export function getMarginFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, MARGIN_DIRECTORY, MARGIN_FILE_NAME);
}

export async function ensureMarginDataFile(
  workspaceRoot: string,
): Promise<MarginData> {
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

export async function readMarginData(workspaceRoot: string): Promise<MarginData> {
  const filePath = getMarginFilePath(workspaceRoot);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  return parseMarginData(parsed, filePath);
}

export async function writeMarginData(
  workspaceRoot: string,
  data: MarginData,
): Promise<void> {
  const filePath = getMarginFilePath(workspaceRoot);
  const directoryPath = path.dirname(filePath);
  const validated = parseMarginData(data, filePath);
  const tempFilePath = `${filePath}.tmp`;

  await mkdir(directoryPath, { recursive: true });
  await writeFile(tempFilePath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  await rename(tempFilePath, filePath);
}

function parseMarginData(value: unknown, source: string): MarginData {
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

  return value as MarginData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
