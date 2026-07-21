import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] || "/root/artifacts/hourkey-pdf-v2-final";
const languages = ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"];
let checked = 0;

for (const lang of languages) {
  for (const kind of ["quick", "ai"]) {
    const name = `hourkey-pdf-v2-${kind}-${lang}.pdf`;
    const path = join(dir, name);
    assert.ok(statSync(path).size > 20_000, `${name} is too small`);
    const info = execFileSync("pdfinfo", [path], { encoding: "utf8" });
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
    assert.equal(pages, kind === "quick" ? 5 : 8, `${name} page count`);
    const text = execFileSync("pdftotext", [path, "-"], { encoding: "utf8", maxBuffer: 2_000_000 });
    assert.ok(text.length > 500, `${name} has insufficient extractable text`);
    assert.match(text, new RegExp(`PREVIEW-${kind.toUpperCase()}-${lang.toUpperCase()}`), `${name} report ID`);
    assert.doesNotMatch(text, /QR\s*hourkey\.io/, `${name} contains fake QR text`);
    assert.doesNotMatch(text, /TST verified/, `${name} contains an unsupported global verification claim`);
    checked++;
  }
}

assert.equal(readdirSync(dir).filter((name) => name.endsWith(".pdf")).length, 18, "unexpected PDF fixture count");
console.log(`${checked}/18 Chromium PDF artifacts passed (9 languages × quick/AI)`);
