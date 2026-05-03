import { readFileSync } from "node:fs";
import path from "node:path";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const vscodeStubUrl = pathToFileURL(path.join(rootDirectory, "test", "vscode-stub.cjs")).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "vscode") {
      return {
        shortCircuit: true,
        url: vscodeStubUrl,
      };
    }

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const isRelativeImport = specifier.startsWith("./") || specifier.startsWith("../");
      const hasExtension = path.extname(specifier) !== "";

      if (!isRelativeImport || hasExtension) {
        throw error;
      }

      return nextResolve(`${specifier}.ts`, context);
    }
  },
  load(url, context, nextLoad) {
    if (!url.endsWith(".ts")) {
      return nextLoad(url, context);
    }

    return {
      format: "module",
      shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), {
        mode: "transform",
      }),
    };
  },
});
