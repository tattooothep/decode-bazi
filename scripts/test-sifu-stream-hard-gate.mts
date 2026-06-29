/**
 * Sifu fast-stream regression.
 * Goal: SSE Q&A must not block first visible text on TRACE/critical evidence.
 * ID can remain a short hard guard; TRACE/critical are audit-only in stream path.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripIdLine, validateIdentity } from "../src/lib/identity-lock";
import { stripTraceLine } from "../src/lib/sifu-trace-lock";

const route = readFileSync(join(process.cwd(), "src/app/api/sifu/route.ts"), "utf8");

let pass = 0, fail = 0;
function ck(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${label}${detail ? ` · ${detail}` : ""}`);
  cond ? pass++ : fail++;
}

const parserBlocks = [...route.matchAll(/const parser = makeSifuCliParser[\s\S]*?\.stdout\.on\("data", parser\);/g)].map((m) => m[0]);
ck("has POST and GET parser blocks", parserBlocks.length >= 2, `blocks=${parserBlocks.length}`);
for (const [idx, block] of parserBlocks.entries()) {
  ck(`parser block ${idx + 1} still validates ID before visible text`, block.includes("validateIdentity"));
  ck(`parser block ${idx + 1} does not hard-wait for TRACE`, !block.includes("no_trace_line"));
  ck(`parser block ${idx + 1} does not reject TRACE mismatch`, !block.includes("trace_${tchk.reason}") && !block.includes("validateTrace(idBuf"));
  ck(`parser block ${idx + 1} emits visible rest after ID gate`, /emitVisibleG?\(rest\)/.test(block));
  ck(`parser block ${idx + 1} emits subsequent visible chunks`, /emitVisibleG?\(visibleText\)/.test(block));
  ck(`parser block ${idx + 1} strips internal markers from subsequent chunks`, /stripTraceLine\(stripIdLine\(visibleText\)\)/.test(block) || /stripIdLine\(stripTraceLine\(visibleText\)\)/.test(block));
}

function functionBody(name: string): string {
  const start = route.indexOf(`const ${name} = (text: string) => {`);
  if (start < 0) return "";
  const brace = route.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < route.length; i++) {
    const ch = route[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return route.slice(start, i + 1);
    }
  }
  return route.slice(start, start + 2000);
}
function sendsFirstBeforeChunk(body: string, firstFn: string): boolean {
  const firstIdx = body.indexOf(`${firstFn}();`);
  const chunkIdx = body.indexOf('send("chunk"');
  return firstIdx >= 0 && chunkIdx > firstIdx;
}
ck("POST emitVisible sends first event before chunk", sendsFirstBeforeChunk(functionBody("emitVisible"), "sendFirstOnce"));
ck("GET emitVisible sends first event before chunk", sendsFirstBeforeChunk(functionBody("emitVisibleG"), "sendFirstOnceG"));

ck("POST stream critical is audit-only", route.includes("critical-evidence incomplete (stream audit-only)"));
ck("GET stream critical is audit-only", route.includes("critical-evidence incomplete (GET stream audit-only)"));
ck("POST stream does not run full retry", !route.includes("critical-evidence retry (stream)") && !route.includes("[sifu] stream gate retry threw"));
ck("GET stream does not run full retry", !route.includes("critical-evidence retry (GET stream)") && !route.includes("[sifu] GET stream gate retry threw"));
ck("stream skips cache when critical evidence is missing", (route.match(/useCache && finalCritical\.ok/g) || []).length >= 2);
ck("stream guard meta marks soft ID/TRACE as degraded", /const cacheable = cleanIdentity && cleanTrace;[\s\S]*return \{ identity, trace, degraded: !cacheable, cacheable \};/.test(route));
ck("stream skips cache when guard is degraded", (route.match(/useCache && finalCritical\.ok && streamGuard\.cacheable/g) || []).length >= 2);
ck("stream audit records guard degradation", (route.match(/stream_guard: streamGuard/g) || []).length >= 2);

const finalPayloadChunks = route.match(/if \(!firstChunkSent\) \{[\s\S]{0,160}?send\("chunk", \{ text: payload\.reply \}\);[\s\S]{0,80}?\}/g) || [];
ck("final payload chunk is fallback-only", finalPayloadChunks.length >= 2, `blocks=${finalPayloadChunks.length}`);
ck("no unconditional final payload chunk remains", !/\n\s*send\("chunk", \{ text: payload\.reply \}\);\n\s*send\("done"/.test(route));

ck("POST cache can bypass stale critical answer", route.includes("cache bypass: critical evidence stale"));
ck("GET cache can bypass stale critical answer", route.includes("GET cache bypass: critical evidence stale"));

ck("Claude compact knowledge is feature-flagged", route.includes("SIFU_CLAUDE_COMPACT_KNOWLEDGE") && route.includes("process.env.SIFU_CLAUDE_COMPACT_KNOWLEDGE === \"1\""));
ck("compact mode covers Claude when flag is on", /return model === "codex-cli" \|\| model === "grok-cli" \|\| SIFU_CLAUDE_COMPACT_KNOWLEDGE;/.test(route));
ck("compact rule version avoids full source version", /if \(shouldUseCompactKnowledge\(model\)\) \{[\s\S]*?loadSifuCompactAuthorityKnowledge\(\)\.version[\s\S]*?compactclassics2[\s\S]*?\}/.test(route));
ck("compact prompt carries source-of-truth baseline", route.includes("SIFU COMPACT SOURCE-OF-TRUTH BASELINE") && route.includes("RUNTIME EXACT SOURCE EXCERPTS"));
ck("compact prompt includes hard error source excerpts", ["子平真詮 · 論雜氣/四庫", "天干五合 丙辛/丁壬", "三合局 巳酉丑", "貪合忘冲 / 合解冲"].every((s) => route.includes(s)));
ck("compact prompt appends final output protocol", route.includes("FINAL OUTPUT PROTOCOL (compact fast stream") && /return compact \? prompt \+ compactOutputProtocol\(opts\.ctx\) : prompt;/.test(route));
ck("compact final protocol makes ID the first byte", route.includes("ถ้าอักขระแรกของคำตอบไม่ใช่ ⟦ ระบบจะตัดคำตอบทิ้งทันที"));
ck("all sifu prompt builds use compact decision helper", !route.includes("compactKnowledge: sifuModel === \"codex-cli\"") && (route.match(/compactKnowledge: shouldUseCompactKnowledge\(sifuModel\)/g) || []).length >= 4);

type SimEvent = { event: string; data?: unknown };

function simulateStreamGate(deltas: string[], opts: { criticalOk?: boolean } = {}) {
  let idBuf = "";
  let idChecked = false;
  let idRejected = false;
  let full = "";
  let firstChunkSent = false;
  const events: SimEvent[] = [];
  const send = (event: string, data?: unknown) => events.push({ event, data });
  const sendFirstOnce = () => {
    if (!firstChunkSent) {
      firstChunkSent = true;
      send("first");
    }
  };
  const emitVisible = (text: string) => {
    if (!text) return;
    full += text;
    sendFirstOnce();
    send("chunk", { text });
  };
  const reject = (reason: string) => {
    idRejected = true;
    send("error", { error: "identity_mismatch", reason });
  };

  for (const text of deltas) {
    if (idRejected) continue;
    if (!idChecked) {
      idBuf += text;
      const nl = idBuf.indexOf("\n");
      if (nl === -1) {
        if (idBuf.length > 120) reject("no_id_line");
        continue;
      }
      idChecked = true;
      const idCheck = validateIdentity(idBuf.slice(0, nl) + "\n", "壬");
      if (!idCheck.ok) { reject(idCheck.reason); continue; }
      emitVisible(stripTraceLine(stripIdLine(idBuf)));
      continue;
    }
    emitVisible(stripTraceLine(stripIdLine(text)));
  }

  if (!idRejected) {
    if (!idChecked) {
      send("error", { error: "identity_mismatch", reason: "no_id_line" });
    } else if (full.trim()) {
      send("critical_check", { ok: opts.criticalOk !== false });
      if (!firstChunkSent) emitVisible(full.trim());
      send("done");
    }
  }
  return events;
}

const partialEvents = simulateStreamGate(["⟦ID⟧日干=壬⟧\n"]);
ck("behavior: ID alone emits no visible chunk", !partialEvents.some((e) => e.event === "chunk"));

const wrongIdEvents = simulateStreamGate([
  "⟦ID⟧日干=癸⟧\n",
  "คำตอบห้ามออก",
]);
ck("behavior: wrong ID still hard fails", wrongIdEvents.some((e) => e.event === "error"));
ck("behavior: wrong ID emits no visible chunk", !wrongIdEvents.some((e) => e.event === "chunk"), JSON.stringify(wrongIdEvents));

const missingTraceEvents = simulateStreamGate([
  "⟦ID⟧日干=壬⟧\n",
  "คำตอบแรก",
], { criticalOk: false });
ck("behavior: missing TRACE still emits first visible chunk", missingTraceEvents[0]?.event === "first" && missingTraceEvents[1]?.event === "chunk", JSON.stringify(missingTraceEvents));
ck("behavior: critical missing still reaches done", missingTraceEvents.some((e) => e.event === "critical_check") && missingTraceEvents.at(-1)?.event === "done");
ck("behavior: streamed answer is not duplicated at close", missingTraceEvents.filter((e) => e.event === "chunk").length === 1, JSON.stringify(missingTraceEvents));

const lateTraceEvents = simulateStreamGate([
  "⟦ID⟧日干=壬⟧\n",
  "⟦TRACE⟧從=ไม่มี·格局=潤下格·用神=ไฟ⟧\nคำตอบหลัง trace",
]);
ck("behavior: TRACE mismatch is audit-only in stream", !lateTraceEvents.some((e) => e.event === "error"), JSON.stringify(lateTraceEvents));
ck("behavior: internal TRACE marker is stripped when present", !JSON.stringify(lateTraceEvents).includes("⟦TRACE⟧"), JSON.stringify(lateTraceEvents));

console.log(`\n[sifu-fast-stream] ${pass}/${pass + fail} ${fail ? "FAILED" : "passed"}`);
process.exit(fail ? 1 : 0);
