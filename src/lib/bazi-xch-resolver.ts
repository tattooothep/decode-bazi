/**
 * 🔧 HK-XCH Resolver v1 · 合冲 resolution (สามจับฮะคลายชง / เห็นแก่ฮะลืมชง / ฮะแก้ชงแต่ดึงชงอื่น)
 *
 * ════════════════════ HARD RULE (ห้ามฝ่าฝืน) ════════════════════
 * 1. resolver นี้เป็น **deterministic guard** ระดับ structured layer
 *    → ห้ามให้ AI เดา · ห้าม override wrapper-7 · ห้ามแตะ Layer 0/1
 * 2. read-only consumer ของ pillars + interactions ที่ engine ส่งมา
 *    → ห้ามคำนวณ pillar เอง · ห้ามคำนวณ 用神 ใหม่
 * 3. ห้ามใส่ตัวเลข %/score ใน verdict (NO_PERCENT rule)
 * 4. ผลที่ resolver flag = หลักฐานเสริมสำหรับ AI ซินแส (ไม่ใช่ฟันธงดี-ร้าย)
 * ════════════════════════════════════════════════════════════════
 *
 * ตำราอ้างอิง:
 *  - 《子平真詮·七．論刑沖會合解法》(沈孝瞻) · "三會六合，可以解之"
 *  - 《子平真詮評註》(徐樂吾, 1936) · 第07章 "因解而反得刑沖"
 *  - 《滴天髓·體用 / 合局》(京圖 / 任鐵樵 1848) · "支神只以沖為重"
 *  - data/library/sifu-extra/bazi-hechong-resolution.md (A2.2 / A2.3)
 *
 * 3 rule ที่ implement (ผ่าน registry):
 *  - ZPZQ-XCH-001 三合解六沖 (สามจับฮะคลายชง)        → weakened_by_combination
 *  - ZPZQ-XCH-002 貪合忘冲 (เห็นแก่ฮะลืมชง)            → suppressed_by_stem_combo
 *  - ZPZQ-XCH-003 因解而反得刑衝 (ฮะแก้ชงแต่ดึงเคน/ชงอื่น) → secondary_clash_exposed
 */

import type { PillarKey, BaziPillarsLike, BaziPillarLike } from "./bazi-stem-strength";
import { activePillars, pillarIndex } from "./bazi-stem-strength";

export type XchVerdict =
  | "weakened_by_combination"   // 三合/半三合 มาคลาย 六沖
  | "suppressed_by_stem_combo"  // 天干合 ดึงก้านไป → กิ่งที่ชงอยู่ไม่ถูกปลุก
  | "secondary_clash_exposed";  // 三合แก้ชงเดิม แต่ลากกิ่งใหม่มาทำชง/刑 เสาอื่น

export type XchClashPair = { branches: [string, string]; pillars: [PillarKey, PillarKey] };

export type XchResolution = {
  ruleId: "ZPZQ-XCH-001" | "ZPZQ-XCH-002" | "ZPZQ-XCH-003";
  verdict: XchVerdict;
  /** เสาที่ resolver ระบุว่าได้รับผลของการแก้ขัด (รวมเสาที่เป็นต้นกำเนิดกับเสาที่เปลี่ยนพลัง) */
  affectedPillars: PillarKey[];
  /** กิ่งหรือก้านที่เกี่ยวข้องในเหตุการณ์ resolution */
  participants: Array<{ pillar: PillarKey; token: string; role: "clash" | "combo" | "exposed" }>;
  /** กิ่งที่เป็น clash เดิม (ถ้ามี) */
  originalClash?: XchClashPair;
  /** clash/刑 ที่ถูกเปิดเผยใหม่ (เฉพาะ XCH-003) */
  secondaryClash?: XchClashPair & { kind: "六沖" | "三刑" | "自刑" };
  /** ภาษาไทยอธิบาย (presentation; ไม่ใส่ %) */
  reasonTh: string;
  /** rule registry ที่ resolver ใช้เป็นต้นทาง */
  sourceRuleIds: string[];
  /** ระดับน้ำหนัก (high/medium/low) สำหรับ AI ใช้ประกอบ — ไม่ใช่เปอร์เซ็นต์ */
  confidence: "high" | "medium" | "low";
};

