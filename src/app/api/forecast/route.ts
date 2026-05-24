/**
 * POST /api/forecast · 16 พ.ค. 2026
 *
 * รับ:  { question, method: "meihua"|"qmdj"|"coin", category?, lang? }
 * คืน:  { engine: string (HTML), ai: string (markdown) }
 *
 * Layer 3 · เรียก Layer 0/1 (bazi-calc + year-hexagram) + qimen-api + Claude CLI
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { calcBazi } from "@/lib/bazi-calc";
import { hexagramForStemBranch, HEXAGRAMS_64, TRIGRAMS_8 } from "@/lib/year-hexagram";
import { q1 } from "@/lib/db";

const TIMEOUT_MS = 60_000;
const CHILD_USER = "jarvis";
const QIMEN_BASE = process.env.QIMEN_API_URL || "http://localhost:4090";

type Method = "meihua" | "qmdj" | "coin";

/* 16 พ.ค. 2026 (อากงอาม่า v2.0): ดึง deep interpretation ของ hex จาก DB */
async function fetchHexDeep(num: number): Promise<unknown> {
  if (!num || num < 1 || num > 64) return null;
  const part = num <= 16 ? '1_16' : num <= 32 ? '17_32' : num <= 48 ? '33_48' : '49_64';
  try {
    const row = await q1<{ data: { interpretations: Array<{ no: number }> } }>(
      `SELECT data FROM ref_akg_data WHERE key=$1`,
      [`v2_0${num <= 16 ? 1 : num <= 32 ? 2 : num <= 48 ? 3 : 4}_deep_${part}`]
    );
    if (!row) return null;
    const interps = row.data?.interpretations || [];
    return interps.find(i => i.no === num) || null;
  } catch (e) {
    console.warn('[forecast] fetchHexDeep failed:', (e as Error).message);
    return null;
  }
}

/* 16 พ.ค. 2026 (อากงอาม่า v3.0): ดึง 384 爻辭 ของเส้นที่เปลี่ยน
   num = 1..64 · lines = [1..6] (อาจหลายเส้น)  คืน [{line,name_zh,text_zh,translation_thai,meaning,advice}] */
type YaoCi = { line: number; name_zh: string; text_zh: string; translation_thai: string; meaning: string; advice: string };
async function fetchYaoCi(num: number, lines: number[]): Promise<YaoCi[]> {
  if (!num || num < 1 || num > 64 || !lines?.length) return [];
  const fileIdx = num <= 16 ? '1_16' : num <= 32 ? '17_32' : num <= 48 ? '33_48' : '49_64';
  const key = `v3_yao_ci_${fileIdx}`;
  try {
    const row = await q1<{ data: { hexagrams_yao_ci: Array<{ no: number; lines: YaoCi[] }> } }>(
      `SELECT data FROM ref_akg_data WHERE key=$1`, [key]
    );
    if (!row) return [];
    const hex = row.data?.hexagrams_yao_ci?.find(h => h.no === num);
    if (!hex) return [];
    return lines.filter(ln => ln >= 1 && ln <= 6).map(ln => hex.lines[ln - 1]).filter(Boolean);
  } catch (e) {
    console.warn('[forecast] fetchYaoCi failed:', (e as Error).message);
    return [];
  }
}

