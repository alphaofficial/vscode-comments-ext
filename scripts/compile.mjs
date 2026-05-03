import { readdir, readFile, rm, mkdir, writeFile, watch } from "node:fs/promises";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, "src");
const outRoot = path.join(projectRoot, "out");
const isWatchMode = process.argv.includes("--watch");

async function main() {
  await buildProject();

  if (!isWatchMode) {
    return;
  }

  console.log("Watching src for changes...");
  let pendingBuild;

  for await (const event of watch(srcRoot, { recursive: true })) {
    if (!event.filename?.endsWith(".ts")) {
      continue;
    }

    if (pendingBuild) {
      clearTimeout(pendingBuild);
    }

    pendingBuild = setTimeout(() => {
      pendingBuild = undefined;
      void buildProject().catch((error) => {
        console.error(error);
      });
    }, 75);
  }
}

async function buildProject() {
  await rm(outRoot, { recursive: true, force: true });
  const sourceFiles = await collectTypeScriptFiles(srcRoot);

  for (const sourceFile of sourceFiles) {
    const relativePath = path.relative(srcRoot, sourceFile);
    const outputPath = path.join(outRoot, relativePath).replace(/\.ts$/, ".js");
    const source = await readFile(sourceFile, "utf8");
    const transformed = transpileToCommonJs(source);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, transformed, "utf8");
  }
}

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

function transpileToCommonJs(source) {
  let output = stripTypeScriptTypes(source, { mode: "transform" });
  const exportedNames = [];

  output = output.replace(/^import \* as (\w+) from "([^"]+)";$/gm, 'const $1 = require("$2");');
  output = output.replace(
    /^import \{([^}]+)\} from "([^"]+)";$/gm,
    (_, imports, specifier) => `const {${imports}} = require("${specifier}");`,
  );

  output = output.replace(/^export\s+const\s+(\w+)\s*=/gm, (_, name) => {
    exportedNames.push(name);
    return `const ${name} =`;
  });
  output = output.replace(/^export\s+async\s+function\s+(\w+)\s*\(/gm, (_, name) => {
    exportedNames.push(name);
    return `async function ${name}(`;
  });
  output = output.replace(/^export\s+function\s+(\w+)\s*\(/gm, (_, name) => {
    exportedNames.push(name);
    return `function ${name}(`;
  });
  output = output.replace(/^export\s+class\s+(\w+)/gm, (_, name) => {
    exportedNames.push(name);
    return `class ${name}`;
  });

  const normalized = output.trim();
  const exportBlock =
    exportedNames.length > 0 ? `\n\nmodule.exports = { ${exportedNames.join(", ")} };\n` : "\n";

  return `"use strict";\n\n${normalized}${exportBlock}`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