/* ────────────── ตารางพื้นฐาน (สำเนาจาก chart-extensions เพื่อให้ resolver standalone) ────────────── */

const SIX_CLASH: Record<string, string> = {
  子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅",
  卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳",
};

const SAN_HE_SETS: Array<{ set: [string, string, string]; element: "water" | "wood" | "fire" | "metal" }> = [
  { set: ["申", "子", "辰"], element: "water" },
  { set: ["亥", "卯", "未"], element: "wood" },
  { set: ["寅", "午", "戌"], element: "fire" },
  { set: ["巳", "酉", "丑"], element: "metal" },
];

/* 半三合 ต้องมี帝旺 (กิ่งกลาง) — ตำราระบุชัดใน A2.2.2 */
const BAN_HE_PAIRS: Array<{ pair: [string, string]; element: "water" | "fire" | "wood" | "metal" }> = [
  { pair: ["申", "子"], element: "water" }, { pair: ["子", "辰"], element: "water" },
  { pair: ["寅", "午"], element: "fire" },  { pair: ["午", "戌"], element: "fire" },
  { pair: ["亥", "卯"], element: "wood" },  { pair: ["卯", "未"], element: "wood" },
  { pair: ["巳", "酉"], element: "metal" }, { pair: ["酉", "丑"], element: "metal" },
];

/* 天干五合 — สำเนาเฉพาะคู่ + คู่ partner */
const STEM_COMBO: Record<string, string> = {
  甲: "己", 己: "甲", 乙: "庚", 庚: "乙", 丙: "辛", 辛: "丙",
  丁: "壬", 壬: "丁", 戊: "癸", 癸: "戊",
};

const SAN_XING_SET: Array<[string, string, string]> = [
  ["寅", "巳", "申"], ["丑", "戌", "未"],
];
const SELF_XING = new Set(["辰", "午", "酉", "亥"]);
const ZI_MAO_XING: Array<[string, string]> = [["子", "卯"]];

/* helper: เสาที่ active เรียงตาม pillarIndex */
type PlacedPillar = { key: PillarKey; stem: string; branch: string };

function placedFromPillars(pillars: BaziPillarsLike): PlacedPillar[] {
  return activePillars(pillars);
}

function findClashes(placed: PlacedPillar[]): XchClashPair[] {
  const out: XchClashPair[] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      if (SIX_CLASH[a.branch] === b.branch) {
        out.push({ branches: [a.branch, b.branch], pillars: [a.key, b.key] });
      }
    }
  }
  return out;
}

function findSanHeMatches(placed: PlacedPillar[]) {
  type Match = {
    kind: "full" | "half";
    branches: string[];
    pillars: PillarKey[];
    element: "water" | "wood" | "fire" | "metal";
    centerBranch: string;
  };
  const out: Match[] = [];
  for (const entry of SAN_HE_SETS) {
    const found = entry.set
      .map((br) => placed.find((p) => p.branch === br))
      .filter((p): p is PlacedPillar => Boolean(p));
    const distinctPillars = new Set(found.map((p) => p.key));
    if (distinctPillars.size >= 3) {
      out.push({
        kind: "full",
        branches: found.map((p) => p.branch),
        pillars: found.map((p) => p.key),
        element: entry.element,
        centerBranch: entry.set[1],
      });
    }
  }
  // half (帝旺-bearing only)
  for (const half of BAN_HE_PAIRS) {
    const a = placed.find((p) => p.branch === half.pair[0]);
    const b = placed.find((p) => p.branch === half.pair[1]);
    if (a && b && a.key !== b.key) {
      const centerBranch = SAN_HE_SETS.find((s) => s.element === half.element)?.set[1] || "";
      if (!centerBranch) continue;
      // เฉพาะ half ที่มี帝旺 (= a หรือ b ตรงกับ centerBranch)
      if (a.branch !== centerBranch && b.branch !== centerBranch) continue;
      // ห้ามนับซ้ำกับ full
      const inFull = out.some(
        (m) =>
          m.kind === "full" &&
          m.element === half.element &&
          m.pillars.includes(a.key) &&
          m.pillars.includes(b.key),
      );
      if (inFull) continue;
      out.push({
        kind: "half",
        branches: [a.branch, b.branch],
        pillars: [a.key, b.key],
        element: half.element,
        centerBranch,
      });
    }
  }
  return out;
}

