import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (process.env.PAIR_ORACLE_TS_READY !== "1") {
  const self = fileURLToPath(import.meta.url);
  const child = spawnSync(process.execPath, [
    "--experimental-strip-types",
    "--import",
    "./scripts/_ts-resolver.mjs",
    self,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, PAIR_ORACLE_TS_READY: "1" },
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}

const {
  BRANCH_CLASH,
  BRANCH_ELEMENT,
  ELEM_CONTROLS,
  ELEM_PRODUCES,
  LIU_HAI,
  LIU_HE,
  LIU_HE_TRANSFORM,
  LIU_PO,
  SAN_HE_GROUPS,
  SAN_HUI_GROUPS,
  STEM_CLASH,
  STEM_ELEMENT,
  STEM_HE,
  STEM_HE_TRANSFORM,
  XING_PAIRS,
  XING_SELF,
  XING_TRIPLES,
  pairBaseScore,
  modulateByTf,
} = await import("../src/lib/scoring/pair-base.ts");
const { buildNetworkScorePayload } = await import("../src/lib/scoring/network-score-payload.ts");

const GOLDEN_PATH = process.env.GOLDEN_PATH || "/tmp/sifu-golden/golden.json";
const MAX_PEOPLE = Number(process.env.MAX_PEOPLE || 60);
const AXES = ["day", "month", "year", "hour"];
const AXIS_WEIGHT = { day: 1, month: 0.72, year: 0.52, hour: 0.42 };
const ELS = ["wood", "fire", "earth", "metal", "water"];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function parsePillars(raw) {
  const [year, month, day, hour] = String(raw || "").trim().split(/\s+/);
  const toPillar = (p) => p && p.length >= 2 ? { stem: p[0], branch: p[1] } : null;
  return { year: toPillar(year), month: toPillar(month), day: toPillar(day), hour: toPillar(hour) };
}

function cleanElements(value) {
  return Array.isArray(value) ? value.map((x) => String(x || "").toLowerCase()).filter((x) => ELS.includes(x)) : [];
}

function peopleFromGolden() {
  assert(existsSync(GOLDEN_PATH), `missing golden file: ${GOLDEN_PATH}`);
  const rows = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"))
    .filter((row) => row?.sifu?.parseOk && row?.pillars)
    .slice(0, MAX_PEOPLE);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ...parsePillars(row.pillars),
    yongshen: cleanElements(row.yongshen),
    jishen: cleanElements(row.jishen),
  })).filter((p) => p.day?.stem && p.day?.branch);
}

function stemEl(pillar) {
  return pillar?.stem ? STEM_ELEMENT[pillar.stem] || null : null;
}

function branchEl(pillar) {
  return pillar?.branch ? BRANCH_ELEMENT[pillar.branch] || null : null;
}

function has(list, el) {
  return !!el && Array.isArray(list) && list.includes(el);
}

