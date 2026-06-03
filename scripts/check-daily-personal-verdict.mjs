import { existsSync, readFileSync } from "node:fs";
import { computeDailyPersonalVerdict } from "../src/lib/daily-personal-verdict.ts";

const TARGET_DATE = process.env.TARGET_DATE || "2026-06-02";
const GOLDEN_PATH = process.env.GOLDEN_PATH || "/tmp/sifu-golden/golden.json";
const CASES_PATH = process.env.CASES_PATH || "test-cases/cases-60.json";
const ELEMENTS = ["wood", "fire", "earth", "metal", "water"];

function parsePillars(raw) {
  const [year, month, day, hour] = String(raw || "").trim().split(/\s+/);
  const toPillar = (p) => p && p.length >= 2 ? { stem: p[0], branch: p[1] } : null;
  return { year: toPillar(year), month: toPillar(month), day: toPillar(day), hour: toPillar(hour) };
}

function cleanElements(v) {
  return Array.isArray(v) ? v.map((x) => String(x || "").toLowerCase()).filter((x) => ELEMENTS.includes(x)) : [];
}

function mae(rows, lhs, rhs) {
  return rows.reduce((sum, row) => sum + Math.abs(lhs(row) - rhs(row)), 0) / Math.max(1, rows.length);
}

function levelBucket(score) {
  if (score >= 60) return "good";
  if (score >= 50) return "ok";
  if (score >= 35) return "caution";
  return "avoid";
}

function bucketFlip(a, b) {
  const rank = { avoid: 0, caution: 1, ok: 2, good: 3 };
  return Math.abs(rank[levelBucket(a)] - rank[levelBucket(b)]) >= 2;
}

function loadCaseMap() {
  if (!existsSync(CASES_PATH)) return new Map();
  const raw = JSON.parse(readFileSync(CASES_PATH, "utf8"));
  const cases = Object.values(raw.groups || {}).flat();
  return new Map(cases.map((row) => [row.id, row]));
}

async function verdictFor(row, caseById) {
  const cs = caseById.get(row.id) || {};
  return computeDailyPersonalVerdict({
    date: TARGET_DATE,
    userChart: parsePillars(row.pillars),
    dayPillar: row.engine?.dayPillar,
    yongshen: cleanElements(row.yongshen),
    jishen: cleanElements(row.jishen),
    birthDate: cs.date || row.birthDate || row.date,
    birthTime: cs.time || row.birthTime || row.time || "12:00",
    birthLng: cs.lng || row.lng || row.longitude || 100.5018,
    birthTimeKnown: cs.birthTimeKnown !== false && row.birthTimeKnown !== false,
    gender: cs.gender || row.gender || "M",
    dayBoundary: cs.dayBoundary || row.dayBoundary || "23:00",
  });
}

async function main() {
  if (!existsSync(GOLDEN_PATH)) {
    throw new Error(`missing golden file: ${GOLDEN_PATH}`);
  }

  const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")).filter((row) => row?.sifu?.parseOk && typeof row.sifu.score === "number");
  if (golden.length < 50) throw new Error(`expected at least 50 golden rows, got ${golden.length}`);
  const caseById = loadCaseMap();

  const rows = [];
  for (const row of golden) {
    const verdict = await verdictFor(row, caseById);
    rows.push({ ...row, verdict });
  }

  const legacyMae = mae(rows, (r) => r.engine.score, (r) => r.sifu.score);
  const alignedMae = mae(rows, (r) => r.verdict.score, (r) => r.sifu.score);
  const legacyFlips = rows.filter((r) => bucketFlip(r.engine.score, r.sifu.score)).length;
  const alignedFlips = rows.filter((r) => bucketFlip(r.verdict.score, r.sifu.score)).length;
  const engines = new Set(rows.map((r) => r.verdict.engine));

  const equalityCase = rows.find((r) => r.id === "asia19") || rows[0];
  const equalityBirth = caseById.get(equalityCase.id) || {};
  const sameInput = {
    date: TARGET_DATE,
    userChart: parsePillars(equalityCase.pillars),
    dayPillar: equalityCase.engine?.dayPillar,
    yongshen: cleanElements(equalityCase.yongshen),
    jishen: cleanElements(equalityCase.jishen),
    birthDate: equalityBirth.date || equalityCase.birthDate || equalityCase.date,
    birthTime: equalityBirth.time || equalityCase.birthTime || equalityCase.time || "12:00",
    birthLng: equalityBirth.lng || equalityCase.lng || equalityCase.longitude || 100.5018,
    birthTimeKnown: equalityBirth.birthTimeKnown !== false && equalityCase.birthTimeKnown !== false,
    gender: equalityBirth.gender || equalityCase.gender || "M",
    dayBoundary: equalityBirth.dayBoundary || equalityCase.dayBoundary || "23:00",
  };
  const today = await computeDailyPersonalVerdict(sameInput);
  const calendar = await computeDailyPersonalVerdict({ ...sameInput });
  const network = await computeDailyPersonalVerdict({ ...sameInput });
  const equalAcrossRoutes = today.score === calendar.score && calendar.score === network.score;

  console.log("daily-personal-verdict regression");
  console.log(`golden rows: ${rows.length}`);
  console.log(`legacy MAE vs Sifu: ${legacyMae.toFixed(1)}`);
  console.log(`aligned MAE vs Sifu: ${alignedMae.toFixed(1)}`);
  console.log(`legacy flips: ${legacyFlips}`);
  console.log(`aligned flips: ${alignedFlips}`);
  console.log(`engines: ${Array.from(engines).join(", ")}`);
  console.log(`same input equality: today=${today.score} calendar=${calendar.score} network=${network.score}`);

  if (!(alignedMae < legacyMae)) throw new Error("aligned helper did not improve MAE over legacy engine");
  if (alignedFlips > legacyFlips) throw new Error("aligned helper increased severe bucket flips");
  if (!equalAcrossRoutes) throw new Error("same daily input produced different scores across route simulations");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