/* หา 天干合 (五合) คู่ที่ visible */
function findStemCombos(placed: PlacedPillar[]) {
  const out: Array<{ pair: [string, string]; pillars: [PillarKey, PillarKey] }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      if (STEM_COMBO[a.stem] === b.stem) {
        const key = [a.key, b.key].sort().join("-");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ pair: [a.stem, b.stem], pillars: [a.key, b.key] });
      }
    }
  }
  return out;
}

/* helper: เป็น "adjacent" ในความหมาย XCH คือเสาติดกัน (Δindex ≤ 1) */
function adjacent(a: PillarKey, b: PillarKey): boolean {
  return Math.abs(pillarIndex(a) - pillarIndex(b)) <= 1;
}

/* ────────────── RULE A: 三合解六沖 (ZPZQ-XCH-001) ────────────── */
function detectSanHeResolvesChong(
  placed: PlacedPillar[],
  clashes: XchClashPair[],
  sanHeMatches: ReturnType<typeof findSanHeMatches>,
): XchResolution[] {
  const out: XchResolution[] = [];
  for (const clash of clashes) {
    const [b1, b2] = clash.branches;
    for (const match of sanHeMatches) {
      // 三合 ต้องครอบกิ่งใดกิ่งหนึ่งของ clash
      const coversB1 = match.branches.includes(b1);
      const coversB2 = match.branches.includes(b2);
      if (!coversB1 && !coversB2) continue;
      // ข้อยกเว้น A2.3.4: ถ้าเป็น 沖ที่ "ก้านกลาง帝旺" ของ三合全 → 沖開 ไม่ใช่ resolution
      if (match.kind === "full") {
        const centerHit = match.centerBranch === b1 || match.centerBranch === b2;
        if (centerHit) continue;
      }
      const participants: XchResolution["participants"] = [
        ...clash.pillars.map((pk, idx) => ({
          pillar: pk,
          token: clash.branches[idx],
          role: "clash" as const,
        })),
        ...match.pillars.map((pk, idx) => ({
          pillar: pk,
          token: match.branches[idx],
          role: "combo" as const,
        })),
      ];
      const tag = match.kind === "full" ? "三合" : "半三合";
      const reasonTh =
        `${tag}${match.branches.join("")}ธาตุ${zhEl(match.element)} ดึงกิ่ง ${b1}/${b2} เข้าฮะ → คลายแรง ${b1}${b2}沖 ลงเป็น "ชงอ่อน" (ไม่ตัด ไม่หาย)`;
      out.push({
        ruleId: "ZPZQ-XCH-001",
        verdict: "weakened_by_combination",
        affectedPillars: Array.from(new Set([...clash.pillars, ...match.pillars])),
        participants,
        originalClash: clash,
        reasonTh,
        sourceRuleIds: ["ZPZQ-XCH-001", "HK-ORDER-001"],
        confidence: match.kind === "full" ? "high" : "medium",
      });
    }
  }
  return out;
}

/* ────────────── RULE B: 貪合忘冲 (ZPZQ-XCH-002) ────────────── */
function detectStemComboSuppressesChong(
  placed: PlacedPillar[],
  clashes: XchClashPair[],
  stemCombos: ReturnType<typeof findStemCombos>,
): XchResolution[] {
  const out: XchResolution[] = [];
  for (const clash of clashes) {
    for (const combo of stemCombos) {
      // เงื่อนไข: ก้านที่合 อยู่บน "เสาเดียวกัน" กับกิ่งที่ชง — แทนแรงให้ดึงพันธาก่อน
      // (ตามหลัก 沈孝瞻 ที่ "ก้านมาช่วยอยู่ติด" + ภายในผัง)
      const comboPillarsSet = new Set(combo.pillars);
      const clashPillarsSet = new Set(clash.pillars);
      const overlap = [...comboPillarsSet].filter((p) => clashPillarsSet.has(p));
      if (overlap.length === 0) continue;
      // นอกจากนี้ คู่ที่ไม่ overlap ของ stem combo ต้อง adjacent กับเสา clash อย่างน้อยฝั่งใดฝั่งหนึ่ง
      const otherComboPillar = combo.pillars.find((p) => !clashPillarsSet.has(p));
      if (otherComboPillar && !clash.pillars.some((cp) => adjacent(cp, otherComboPillar))) continue;
      const participants: XchResolution["participants"] = [
        ...clash.pillars.map((pk, idx) => ({
          pillar: pk,
          token: clash.branches[idx],
          role: "clash" as const,
        })),
        ...combo.pillars.map((pk, idx) => ({
          pillar: pk,
          token: combo.pair[idx],
          role: "combo" as const,
        })),
      ];
      const reasonTh =
        `${combo.pair.join("")}ก้านฟ้าฮะกัน ผูกก้านบนเสา ${overlap.join("/")} → เสาที่ชงกัน (${clash.branches[0]}${clash.branches[1]}) ถูกพันธชั่วคราว แรง沖จึงถูกระงับ (貪合忘冲)`;
      out.push({
        ruleId: "ZPZQ-XCH-002",
        verdict: "suppressed_by_stem_combo",
        affectedPillars: Array.from(new Set([...clash.pillars, ...combo.pillars])),
        participants,
        originalClash: clash,
        reasonTh,
        sourceRuleIds: ["ZPZQ-XCH-002", "ZPZQ-HE-000", "HK-ORDER-001"],
        confidence: "medium",
      });
    }
  }
  return out;
}

