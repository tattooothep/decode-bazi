/**
 * Sifu stream hard-gate regression.
 * Goal: SSE Q&A must not emit AI chunks before identity/TRACE/critical evidence gate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(join(process.cwd(), "src/app/api/sifu/route.ts"), "utf8");

let pass = 0, fail = 0;
function ck(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${label}${detail ? ` · ${detail}` : ""}`);
  cond ? pass++ : fail++;
}

const parserBlocks = [...route.matchAll(/const parser = makeSifuCliParser[\s\S]*?\.stdout\.on\("data", parser\);/g)].map((m) => m[0]);
ck("has POST and GET parser blocks", parserBlocks.length >= 2, `blocks=${parserBlocks.length}`);
for (const [idx, block] of parserBlocks.entries()) {
  ck(`parser block ${idx + 1} buffers without sending chunk`, !/send\("chunk"/.test(block));
  ck(`parser block ${idx + 1} still accumulates full answer`, /full \+=/.test(block));
}

const closeBlocks = [...route.matchAll(/\.on\("close", async \(code\) => \{[\s\S]*?safeClose\(\);\n\s*\}\);/g)].map((m) => m[0]);
ck("has async stream close blocks", closeBlocks.length >= 2, `blocks=${closeBlocks.length}`);
for (const [idx, block] of closeBlocks.entries()) {
  ck(`close block ${idx + 1} checks critical before emit`, block.indexOf("checkSifuCriticalEvidence") >= 0 && block.indexOf("checkSifuCriticalEvidence") < block.indexOf('send("chunk"'));
  ck(`close block ${idx + 1} retries with gate prompt`, block.includes("buildSifuGateRetryPrompt"));
  ck(`close block ${idx + 1} catches retry failure`, block.includes("critical_evidence_retry_failed"));
  ck(`close block ${idx + 1} emits only final payload reply`, /send\("chunk", \{ text: payload\.reply \}\)/.test(block));
  ck(`close block ${idx + 1} does not cache before critical variable`, block.indexOf("setCachedReply") > block.indexOf("finalCritical"));
}

ck("POST cache can bypass stale critical answer", route.includes("cache bypass: critical evidence stale"));
ck("GET cache can bypass stale critical answer", route.includes("GET cache bypass: critical evidence stale"));
ck("old warn-only stream critical message removed", !route.includes("critical-evidence incomplete (stream)"));

console.log(`\n[sifu-stream-hard-gate] ${pass}/${pass + fail} ${fail ? "FAILED" : "passed"}`);
process.exit(fail ? 1 : 0);
