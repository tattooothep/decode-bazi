/**
 * Sifu fast-stream regression.
 * Goal: SSE Q&A must gate ID/TRACE before visible text, then stream immediately.
 * Critical evidence stays source-audited, but must not trigger full-answer retry in stream path.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripIdLine, validateIdentity } from "../src/lib/identity-lock";
import { parseTraceLine, stripTraceLine, validateTrace, type TraceFacts } from "../src/lib/sifu-trace-lock";

const route = readFileSync(join(process.cwd(), "src/app/api/sifu/route.ts"), "utf8");

let pass = 0, fail = 0;
function ck(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${label}${detail ? ` · ${detail}` : ""}`);
  cond ? pass++ : fail++;
}

const parserBlocks = [...route.matchAll(/const parser = makeSifuCliParser[\s\S]*?\.stdout\.on\("data", parser\);/g)].map((m) => m[0]);
ck("has POST and GET parser blocks", parserBlocks.length >= 2, `blocks=${parserBlocks.length}`);
for (const [idx, block] of parserBlocks.entries()) {
  ck(`parser block ${idx + 1} still waits for ID line`, block.includes("validateIdentity"));
  ck(`parser block ${idx + 1} still waits for TRACE when required`, block.includes("parseTraceLine") && block.includes("validateTrace"));
  ck(`parser block ${idx + 1} emits visible rest after gate`, /emitVisibleG?\(rest\)/.test(block));
  ck(`parser block ${idx + 1} emits subsequent visible chunks`, /emitVisibleG?\(visibleText\)/.test(block));
}

ck("POST emitVisible sends first event before chunk", /const emitVisible = \(text: string\) => \{[\s\S]*?sendFirstOnce\(\);[\s\S]*?send\("chunk", \{ text \}\);[\s\S]*?\};/.test(route));
ck("GET emitVisible sends first event before chunk", /const emitVisibleG = \(text: string\) => \{[\s\S]*?sendFirstOnceG\(\);[\s\S]*?send\("chunk", \{ text \}\);[\s\S]*?\};/.test(route));

ck("POST stream critical is audit-only", route.includes("critical-evidence incomplete (stream audit-only)"));
ck("GET stream critical is audit-only", route.includes("critical-evidence incomplete (GET stream audit-only)"));
ck("POST stream does not run full retry", !route.includes("critical-evidence retry (stream)") && !route.includes("[sifu] stream gate retry threw"));
ck("GET stream does not run full retry", !route.includes("critical-evidence retry (GET stream)") && !route.includes("[sifu] GET stream gate retry threw"));
ck("stream skips cache when critical evidence is missing", (route.match(/useCache && finalCritical\.ok/g) || []).length >= 2);

const finalPayloadChunks = route.match(/if \(!firstChunkSent\) \{[\s\S]{0,160}?send\("chunk", \{ text: payload\.reply \}\);[\s\S]{0,80}?\}/g) || [];
ck("final payload chunk is fallback-only", finalPayloadChunks.length >= 2, `blocks=${finalPayloadChunks.length}`);
ck("no unconditional final payload chunk remains", !/\n\s*send\("chunk", \{ text: payload\.reply \}\);\n\s*send\("done"/.test(route));

ck("POST cache can bypass stale critical answer", route.includes("cache bypass: critical evidence stale"));
ck("GET cache can bypass stale critical answer", route.includes("GET cache bypass: critical evidence stale"));

ck("Claude compact knowledge is feature-flagged", route.includes("SIFU_CLAUDE_COMPACT_KNOWLEDGE") && route.includes("process.env.SIFU_CLAUDE_COMPACT_KNOWLEDGE === \"1\""));
ck("compact mode covers Claude when flag is on", /return model === "codex-cli" \|\| SIFU_CLAUDE_COMPACT_KNOWLEDGE;/.test(route));
ck("compact rule version avoids full source version", /if \(shouldUseCompactKnowledge\(model\)\) \{[\s\S]*?loadSifuCompactAuthorityKnowledge\(\)\.version[\s\S]*?compactclassics2[\s\S]*?\}/.test(route));
ck("compact prompt carries source-of-truth baseline", route.includes("SIFU COMPACT SOURCE-OF-TRUTH BASELINE") && route.includes("RUNTIME EXACT SOURCE EXCERPTS"));
ck("compact prompt includes hard error source excerpts", ["子平真詮 · 論雜氣/四庫", "天干五合 丙辛/丁壬", "三合局 巳酉丑", "貪合忘冲 / 合解冲"].every((s) => route.includes(s)));
ck("compact prompt appends final output protocol", route.includes("FINAL OUTPUT PROTOCOL (compact fast stream") && /return compact \? prompt \+ compactOutputProtocol\(opts\.ctx\) : prompt;/.test(route));
ck("compact final protocol makes ID the first byte", route.includes("ถ้าอักขระแรกของคำตอบไม่ใช่ ⟦ ระบบจะตัดคำตอบทิ้งทันที"));
ck("all sifu prompt builds use compact decision helper", !route.includes("compactKnowledge: sifuModel === \"codex-cli\"") && (route.match(/compactKnowledge: shouldUseCompactKnowledge\(sifuModel\)/g) || []).length >= 4);

type SimEvent = { event: string; data?: unknown };
const simFacts: TraceFacts = {
  congExpected: false,
  gejuTokens: ["雜氣正官格"],
  yongWords: ["ไฟ", "火"],
};

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
      if (!parseTraceLine(idBuf)) {
        const nlCount = (idBuf.match(/\n/g) || []).length;
        if (nlCount >= 3 || idBuf.length > 500) reject("no_trace_line");
        continue;
      }
      idChecked = true;
      const idCheck = validateIdentity(idBuf.slice(0, nl) + "\n", "壬");
      if (!idCheck.ok) { reject(idCheck.reason); continue; }
      const traceCheck = validateTrace(idBuf, simFacts);
      if (!traceCheck.ok) { reject(`trace_${traceCheck.reason}`); continue; }
      emitVisible(stripTraceLine(stripIdLine(idBuf)));
      continue;
    }
    emitVisible(text);
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

const validEvents = simulateStreamGate([
  "⟦ID⟧日干=壬⟧\n",
  "⟦TRACE⟧從=ไม่มี·格局=雜氣正官格·用神=ไฟ⟧\nคำตอบแรก",
], { criticalOk: false });
ck("behavior: valid TRACE emits first before chunk", validEvents[0]?.event === "first" && validEvents[1]?.event === "chunk", JSON.stringify(validEvents));
ck("behavior: critical missing still reaches done", validEvents.some((e) => e.event === "critical_check") && validEvents.at(-1)?.event === "done");
ck("behavior: streamed answer is not duplicated at close", validEvents.filter((e) => e.event === "chunk").length === 1, JSON.stringify(validEvents));

const badTraceEvents = simulateStreamGate([
  "⟦ID⟧日干=壬⟧\n",
  "⟦TRACE⟧從=ไม่มี·格局=潤下格·用神=ไฟ⟧\nห้ามออก",
]);
ck("behavior: bad TRACE emits error", badTraceEvents.some((e) => e.event === "error"));
ck("behavior: bad TRACE emits no chunk", !badTraceEvents.some((e) => e.event === "chunk"), JSON.stringify(badTraceEvents));

console.log(`\n[sifu-fast-stream] ${pass}/${pass + fail} ${fail ? "FAILED" : "passed"}`);
process.exit(fail ? 1 : 0);