/* ─── Engine 1: Mei Hua Yi Shu (梅花易數) — by time + question hash ─── */
async function engineMeihua(_question: string) {
  const now = new Date();
  // pillars จาก current time
  const c = await calcBazi({
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    longitude: 100.5018,
    gmtOffsetHours: 7,
  });
  // upperGua = year+month+day stem-branch idx · lowerGua = +hour
  const benHex = hexagramForStemBranch(c.pillars.hour.stem, c.pillars.hour.branch);
  if (!benHex || !benHex.hex) {
    return { engine: "ไม่สามารถคำนวณ Mei Hua ได้", structured: null };
  }
  const cl = benHex.changing_line;
  // bian gua: flip changing line
  const flipped = benHex.binary.split("").map((b, i) => (i === cl - 1 ? (b === "1" ? "0" : "1") : b)).join("");
  const bianHex = HEXAGRAMS_64[flipped] || null;
  const engine =
    `<b>梅花易數 · เหมยฮัว (ขณะเวลา ${now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })})</b><br/>` +
    `<b>本卦 (เปลือก)</b>: ${benHex.hex.symbol} 卦 ${benHex.num} ${benHex.hex.zh} · ${benHex.hex.th}<br/>` +
    `<b>上卦</b> ${benHex.upper.zh} · <b>下卦</b> ${benHex.lower.zh}<br/>` +
    `<b>變爻</b> เส้นที่ ${cl} ${bianHex ? `→ <b>之卦</b> ${bianHex.symbol} 卦 ${bianHex.num} ${bianHex.zh} · ${bianHex.th}` : ""}<br/>` +
    `<b>วันเจ้า</b>: ${c.dayMaster}`;
  /* bian gua upper/lower for display */
  const bianUpperBin = flipped.slice(0, 3);
  const bianLowerBin = flipped.slice(3, 6);
  const TRI_ZH = { "111": "乾", "110": "兌", "101": "離", "100": "震", "011": "巽", "010": "坎", "001": "艮", "000": "坤" };
  return {
    engine,
    structured: {
      method: "meihua",
      ben_hex: { num: benHex.num, zh: benHex.hex.zh, th: benHex.hex.th, en: benHex.hex.en, symbol: benHex.hex.symbol, binary: benHex.binary },
      bian_hex: bianHex ? { num: bianHex.num, zh: bianHex.zh, th: bianHex.th, en: bianHex.en, symbol: bianHex.symbol, binary: flipped } : null,
      changing_line: cl,
      upper: benHex.upper.zh,
      lower: benHex.lower.zh,
      bian_upper: TRI_ZH[bianUpperBin as keyof typeof TRI_ZH] || "?",
      bian_lower: TRI_ZH[bianLowerBin as keyof typeof TRI_ZH] || "?",
      pillars: c.pillarsZh,
      day_master: c.dayMaster,
    },
  };
}

