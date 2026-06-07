/**
 * Test · Qimen 年/月/日家 scope metadata wire
 * Run: node --experimental-strip-types scripts/test-qimen-dmy-scope-wire.mts
 */
import { readFileSync } from "node:fs";

const ROUTE = readFileSync(new URL("../src/app/api/qimen/route.ts", import.meta.url), "utf8");
let pass = 0;
let fail = 0;

function ck(label: string, condition: boolean, guide?: string) {
  if (condition) {
    pass++;
    console.log("  ✅ " + label);
  } else {
    fail++;
    console.log("  ❌ " + label + (guide ? " · " + guide : ""));
  }
}

function has(text: string) {
  return ROUTE.includes(text);
}

function block(name: string) {
  const match = ROUTE.match(new RegExp(`${name}: \\{[\\s\\S]*?\\n  \\},`));
  return match?.[0] || "";
}

console.log("[#1 scope labels · Thai first, Chinese second]");
ck("มี QIMEN_SYSTEM_SCOPE", has("const QIMEN_SYSTEM_SCOPE"));
ck("มี hour/day/month/year scope ครบ", has("hour: {") && has("day: {") && has("month: {") && has("year: {"));
ck("hour ใช้ชื่อผังยาม", has("ผังฉีเหมินยาม 時家奇門"));
ck("day ใช้ชื่อผังวัน", has("ผังฉีเหมินวัน 日家奇門"));
ck("month ใช้ชื่อผังเดือน", has("ผังฉีเหมินเดือน 月家奇門"));
ck("year ใช้ชื่อผังปี", has("ผังฉีเหมินปี 年家奇門"));

console.log("[#2 DMY caveats · do not read as hour chart]");
ck("day ระบุไม่ใช่ผังยามเฉพาะชั่วโมง", block("day").includes("ไม่ใช่ผังยามเฉพาะชั่วโมง"));
ck("month กันการฟันธงรายชั่วโมง", block("month").includes("ไม่ควรฟันธงจังหวะลงมือรายชั่วโมง"));
ck("year กันการใช้เป็นฤกษ์ยามเฉพาะชั่วโมง", block("year").includes("ไม่ใช่ฤกษ์ยามเฉพาะชั่วโมง"));
ck("DMY block ไม่มีคำว่าชั่วยามนี้", !`${block("day")}\n${block("month")}\n${block("year")}`.includes("ชั่วยามนี้"));

console.log("[#3 policy guard · no generic scoring/verdict]");
ck("มี decorateQimenChartScope", has("function decorateQimenChartScope"));
ck("มี decorateQimenResponseScope", has("function decorateQimenResponseScope"));
ck("แยก system_type ที่ engine คำนวณจริง", has("const engineSystemType = normalizeQimenSystemType(chart.system_type || chart.chart_type);"));
ck("แยก system_type ที่ผู้ใช้ขอ", has("const requestedRaw = requestedSystemType ? normalizeQimenSystemType(requestedSystemType) : engineSystemType;"));
ck("preserve system scope metadata จาก qimen-api", has("const existingSystemScope = isObjectRecord(existingCapabilities.qimen_system_scope)") && has("...existingSystemScope"));
ck("ห้าม relabel chart เป็น DMY จาก request", has("system_type: engineSystemType") && has("chart_type: chart.chart_type || engineSystemType"));
ck("ส่งสถานะ fulfilled ของคำขอ DMY", has("qimen_system_scope_request") && has("fulfilled"));
ck("คำเตือนเมื่อ engine ยังส่ง hour", has("ห้ามอ่านผังนี้เป็นผังวัน/เดือน/ปี ถ้า engine ยังส่ง system_type เป็น hour"));
ck("เติม context_only เมื่อ engine ไม่ส่ง", has("context_only: existingPolicy.context_only ?? true"));
ck("เติม verdict_allowed=false เมื่อ engine ไม่ส่ง", has("verdict_allowed: existingPolicy.verdict_allowed ?? false"));
ck("เติม no_score_mutation=true เมื่อ engine ไม่ส่ง", has("no_score_mutation: existingPolicy.no_score_mutation ?? true"));
ck("เติม score_effect=none เมื่อ engine ไม่ส่ง", has("score_effect: existingPolicy.score_effect ?? \"none\""));
ck("ส่ง qimen_context_flags ให้ UI/Sifu อ่านต่อ", has("qimen_context_flags"));
ck("ส่ง qimen_system_scope เป็น metadata แยก", has("qimen_system_scope") && has("qimen-system-scope-v1"));

console.log("[#4 response decoration · narrow proxy change]");
ck("callQimen decorate response ก่อนคืน", has("return decorateQimenResponseScope(json, context.system_type);"));
ck("ไม่แตะ palaces หรือคะแนนใน decorator", !has("palaces.map") && !has("overall_quality =") && !has("score ="));

console.log(`\n[qimen-dmy-scope-wire] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
