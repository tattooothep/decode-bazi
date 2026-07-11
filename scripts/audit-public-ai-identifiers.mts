import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { publicAiPayload } from "../src/lib/public-ai-response";

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "public");
const PUBLIC_IDENTIFIER = /claude|anthropic|codex|grok|openrouter|chatgpt|gpt[-_ ]?[0-9o]|gemini-(?:api|[0-9])|gemini ai|provider[_ -]?model|judge_model/i;

function publicCodeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    const rel = relative(PUBLIC, full).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (rel === "data" || rel === "_preview") return [];
      return publicCodeFiles(full);
    }
    return /\.(?:html|js)$/.test(entry.name) && statSync(full).isFile() ? [full] : [];
  });
}

const leaks = publicCodeFiles(PUBLIC).flatMap((file) => {
  const rows = readFileSync(file, "utf8").split("\n");
  return rows.flatMap((line, index) => PUBLIC_IDENTIFIER.test(line)
    ? [`${relative(ROOT, file)}:${index + 1}: ${line.trim().slice(0, 180)}`]
    : []);
});
assert.deepEqual(leaks, [], `public AI identifiers found:\n${leaks.join("\n")}`);

const sample = {
  reply: "Gemini is a zodiac sign and must remain in a user's answer.",
  model: "private-model",
  provider: "private-provider",
  nested: {
    judge_model: "private-judge",
    panel_models: ["private-a", "private-b"],
    error: "anthropic context token limit exceeded",
  },
};
const clean = publicAiPayload(sample) as Record<string, any>;
assert.equal(clean.reply, sample.reply, "answer text must not be rewritten");
assert.equal("model" in clean, false);
assert.equal("provider" in clean, false);
assert.equal("judge_model" in clean.nested, false);
assert.equal("panel_models" in clean.nested, false);
assert.equal(clean.nested.error, "analysis_context_limit");

const routeFiles = [
  "src/app/api/book/route.ts",
  "src/app/api/luopan/vision/route.ts",
  "src/app/api/mobile/v1/sifu/chat/route.ts",
  "src/app/api/mobile/v1/sifu/group/route.ts",
  "src/app/api/mobile/v1/network/sifu/route.ts",
  "src/app/api/ai/video/route.ts",
  "src/app/api/network/ai-parse-bulk/route.ts",
  "src/app/api/network/sifu/route.ts",
  "src/app/api/palmistry/job/route.ts",
  "src/app/api/palmistry/list/route.ts",
  "src/app/api/qimen/sifu/route.ts",
  "src/app/api/sifu/compare/route.ts",
  "src/app/api/sifu/fusion/route.ts",
  "src/app/api/sifu/fusion5/route.ts",
  "src/app/api/sifu/group/route.ts",
  "src/app/api/sifu/route.ts",
  "src/app/api/tianxing/sifu/route.ts",
];
for (const route of routeFiles) {
  assert.match(readFileSync(join(ROOT, route), "utf8"), /publicAiPayload/, `${route} has no public response sanitizer`);
}

console.log(`public AI audit passed: ${publicCodeFiles(PUBLIC).length} assets, ${routeFiles.length} API boundaries`);
