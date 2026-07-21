/**
 * Resolve only: @/ → src/ and bare .ts paths. Let Node strip-types handle transpile.
 */
import path from "path";
import fs from "fs";
import { pathToFileURL, fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(root, "src");

function resolveFile(absBase) {
  const candidates = [
    absBase,
    absBase + ".ts",
    absBase + ".tsx",
    absBase + ".js",
    path.join(absBase, "index.ts"),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch { /* noop */ }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const hit = resolveFile(path.join(srcRoot, specifier.slice(2)));
    if (hit) {
      return nextResolve(pathToFileURL(hit).href, context);
    }
  }
  // relative import without extension from a .ts parent
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    try {
      const parent = fileURLToPath(context.parentURL);
      const abs = path.resolve(path.dirname(parent), specifier);
      const hit = resolveFile(abs);
      if (hit && (hit.endsWith(".ts") || hit.endsWith(".tsx"))) {
        return nextResolve(pathToFileURL(hit).href, context);
      }
    } catch { /* noop */ }
  }
  return nextResolve(specifier, context);
}