function clamp(n, lo = -100, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function soft(n) {
  if (n > 80) return 80 + (n - 80) * 0.35;
  if (n < -80) return -80 + (n + 80) * 0.35;
  return n;
}

function bucket(score) {
  if (score >= 35) return 3;
  if (score >= 12) return 2;
  if (score >= -12) return 1;
  if (score >= -35) return 0;
  return -1;
}

function label(score) {
  return ["avoid", "caution", "neutral", "workable", "support"][bucket(score) + 1] || "unknown";
}

function xing(a, b) {
  if (!a || !b) return false;
  if (a === b && XING_SELF.includes(a)) return true;
  if (XING_PAIRS.some((pair) => pair.includes(a) && pair.includes(b) && a !== b)) return true;
  return XING_TRIPLES.some((group) => group.includes(a) && group.includes(b) && a !== b);
}

function branchSet(person) {
  return new Set(AXES.map((axis) => person[axis]?.branch).filter(Boolean));
}

function addElementFit(acc, a, element, weight, reason) {
  if (!element) return;
  if (has(a.yongshen, element)) {
    acc.support += (a.yongshen[0] === element ? 14 : 8) * weight;
    acc.reasons.push(`+${reason}->用神:${element}`);
  } else if (has(a.jishen, element)) {
    acc.friction += 11 * weight;
    acc.reasons.push(`-${reason}->忌神:${element}`);
  }
}

function addElementTendency(acc, a, element, base, reason) {
  if (!element) return;
  if (has(a.yongshen, element)) {
    const bonus = a.yongshen[0] === element ? base * 1.1 : base * 0.75;
    acc.support += bonus;
    acc.reasons.push(`+${reason}->用神勢:${element}`);
  } else if (has(a.jishen, element)) {
    acc.friction += base;
    acc.reasons.push(`-${reason}->忌神勢:${element}`);
  }
}

function addBElements(acc, a, b) {
  for (const axis of AXES) {
    const w = AXIS_WEIGHT[axis] || 0.4;
    addElementFit(acc, a, stemEl(b[axis]), w * 0.62, `${axis}.stem`);
    addElementFit(acc, a, branchEl(b[axis]), w * 0.58, `${axis}.branch`);
  }
}

function addDayRelation(acc, a, b) {
  const aEl = stemEl(a.day);
  const bEl = stemEl(b.day);
  if (!aEl || !bEl) return;
  if (aEl === bEl) {
    acc.bond += 4;
    acc.reasons.push("+比和");
  }
  if (ELEM_PRODUCES[bEl] === aEl) {
    acc.support += 9;
    acc.reasons.push("+生我");
  }
  if (ELEM_CONTROLS[bEl] === aEl) {
    acc.friction += 10;
    acc.reasons.push("-克我");
  }
  if (ELEM_PRODUCES[aEl] === bEl) {
    acc.drain += 5;
    acc.reasons.push("-我生");
  }
  if (ELEM_CONTROLS[aEl] === bEl) {
    acc.drain += 4;
    acc.reasons.push("-我克");
  }
}

function addInteractions(acc, a, b) {
  for (const axis of AXES) {
    const ap = a[axis];
    const bp = b[axis];
    if (!ap || !bp) continue;
    const w = AXIS_WEIGHT[axis] || 0.4;
    if (STEM_HE[ap.stem] === bp.stem) {
      acc.bond += 8 * w;
      acc.reasons.push(`+${axis}天干合`);
      addElementTendency(acc, a, STEM_HE_TRANSFORM[ap.stem + bp.stem], 4 * w, `${axis}.合化`);
    }
    if (STEM_CLASH[ap.stem] === bp.stem) {
      acc.friction += 8 * w;
      acc.reasons.push(`-${axis}天干沖`);
    }
    if (LIU_HE[ap.branch] === bp.branch) {
      acc.bond += 10 * w;
      acc.reasons.push(`+${axis}六合`);
      addElementTendency(acc, a, LIU_HE_TRANSFORM[ap.branch + bp.branch], 4 * w, `${axis}.六合化`);
    }
    if (BRANCH_CLASH[ap.branch] === bp.branch) {
      acc.friction += 14 * w;
      acc.reasons.push(`-${axis}沖`);
      const aEl = branchEl(ap);
      const bEl = branchEl(bp);
      if (has(a.yongshen, aEl) || has(a.yongshen, bEl)) {
        acc.friction += 7 * w;
        acc.reasons.push(`-${axis}沖動用神`);
      }
      if (has(a.jishen, aEl) || has(a.jishen, bEl)) {
        acc.support += 6 * w;
        acc.reasons.push(`+${axis}沖去忌神`);
      }
    }
    if (LIU_HAI[ap.branch] === bp.branch) {
      acc.friction += 7 * w;
      acc.reasons.push(`-${axis}害`);
    }
    if (LIU_PO[ap.branch] === bp.branch) {
      acc.friction += 5 * w;
      acc.reasons.push(`-${axis}破`);
    }
    if (xing(ap.branch, bp.branch)) {
      acc.friction += 7 * w;
      acc.reasons.push(`-${axis}刑`);
    }
  }
}

function addGroups(acc, a, b) {
  const aBranches = branchSet(a);
  const bBranches = branchSet(b);
  const combined = new Set([...aBranches, ...bBranches]);
  const scan = (groups, fullTag, halfTag, full, half) => {
    for (const group of groups) {
      const count = group.branches.filter((x) => combined.has(x)).length;
      const aCount = group.branches.filter((x) => aBranches.has(x)).length;
      const bCount = group.branches.filter((x) => bBranches.has(x)).length;
      if (count < 2 || aCount < 1 || bCount < 1 || count <= Math.max(aCount, bCount)) continue;
      if (count >= 3) {
        acc.bond += full;
        acc.reasons.push(`+${fullTag}:${group.element}`);
        addElementTendency(acc, a, group.element, full * 0.34, fullTag);
      } else {
        acc.bond += half;
        acc.reasons.push(`+${halfTag}:${group.element}`);
        addElementTendency(acc, a, group.element, half * 0.3, halfTag);
      }
    }
  };
  scan(SAN_HUI_GROUPS, "三會", "半三會", 16, 7);
  scan(SAN_HE_GROUPS, "三合", "半三合", 14, 6);
}

function oracleScore(a, b) {
  const acc = { support: 0, bond: 0, friction: 0, drain: 0, reasons: [] };
  addBElements(acc, a, b);
  addDayRelation(acc, a, b);
  addInteractions(acc, a, b);
  addGroups(acc, a, b);
  const mixedPenalty = acc.support >= 28 && acc.friction >= 28 ? Math.min(12, (acc.support + acc.friction) / 14) : 0;
  const raw = acc.support + acc.bond * 0.52 - acc.friction - acc.drain - mixedPenalty;
  return {
    score: Math.round(clamp(soft(raw))),
    support: Math.round(acc.support),
    bond: Math.round(acc.bond),
    friction: Math.round(acc.friction + acc.drain + mixedPenalty),
    reasons: acc.reasons.slice(0, 8),
  };
}

function legacyOne(a, b) {
  const r = pairBaseScore(a, b, a.yongshen, a.jishen, {});
  const day = modulateByTf(r.score, "day");
  const week = modulateByTf(r.score, "week");
  const month = modulateByTf(r.score, "month");
  const year = modulateByTf(r.score, "year");
  const luck = modulateByTf(r.score, "luck");
  return {
    score: Math.round((day + week + month + year + luck) / 5),
    raw: r.score,
    tags: r.tags,
  };
}

function mae(rows, key) {
  return rows.reduce((sum, row) => sum + Math.abs(row[key] - row.oracle), 0) / Math.max(1, rows.length);
}

function severeFlips(rows, key) {
  return rows.filter((row) => Math.abs(bucket(row[key]) - bucket(row.oracle)) >= 2).length;
}

function signMismatches(rows, key) {
  return rows.filter((row) => Math.sign(row[key]) !== Math.sign(row.oracle) && Math.abs(row.oracle) >= 12).length;
}

async function main() {
  const people = peopleFromGolden();
  assert(people.length >= 50, `expected >=50 people, got ${people.length}`);

  const v2ByA = new Map();
  for (const a of people) {
    const others = people.filter((p) => p.id !== a.id).map((p) => ({ id: p.id, year: p.year, month: p.month, day: p.day, hour: p.hour }));
    const payload = await buildNetworkScorePayload({
      scoringVersion: "v2",
      self: { year: a.year, month: a.month, day: a.day, hour: a.hour },
      others,
      selfYongshen: a.yongshen,
      selfJishen: a.jishen,
      date: "2026-06-03",
    });
    v2ByA.set(a.id, payload);
  }

  const rows = [];
  for (const a of people) {
    const payload = v2ByA.get(a.id);
    for (const b of people) {
      if (a.id === b.id) continue;
      const oracle = oracleScore(a, b);
      const legacy = legacyOne(a, b);
      const v2 = payload?.scores?.[b.id]?.overall;
      assert(Number.isFinite(v2), `missing V2 score ${a.id}->${b.id}`);
      rows.push({
        pair: `${a.id}->${b.id}`,
        a: a.name,
        b: b.name,
        oracle: oracle.score,
        legacy: legacy.score,
        legacyRaw: legacy.raw,
        v2,
        oracleLabel: label(oracle.score),
        legacyLabel: label(legacy.score),
        v2Label: label(v2),
        reasons: oracle.reasons,
      });
    }
  }

  const legacyMae = mae(rows, "legacy");
  const v2Mae = mae(rows, "v2");
  const legacyFlips = severeFlips(rows, "legacy");
  const v2Flips = severeFlips(rows, "v2");
  const legacySign = signMismatches(rows, "legacy");
  const v2Sign = signMismatches(rows, "v2");
  const improvement = (legacyMae - v2Mae) / Math.max(1, legacyMae) * 100;
  const flipImprovement = (legacyFlips - v2Flips) / Math.max(1, legacyFlips) * 100;

  const worse = rows
    .map((row) => ({ ...row, delta: Math.abs(row.v2 - row.oracle) - Math.abs(row.legacy - row.oracle) }))
    .sort((x, y) => y.delta - x.delta)
    .slice(0, 10);

  console.log("pair-classical-oracle regression");
  console.log(`people: ${people.length}`);
  console.log(`ordered pairs: ${rows.length}`);
  console.log(`legacy MAE vs oracle: ${legacyMae.toFixed(1)}`);
  console.log(`v2 MAE vs oracle: ${v2Mae.toFixed(1)}`);
  console.log(`MAE improvement: ${improvement.toFixed(1)}%`);
  console.log(`legacy severe flips: ${legacyFlips}`);
  console.log(`v2 severe flips: ${v2Flips}`);
  console.log(`flip improvement: ${flipImprovement.toFixed(1)}%`);
  console.log(`legacy sign mismatches: ${legacySign}`);
  console.log(`v2 sign mismatches: ${v2Sign}`);
  console.log("worst V2 regressions:");
  for (const row of worse) {
    console.log(`- ${row.pair} oracle=${row.oracle} legacy=${row.legacy} v2=${row.v2} delta=${row.delta} :: ${row.reasons.join("; ")}`);
  }

  if (!(v2Mae < legacyMae)) throw new Error("V2 did not improve MAE vs classical oracle");
  if (v2Flips > legacyFlips) throw new Error("V2 increased severe flips vs classical oracle");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
