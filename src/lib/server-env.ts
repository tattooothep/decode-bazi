import { readFileSync } from "fs";
import { join } from "path";

function parseEnvValue(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const quote = s[0];
  if ((quote === '"' || quote === "'" || quote === "`") && s.endsWith(quote)) {
    const inner = s.slice(1, -1);
    return quote === '"' ? inner.replace(/\\n/g, "\n").replace(/\\"/g, '"') : inner;
  }
  return s.replace(/\s+#.*$/, "").trim();
}

export function ensureServerEnv(names: string[], cwd = process.cwd()): void {
  const missing = new Set(names.filter((name) => !process.env[name]));
  if (!missing.size) return;

  for (const file of [".env.local", ".env"]) {
    if (!missing.size) return;
    let text = "";
    try {
      text = readFileSync(join(cwd, file), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const name = m[1];
      if (!missing.has(name)) continue;
      const value = parseEnvValue(m[2] || "");
      if (!value) continue;
      process.env[name] = value;
      missing.delete(name);
    }
  }
}