/* ─── Engine 2: QMDJ — call qimen-api ─── */
/* trigram code → binary (top→bottom) · ตำราอี้จิง */
const TRIGRAM_BIN: Record<string, string> = {
  QIAN: "111", DUI: "110", LI: "101", ZHEN: "100",
  XUN: "011", KAN: "010", GEN: "001", KUN: "000",
};
const TRIGRAM_ZH: Record<string, string> = {
  QIAN: "乾", DUI: "兌", LI: "離", ZHEN: "震",
  XUN: "巽", KAN: "坎", GEN: "艮", KUN: "坤",
  ZHONG: "中",
};
async function engineQmdj(_question: string, _category: string) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  const r = await fetch(`${QIMEN_BASE}/api/qimen/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ datetime: `${date}T${time}:00`, longitude: 100.5018, latitude: 13.7563, profile_id: 4 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error("qimen-api failed");
  const j = await r.json();
  const c = j.data?.chart;
  const palacesRaw: Array<Record<string, unknown>> = j.data?.palaces || [];
  if (!c) throw new Error("no chart from qimen-api");
  /* 16 พ.ค.: ถอดเป็นเหี่ยอี้จิง (อากงอาม่า method) ·
     - 體卦 (lower/Ti) = palace ของ 值使門 → trigram ของ palace นั้น
     - 用卦 (upper/Yong) = palace ของ 值符 (chief star) → trigram ของ palace นั้น
     - 變爻 = (hour pillar position) % 6 + 1 */
  let upperPalace = null, lowerPalace = null;
  for (const p of palacesRaw) {
    if (p.star_code === c.chief_star_code && !upperPalace) upperPalace = p;
    if (p.door_code === c.zhi_shi_door_code && !lowerPalace) lowerPalace = p;
  }
  const upperTri = upperPalace ? String(upperPalace.trigram_code) : "QIAN";
  const lowerTri = lowerPalace ? String(lowerPalace.trigram_code) : "QIAN";
  const upperBin = TRIGRAM_BIN[upperTri] || "111";
  const lowerBin = TRIGRAM_BIN[lowerTri] || "111";
  const binary = upperBin + lowerBin;
  let benHex: { num: number; zh: string; th: string; en: string; symbol: string; binary: string } | null = null;
  const h = HEXAGRAMS_64[binary];
  if (h) benHex = { num: h.num, zh: h.zh, th: h.th, en: h.en, symbol: h.symbol, binary };
  /* changing line จาก hour pillar (壬午 = stem 8 + branch 6 = 14 % 6 = 2) */
  const STEMS = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
  const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
  const hp = String(c.pillar_zh || "甲子");
  const cl = ((STEMS.indexOf(hp[0]) + BRANCHES.indexOf(hp[1]) + 1) % 6) + 1;
  const flipped = binary.split("").map((b, i) => (i === 6 - cl ? (b === "1" ? "0" : "1") : b)).join("");
  const bh = HEXAGRAMS_64[flipped];
  const bianHex = bh ? { num: bh.num, zh: bh.zh, th: bh.th, en: bh.en, symbol: bh.symbol, binary: flipped } : null;
  /* compact 9 palaces (3x3 grid · palace_id 1-9 Houtian) */
  const grid: Array<Record<string, unknown>> = palacesRaw.map(p => ({
    id: p.palace_id,
    row: p.grid_row,
    col: p.grid_col,
    direction: p.direction,
    trigram: p.trigram_code,
    trigram_zh: TRIGRAM_ZH[String(p.trigram_code)] || "?",
    element: p.element_code,
    heaven_stem: p.heaven_stem_code,
    earth_stem: p.earth_stem_code,
    star: p.star_code,
    door: p.door_code,
    deity: p.deity_code,
    branches: p.branches_zh,
    is_chief_star: p.star_code === c.chief_star_code,
    is_zhi_shi_door: p.door_code === c.zhi_shi_door_code,
  }));
  const engine =
    `<b>奇門遁甲 · ${c.dun_type === "yang" ? "陽" : "陰"}遁 ${c.ju_number} 局</b><br/>` +
    `<b>時柱</b> ${c.pillar_zh} · <b>旬首</b> ${c.xun_hour_zh} · <b>遁干</b> ${c.dun_gan_zh}<br/>` +
    `<b>值符星</b> ${c.chief_star_code} (อยู่วัง ${upperPalace?.palace_id ?? "?"} · ${TRIGRAM_ZH[upperTri]}) <br/>` +
    `<b>值使門</b> ${c.zhi_shi_door_code} (อยู่วัง ${lowerPalace?.palace_id ?? "?"} · ${TRIGRAM_ZH[lowerTri]}) <br/>` +
    `<b>天乙星</b> ${c.tian_yi_star_zh || "—"}`;
  return {
    engine,
    structured: {
      method: "qmdj",
      ju_number: c.ju_number,
      dun_type: c.dun_type,
      pillar: c.pillar_zh,
      xun: c.xun_hour_zh,
      dun_gan: c.dun_gan_zh,
      chief_star: c.chief_star_code,
      zhi_shi_door: c.zhi_shi_door_code,
      chief_deity: c.chief_deity_code,
      tian_yi_star: c.tian_yi_star_zh,
      grid,
      derived_hex: {
        upper_trigram: upperTri,
        upper_trigram_zh: TRIGRAM_ZH[upperTri],
        lower_trigram: lowerTri,
        lower_trigram_zh: TRIGRAM_ZH[lowerTri],
        ben_hex: benHex,
        bian_hex: bianHex,
        changing_line: cl,
        upper_palace_id: upperPalace?.palace_id ?? null,
        lower_palace_id: lowerPalace?.palace_id ?? null,
      },
    },
  };
}

/* ─── Engine 3: 3-Coin Toss — random 6 lines · หรือใช้ coin_lines จาก client (อากง ritual) ─── */
function engineCoin(_question: string, providedLines?: number[]) {
  // 3-coin method: each toss = sum of 3 coins (head=3, tail=2)
  // total 6 = 老陰(0,changing), 7 = 少陽, 8 = 少陰, 9 = 老陽(1,changing)
  const lines: { val: number; bit: number; changing: boolean }[] = [];
  const useProvided = Array.isArray(providedLines) && providedLines.length === 6 && providedLines.every(v => v >= 6 && v <= 9);
  for (let i = 0; i < 6; i++) {
    let sum: number;
    if (useProvided) {
      sum = providedLines[i];
    } else {
      sum = 0;
      for (let c = 0; c < 3; c++) sum += Math.random() < 0.5 ? 3 : 2;
    }
    const bit = sum === 6 || sum === 8 ? 0 : 1; // yin=0, yang=1
    const changing = sum === 6 || sum === 9;
    lines.push({ val: sum, bit, changing });
  }
  // ben gua: bottom→top (line[0] = bottom = inner)
  // Trigram binary = top→bottom (per TRIGRAMS_8)
  const lower = lines.slice(0, 3).reverse().map(l => l.bit).join(""); // top→bottom of lower
  const upper = lines.slice(3, 6).reverse().map(l => l.bit).join("");
  const binary = upper + lower;
  const benHex = HEXAGRAMS_64[binary];
  // bian gua: flip changing lines
  const bianBits = lines.map(l => (l.changing ? 1 - l.bit : l.bit));
  const bianLower = bianBits.slice(0, 3).reverse().join("");
  const bianUpper = bianBits.slice(3, 6).reverse().join("");
  const bianHex = HEXAGRAMS_64[bianUpper + bianLower];
  const changingLines = lines.map((l, i) => l.changing ? i + 1 : -1).filter(i => i > 0);
  const lineStr = lines.map((l, i) => `เส้น${i + 1}=${l.val}${l.changing ? "*" : ""}`).join(" · ");
  const engine =
    `<b>三錢卦 · โยนเหรียญ 6 รอบ</b><br/>` +
    `<small>${lineStr}</small><br/>` +
    (benHex
      ? `<b>本卦</b>: ${benHex.symbol} 卦 ${benHex.num} ${benHex.zh} · ${benHex.th}<br/>`
      : "") +
    (changingLines.length
      ? `<b>變爻</b> เส้น ${changingLines.join(",")} ${bianHex ? `→ <b>之卦</b> ${bianHex.symbol} 卦 ${bianHex.num} ${bianHex.zh} · ${bianHex.th}` : ""}`
      : `<b>ไม่มีเส้นเปลี่ยน</b>`);
  return {
    engine,
    structured: {
      method: "coin",
      ben_hex: benHex ? { num: benHex.num, zh: benHex.zh, th: benHex.th, en: benHex.en, symbol: benHex.symbol } : null,
      bian_hex: bianHex ? { num: bianHex.num, zh: bianHex.zh, th: bianHex.th, en: bianHex.en, symbol: bianHex.symbol } : null,
      changing_lines: changingLines,
      lines: lines.map(l => l.val),
    },
  };
}

/* ─── AI Sifu summary ─── */
const LANG_INSTR: Record<string, string> = {
  th: "ตอบเป็นภาษาไทย · สั้นกระชับ 4-6 บรรทัด · ใช้ markdown bold + emoji · อิงตำราคลาสสิก (子平真詮 · 滴天髓 · 三命通會 · 煙波釣叟賦)",
  en: "Reply in English · 4-6 lines · markdown bold + emoji · classical sources",
  zh: "用繁體中文回答 · 4-6 行 · markdown 粗體 + emoji · 子平真詮·滴天髓·三命通會·煙波釣叟賦",
};
const CAT_FOCUS: Record<string, string> = {
  general: "ทั่วไป — แนะนำดี/ระวัง",
  business: "ธุรกิจ/ดีล — ปิดได้/ระวัง · จังหวะ · คน",
  love: "ความรัก — โอกาส/อุปสรรค · ทิศทาง",
  finance: "การเงิน — เข้า/ออก · จังหวะ",
  health: "สุขภาพ — จุดเสี่ยง",
  travel: "เดินทาง — ปลอดภัย/ระวัง",
  legal: "คดี/ขัดแย้ง — แพ้/ชนะ",
};

function buildPrompt(question: string, method: Method, category: string, lang: string, structured: unknown): string {
  return `คุณคือซินแสพยากรณ์ของ hourkey.io · ใช้วิธี "${method}" ตอบคำถามนี้

${LANG_INSTR[lang] || LANG_INSTR.th}

หัวข้อ: ${CAT_FOCUS[category] || CAT_FOCUS.general}

ผลคำนวณจาก engine (structured):
${JSON.stringify(structured, null, 2)}

คำถามลูกค้า: ${question}

ตอบให้ตรงคำถาม · เริ่มด้วย "✓ ปิดได้" / "✗ ยังไม่ได้" / "⚠ ต้องระวัง" ตามผัง แล้วอธิบายเหตุผลจาก 卦/星/門/神 · ปิดท้ายด้วยคำแนะนำ 1-2 บรรทัด`;
}

async function runClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const claudeArgs = ["-p", "--output-format", "text", "--dangerously-skip-permissions", "--setting-sources", "user"];
    const spawnArgs = ["-u", CHILD_USER, "-H", "claude", ...claudeArgs];
    const c = spawn("sudo", spawnArgs, { cwd: "/var/www/checklist-app", env: process.env });
    let out = ""; let err = "";
    const timer = setTimeout(() => { try { c.kill("SIGKILL"); } catch {} reject(new Error("timeout")); }, TIMEOUT_MS);
    c.stdout.on("data", chunk => { out += chunk.toString(); });
    c.stderr.on("data", chunk => { err += chunk.toString(); });
    c.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`claude exit ${code} · ${err.slice(0, 300)}`));
    });
    c.stdin.write(prompt);
    c.stdin.end();
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const question: string = (body.question || "").trim();
    const method: Method = ["meihua", "qmdj", "coin"].includes(body.method) ? body.method : "qmdj";
    const category: string = body.category || "general";
    const lang: string = ["th", "en", "zh"].includes(body.lang) ? body.lang : "th";

    if (!question) return NextResponse.json({ error: "no question" }, { status: 400 });
    if (question.length > 500) return NextResponse.json({ error: "question too long (max 500 chars)" }, { status: 400 });

    /* coin_lines ถ้า client ส่ง (อากง ritual UI) — ใช้แทน random server-side */
    const coin_lines: number[] | undefined = Array.isArray(body.coin_lines) ? body.coin_lines : undefined;
    let result: { engine: string; structured: unknown };
    if (method === "meihua") result = await engineMeihua(question);
    else if (method === "qmdj") result = await engineQmdj(question, category);
    else result = engineCoin(question, coin_lines);

    /* 16 พ.ค. (อากงอาม่า v2.0): ดึง deep interpretation 64 卦 ของ ben/bian จาก DB */
    const s = result.structured as { ben_hex?: { num?: number }; bian_hex?: { num?: number }; changing_line?: number; changing_lines?: number[] } | null;
    let benDeep: unknown = null, bianDeep: unknown = null;
    if (s?.ben_hex?.num) benDeep = await fetchHexDeep(s.ben_hex.num);
    if (s?.bian_hex?.num) bianDeep = await fetchHexDeep(s.bian_hex.num);

    /* 16 พ.ค. (อากงอาม่า v3.0): ดึง 384 爻辭 สำหรับเส้นที่เปลี่ยน */
    const lines: number[] = Array.isArray(s?.changing_lines) ? s!.changing_lines! :
                            (typeof s?.changing_line === 'number' && s.changing_line > 0 ? [s.changing_line] : []);
    const yaoCi = (s?.ben_hex?.num && lines.length) ? await fetchYaoCi(s.ben_hex.num, lines) : [];

    /* AI sifu — ใช้ deep + yao ci ในการตอบ */
    let ai = "";
    try {
      const ctx = { ...result.structured as object, ben_deep: benDeep, bian_deep: bianDeep, yao_ci: yaoCi };
      ai = await runClaudeCli(buildPrompt(question, method, category, lang, ctx));
    } catch (e: unknown) {
      console.warn("[forecast] AI failed:", (e as Error).message);
      ai = "(ระบบ AI ไม่ตอบกลับในเวลา · ลองอีกครั้งสักครู่)";
    }

    return NextResponse.json({
      ok: true, method,
      engine: result.engine,
      ai,
      structured: result.structured,
      ben_deep: benDeep,  // 16 พ.ค. v2: deep interpretation สำหรับ UI tooltip
      bian_deep: bianDeep,
      yao_ci: yaoCi,      // 16 พ.ค. v3: 384 爻辭 ของเส้นที่เปลี่ยน
    });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("[forecast] failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