/* ────────────── RULE C: 因解而反得刑衝 (ZPZQ-XCH-003) ────────────── */
function detectSecondaryClashExposed(
  placed: PlacedPillar[],
  clashes: XchClashPair[],
  sanHeMatches: ReturnType<typeof findSanHeMatches>,
): XchResolution[] {
  const out: XchResolution[] = [];
  if (sanHeMatches.length === 0) return out;
  for (const clash of clashes) {
    for (const match of sanHeMatches) {
      // เงื่อนไข: 三合 (full/half) แก้ chong ตัวเดิมได้ — แต่นำกิ่งใหม่เข้ามาที่ทำชง/刑 กับเสาอื่น
      const coversClash = match.branches.includes(clash.branches[0]) || match.branches.includes(clash.branches[1]);
      if (!coversClash) continue;
      // หากเป็น full + center hit → ข้าม (กลายเป็น 沖開 ไม่ใช่ "secondary")
      if (match.kind === "full" && (match.centerBranch === clash.branches[0] || match.centerBranch === clash.branches[1])) continue;

      // ตรวจกิ่งใน三合 ว่ามีตัวที่ไป沖กับเสา"นอกกลุ่ม"ใหม่ไหม
      const involvedPillarsSet = new Set([...clash.pillars, ...match.pillars]);
      for (const p of placed) {
        if (involvedPillarsSet.has(p.key)) continue;
        for (let i = 0; i < match.branches.length; i++) {
          const mbBranch = match.branches[i];
          const mbPillar = match.pillars[i];
          if (mbPillar === p.key) continue;
          if (SIX_CLASH[mbBranch] === p.branch) {
            out.push({
              ruleId: "ZPZQ-XCH-003",
              verdict: "secondary_clash_exposed",
              affectedPillars: Array.from(new Set([...clash.pillars, ...match.pillars, p.key])),
              participants: [
                ...clash.pillars.map((pk, idx) => ({ pillar: pk, token: clash.branches[idx], role: "clash" as const })),
                ...match.pillars.map((pk, idx) => ({ pillar: pk, token: match.branches[idx], role: "combo" as const })),
                { pillar: p.key, token: p.branch, role: "exposed" as const },
              ],
              originalClash: clash,
              secondaryClash: {
                branches: [mbBranch, p.branch],
                pillars: [mbPillar, p.key],
                kind: "六沖",
              },
              reasonTh:
                `${match.kind === "full" ? "三合" : "半三合"}${match.branches.join("")}แก้ ${clash.branches.join("")}沖 ได้ — แต่ดึงกิ่ง${mbBranch}เข้ามาทำชง${p.branch}เสา ${p.key} ใหม่ (因解而反得刑衝)`,
              sourceRuleIds: ["ZPZQ-XCH-003", "HK-ORDER-001"],
              confidence: "medium",
            });
          }
        }
      }

      // ตรวจ三刑 / 自刑 ที่อาจถูกเปิดออกใหม่จาก三合
      for (const trio of SAN_XING_SET) {
        const have = trio.filter((br) => placed.some((p) => p.branch === br));
        if (have.length < 3) continue;
        // ต้องมีกิ่งใน三合 contribute ขั้น刑นี้ และไม่เคย register แล้ว
        const matchContributes = trio.some((br) => match.branches.includes(br));
        if (!matchContributes) continue;
        const trioPillars = trio
          .map((br) => placed.find((p) => p.branch === br))
          .filter((p): p is PlacedPillar => Boolean(p))
          .map((p) => p.key);
        // ต้องมีอย่างน้อยหนึ่งเสา刑อยู่นอก三合 — กิ่งที่ "ถูกเปิด" จากการแก้ชง
        const exposedPillars = trioPillars.filter((pk) => !match.pillars.includes(pk));
        if (exposedPillars.length === 0) continue;
        out.push({
          ruleId: "ZPZQ-XCH-003",
          verdict: "secondary_clash_exposed",
          affectedPillars: Array.from(new Set([...clash.pillars, ...match.pillars, ...exposedPillars])),
          participants: [
            ...clash.pillars.map((pk, idx) => ({ pillar: pk, token: clash.branches[idx], role: "clash" as const })),
            ...match.pillars.map((pk, idx) => ({ pillar: pk, token: match.branches[idx], role: "combo" as const })),
            ...exposedPillars.map((pk) => ({
              pillar: pk,
              token: placed.find((p) => p.key === pk)?.branch || "",
              role: "exposed" as const,
            })),
          ],
          originalClash: clash,
          secondaryClash: {
            branches: [trio[0], trio[trio.length - 1]],
            pillars: [trioPillars[0], trioPillars[trioPillars.length - 1]],
            kind: "三刑",
          },
          reasonTh:
            `${match.kind === "full" ? "三合" : "半三合"}${match.branches.join("")}แก้ ${clash.branches.join("")}沖 ได้ — แต่เปิดทาง 三刑 ${trio.join("/")} ทำงานต่อเนื่อง (因解而反得刑衝)`,
          sourceRuleIds: ["ZPZQ-XCH-003", "HK-ORDER-001"],
          confidence: "low",
        });
      }
      // 自刑 + 子卯刑
      for (const sb of placed) {
        if (involvedPillarsSet.has(sb.key)) continue;
        if (!SELF_XING.has(sb.branch)) continue;
        const sameElsewhere = placed.filter((p) => p.branch === sb.branch && p.key !== sb.key);
        if (sameElsewhere.length === 0) continue;
        // ต้องมี match contribute (กิ่งใน match) ที่ไม่ใช่กิ่ง自刑นั้น
        if (!match.branches.some((br) => br !== sb.branch)) continue;
        out.push({
          ruleId: "ZPZQ-XCH-003",
          verdict: "secondary_clash_exposed",
          affectedPillars: Array.from(new Set([...clash.pillars, ...match.pillars, sb.key, sameElsewhere[0].key])),
          participants: [
            ...clash.pillars.map((pk, idx) => ({ pillar: pk, token: clash.branches[idx], role: "clash" as const })),
            ...match.pillars.map((pk, idx) => ({ pillar: pk, token: match.branches[idx], role: "combo" as const })),
            { pillar: sb.key, token: sb.branch, role: "exposed" as const },
            { pillar: sameElsewhere[0].key, token: sameElsewhere[0].branch, role: "exposed" as const },
          ],
          originalClash: clash,
          secondaryClash: {
            branches: [sb.branch, sameElsewhere[0].branch],
            pillars: [sb.key, sameElsewhere[0].key],
            kind: "自刑",
          },
          reasonTh:
            `${match.kind === "full" ? "三合" : "半三合"}${match.branches.join("")}คลายชงเดิม แต่ปลุก自刑 ${sb.branch}${sameElsewhere[0].branch} เสา ${sb.key}/${sameElsewhere[0].key} (因解而反得刑衝)`,
          sourceRuleIds: ["ZPZQ-XCH-003", "HK-ORDER-001"],
          confidence: "low",
        });
      }
      for (const [b1, b2] of ZI_MAO_XING) {
        const p1 = placed.find((p) => p.branch === b1);
        const p2 = placed.find((p) => p.branch === b2);
        if (!p1 || !p2) continue;
        if (involvedPillarsSet.has(p1.key) && involvedPillarsSet.has(p2.key)) continue;
        if (!match.branches.includes(b1) && !match.branches.includes(b2)) continue;
        out.push({
          ruleId: "ZPZQ-XCH-003",
          verdict: "secondary_clash_exposed",
          affectedPillars: Array.from(new Set([...clash.pillars, ...match.pillars, p1.key, p2.key])),
          participants: [
            ...clash.pillars.map((pk, idx) => ({ pillar: pk, token: clash.branches[idx], role: "clash" as const })),
            ...match.pillars.map((pk, idx) => ({ pillar: pk, token: match.branches[idx], role: "combo" as const })),
            { pillar: p1.key, token: p1.branch, role: "exposed" as const },
            { pillar: p2.key, token: p2.branch, role: "exposed" as const },
          ],
          originalClash: clash,
          secondaryClash: {
            branches: [b1, b2],
            pillars: [p1.key, p2.key],
            kind: "三刑",
          },
          reasonTh:
            `${match.kind === "full" ? "三合" : "半三合"}${match.branches.join("")}แก้ชงเดิม แต่ปลุก 子卯刑 (因解而反得刑衝)`,
          sourceRuleIds: ["ZPZQ-XCH-003", "HK-ORDER-001"],
          confidence: "low",
        });
      }
    }
  }
  // dedupe โดย key
  const seen = new Set<string>();
  const dedup: XchResolution[] = [];
  for (const r of out) {
    const key = [
      r.ruleId,
      r.affectedPillars.slice().sort().join("/"),
      r.secondaryClash?.branches.join("") || "",
      r.secondaryClash?.kind || "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(r);
  }
  return dedup;
}

function zhEl(el: "water" | "wood" | "fire" | "earth" | "metal"): string {
  if (el === "water") return "น้ำ";
  if (el === "wood") return "ไม้";
  if (el === "fire") return "ไฟ";
  if (el === "earth") return "ดิน";
  return "ทอง";
}

/* ────────────── Public API ────────────── */
export type ResolveXchInput = {
  pillars: BaziPillarsLike;
  /** interactions ที่ engine ส่งมา (raw natal/luck/annual) — resolver อาจอ้างอิง chong ที่ engine จับไว้แล้ว
   *  ปัจจุบัน resolver พึ่งกิ่ง 4 เสาเป็นหลัก (deterministic) · interactions ใช้สำหรับ trace optional */
  interactions?: Array<{ type: string; pillars_pair?: [string, string]; pair?: [string, string] }>;
};

export function resolveXch(input: ResolveXchInput): { resolutions: XchResolution[] } {
  const { pillars } = input;
  const placed = placedFromPillars(pillars);
  if (placed.length < 2) return { resolutions: [] };

  const clashes = findClashes(placed);
  const sanHeMatches = findSanHeMatches(placed);
  const stemCombos = findStemCombos(placed);

  const resolutions: XchResolution[] = [];

  // RULE A — 三合解六沖
  if (clashes.length > 0 && sanHeMatches.length > 0) {
    resolutions.push(...detectSanHeResolvesChong(placed, clashes, sanHeMatches));
  }
  // RULE B — 貪合忘冲
  if (clashes.length > 0 && stemCombos.length > 0) {
    resolutions.push(...detectStemComboSuppressesChong(placed, clashes, stemCombos));
  }
  // RULE C — 因解而反得刑衝
  if (clashes.length > 0 && sanHeMatches.length > 0) {
    resolutions.push(...detectSecondaryClashExposed(placed, clashes, sanHeMatches));
  }

  return { resolutions };
}

export function explainXchResolution(r: XchResolution): string {
  const ps = r.participants
    .map((p) => `${p.pillar}:${p.token}(${p.role})`)
    .join(",");
  const sec = r.secondaryClash
    ? ` · secondary=${r.secondaryClash.kind}:${r.secondaryClash.branches.join("")}`
    : "";
  return `${r.ruleId} · ${r.verdict} · ${r.reasonTh} · [${ps}]${sec} · rule=${r.sourceRuleIds.join("/")}`;
}

/** export utility (สำหรับ test/registry) */
export const XCH_INTERNAL = {
  SIX_CLASH,
  SAN_HE_SETS,
  BAN_HE_PAIRS,
  STEM_COMBO,
  findClashes,
  findSanHeMatches,
  findStemCombos,
};

// reference unused for compile guard
type _Unused = Pick<BaziPillarLike, "stem" | "branch">;
