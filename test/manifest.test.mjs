import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readManifest() {
  return JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
}

test("manifest defines a stable publisher and exposes thread actions in comment menus", async () => {
  const manifest = await readManifest();
  const commands = manifest.contributes.commands.map(({ command }) => command);
  const titleMenuCommands = manifest.contributes.menus["comments/commentThread/title"].map(
    ({ command }) => command,
  );
  const contextMenuCommands = manifest.contributes.menus["comments/commentThread/context"].map(
    ({ command }) => command,
  );

  assert.equal(manifest.publisher, "alphaofficial");
  assert.ok(commands.includes("margin.clear"));
  assert.ok(titleMenuCommands.includes("margin.clear"));
  assert.ok(contextMenuCommands.includes("margin.clear"));
  assert.ok(titleMenuCommands.includes("margin.resolve"));
  assert.ok(contextMenuCommands.includes("margin.deleteThread"));
});
