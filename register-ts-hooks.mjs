import { readFileSync } from "node:fs";
import path from "node:path";
import { registerHooks, stripTypeScriptTypes } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
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
