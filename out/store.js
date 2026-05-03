"use strict";

const { mkdir, readFile, rename, writeFile } = require("node:fs/promises");
const path = require("node:path");
const MARGIN_SCHEMA_VERSION = 1;
const MARGIN_DIRECTORY = ".vscode";
const MARGIN_FILE_NAME = "margin.json";
const DEFAULT_MARGIN_DATA = {
    version: MARGIN_SCHEMA_VERSION,
    threads: []
};
function createDefaultMarginData() {
    return {
        version: DEFAULT_MARGIN_DATA.version,
        threads: [
            ...DEFAULT_MARGIN_DATA.threads
        ]
    };
}
function getMarginFilePath(workspaceRoot) {
    return path.join(workspaceRoot, MARGIN_DIRECTORY, MARGIN_FILE_NAME);
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
    await mkdir(directoryPath, {
        recursive: true
    });
    await writeFile(tempFilePath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
    await rename(tempFilePath, filePath);
}
function parseMarginData(value, source) {
    if (!isRecord(value)) {
        throw new Error(`Margin data in ${source} must be a JSON object.`);
    }
    if (value.version !== MARGIN_SCHEMA_VERSION) {
        throw new Error(`Margin data in ${source} must use schema version ${MARGIN_SCHEMA_VERSION}.`);
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
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

module.exports = { MARGIN_SCHEMA_VERSION, MARGIN_DIRECTORY, MARGIN_FILE_NAME, ensureMarginDataFile, readMarginData, writeMarginData, createDefaultMarginData, getMarginFilePath };
