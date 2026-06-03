import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

const SIFU_EXTRA_DIR = join(process.cwd(), "data/library/sifu-extra");
const QTBJ_TIAOHOU_FILE = "qtbj-tiaohou-clean.md";
const QTBJ_TIAOHOU_LOOKUP_FILE = "qtbj-tiaohou-lookup.md";

export const SIFU_CODEX_QTBJ_RETRIEVAL_VERSION = "codex-qtbj-retrieval-v3";

const STEMS = "甲乙丙丁戊己庚辛壬癸";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";

const STEM_ELEMENT_ZH: Record<string, string> = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土",
  庚: "金", 辛: "金", 壬: "水", 癸: "水",
};
const STEM_TH: Record<string, string> = {
  甲: "ไม้หยาง", 乙: "ไม้หยิน", 丙: "ไฟหยาง", 丁: "ไฟหยิน", 戊: "ดินหยาง", 己: "ดินหยิน",
  庚: "ทองหยาง", 辛: "ทองหยิน", 壬: "น้ำหยาง", 癸: "น้ำหยิน",
};
const BRANCH_MONTH: Record<string, { no: number; zh: string; season: string; th: string }> = {
  寅: { no: 1, zh: "正月", season: "三春", th: "ขาล" },
  卯: { no: 2, zh: "二月", season: "三春", th: "เถาะ" },
  辰: { no: 3, zh: "三月", season: "三春", th: "มะโรง" },
  巳: { no: 4, zh: "四月", season: "三夏", th: "มะเส็ง" },
  午: { no: 5, zh: "五月", season: "三夏", th: "มะเมีย" },
  未: { no: 6, zh: "六月", season: "三夏", th: "มะแม" },
  申: { no: 7, zh: "七月", season: "三秋", th: "วอก" },
  酉: { no: 8, zh: "八月", season: "三秋", th: "ระกา" },
  戌: { no: 9, zh: "九月", season: "三秋", th: "จอ" },
  亥: { no: 10, zh: "十月", season: "三冬", th: "กุน" },
  子: { no: 11, zh: "十一月", season: "三冬", th: "ชวด" },
  丑: { no: 12, zh: "十二月", season: "三冬", th: "ฉลู" },
};
const THAI_DIGITS = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];

type QtbjPair = { stem: string; monthBranch: string; reason: string };
type SourceCache = { lookup: string; clean: string; version: string; ts: number };

let sourceCache: SourceCache | null = null;

function thaiNumber(n: number): string {
  return String(n).replace(/\d/g, d => THAI_DIGITS[Number(d)] || d);
}

function loadQtbjSource(): SourceCache {
  const now = Date.now();
  if (sourceCache && now - sourceCache.ts < 60_000) return sourceCache;
  const lookup = readFileSync(join(SIFU_EXTRA_DIR, QTBJ_TIAOHOU_LOOKUP_FILE), "utf8");
  const clean = readFileSync(join(SIFU_EXTRA_DIR, QTBJ_TIAOHOU_FILE), "utf8");
  const version = createHash("sha1")
    .update(QTBJ_TIAOHOU_LOOKUP_FILE).update(lookup)
    .update(QTBJ_TIAOHOU_FILE).update(clean)
    .digest("hex").slice(0, 12);
  sourceCache = { lookup, clean, version, ts: now };
  return sourceCache;
}

function pairKey(pair: Pick<QtbjPair, "stem" | "monthBranch">): string {
  return `${pair.stem}${pair.monthBranch}`;
}

function addPair(pairs: QtbjPair[], stem: string | undefined, monthBranch: string | undefined, reason: string) {
  if (!stem || !monthBranch || !STEM_ELEMENT_ZH[stem] || !BRANCH_MONTH[monthBranch]) return;
  if (pairs.some(p => p.stem === stem && p.monthBranch === monthBranch)) return;
  pairs.push({ stem, monthBranch, reason });
}

function inferMonthBranchFromText(text: string): string | undefined {
  const direct = text.match(new RegExp(`[${BRANCHES}]`))?.[0];
  if (direct) return direct;
  for (const [branch, m] of Object.entries(BRANCH_MONTH)) {
    const no = String(m.no);
    const thNo = thaiNumber(m.no);
    if (
      text.includes(m.zh) ||
      text.includes(`${m.zh.slice(0, -1)}月`) ||
      text.includes(`${m.no}月`) ||
      text.includes(`${thNo}月`) ||
      text.includes(`เดือน ${no}`) ||
      text.includes(`เดือน${no}`) ||
      text.includes(`เดือน ${thNo}`) ||
      text.includes(`เดือน${thNo}`) ||
      text.includes(m.th)
    ) return branch;
  }
  if (/三春|ฤดูใบไม้ผลิ/.test(text)) return "寅";
  if (/三夏|ฤดูร้อน/.test(text)) return "巳";
  if (/三秋|ฤดูใบไม้ร่วง/.test(text)) return "申";
  if (/三冬|ฤดูหนาว/.test(text)) return "亥";
  return undefined;
}

function extractQtbjPairs(query: string, maxPairs: number): QtbjPair[] {
  const pairs: QtbjPair[] = [];
  const head = query.slice(0, 2500);
  const explicitStem = head.match(new RegExp(`[${STEMS}]`))?.[0];
  const explicitBranch = inferMonthBranchFromText(head);
  addPair(pairs, explicitStem, explicitBranch, "user-message");

  const pillarRe = new RegExp(`PILLAR LOCK[^\\n]*月([${STEMS}])([${BRANCHES}])[^\\n]*日([${STEMS}])([${BRANCHES}])`, "g");
  for (const m of query.matchAll(pillarRe)) {
    addPair(pairs, m[3], m[2], "pillar-lock");
    if (pairs.length >= maxPairs) break;
  }

  if (pairs.length < maxPairs) {
    const thaiLineRe = new RegExp(`เดือน=[^\\n]*?([${BRANCHES}])[^\\n]*วัน=[^\\n]*?([${STEMS}])`, "g");
    for (const m of query.matchAll(thaiLineRe)) {
      addPair(pairs, m[2], m[1], "thai-pillar-line");
      if (pairs.length >= maxPairs) break;
    }
  }
  return pairs.slice(0, maxPairs);
}

function monthNeedles(monthBranch: string): string[] {
  const m = BRANCH_MONTH[monthBranch];
  if (!m) return [];
  const n = String(m.no);
  const thNo = thaiNumber(m.no);
  return [
    m.zh,
    `${m.zh.slice(0, -1)}月`,
    `${m.no}月`,
    `${thNo}月`,
    `เดือน ${n}`,
    `เดือน${n}`,
    `เดือน ${thNo}`,
    `เดือน${thNo}`,
    `${monthBranch}月`,
    monthBranch,
    m.th,
    m.season,
  ];
}

function blockMatchesPair(block: string, pair: QtbjPair): boolean {
  if (!block.includes(pair.stem)) return false;
  const needles = monthNeedles(pair.monthBranch);
  return needles.some(n => n && block.includes(n));
}

function splitLookupBlocks(lookup: string): string[] {
  return lookup
    .split(/\n---\n/g)
    .map(b => b.trim())
    .filter(Boolean);
}

function selectLookupBlocks(lookup: string, pairs: QtbjPair[], maxChars: number): string[] {
  const blocks = splitLookupBlocks(lookup);
  const selected: string[] = [];
  const seen = new Set<string>();
  let used = 0;

  const add = (block: string) => {
    const key = createHash("sha1").update(block).digest("hex").slice(0, 10);
    if (seen.has(key)) return;
    if (used + block.length > maxChars) return;
    seen.add(key);
    selected.push(block);
    used += block.length;
  };

  for (const pair of pairs) {
    for (const block of blocks) {
      if (blockMatchesPair(block, pair)) add(block);
    }
  }

  if (!selected.length) {
    for (const block of blocks) {
      if (/หลักใหญ่|กฎ 3|สรุปคัมภีร์|五行總論/.test(block)) add(block);
      if (selected.length >= 2) break;
    }
  }
  return selected;
}

function canonicalPatterns(pair: QtbjPair): string[] {
  const month = BRANCH_MONTH[pair.monthBranch];
  const el = STEM_ELEMENT_ZH[pair.stem] || "";
  return [
    `${month.zh}${pair.stem}${el}`,
    `${month.zh}${pair.stem}`,
    `${month.season}${pair.stem}${el}`,
    `${month.season}${pair.stem}`,
  ];
}

function extractCanonicalSnippet(clean: string, pair: QtbjPair, maxChars: number): string {
  const lines = clean.split(/\r?\n/);
  const patterns = canonicalPatterns(pair);
  const start = lines.findIndex(line => patterns.some(p => line.includes(p)));
  if (start < 0) return "";

  const picked: string[] = [];
  for (let i = start; i < lines.length && picked.join("\n").length < maxChars; i++) {
    if (i > start && /^\d+\s+(?:正月|二月|三月|四月|五月|六月|七月|八月|九月|十月|十一月|十二月|三春|三夏|三秋|三冬)[甲乙丙丁戊己庚辛壬癸]/.test(lines[i])) break;
    picked.push(lines[i]);
  }
  return picked.join("\n").slice(0, maxChars).trim();
}

function canonicalPriorityGuard(pair: QtbjPair): string | null {
  const key = pairKey(pair);
  if (key === "甲寅") {
    return [
      "### Canonical priority 甲寅",
      "正月甲木/甲木生寅月: 調候/月令 anchor is 丙癸, especially 癸藏丙透 = 寒木向陽.",
      "When summarizing 主用/次用 for climate, answer 丙 as the warming lead and 癸 as the moistening support.",
      "庚 may appear in later notes about 旺木斫鑿/陽刃架殺/成材, but do not promote 庚 to default 調候次用 unless the chart packet explicitly asks about over-strong wood shaping.",
    ].join("\n");
  }
  return null;
}

function describePairs(pairs: QtbjPair[]): string {
  if (!pairs.length) return "ไม่พบคู่ดิถี+เดือนจาก PILLAR LOCK หรือคำถามโดยตรง";
  return pairs.map(p => {
    const m = BRANCH_MONTH[p.monthBranch];
    return `${STEM_TH[p.stem] || p.stem} ${p.stem} เกิดเดือน${m.th}/${m.zh} ${p.monthBranch} (${p.reason})`;
  }).join(" | ");
}

export function loadQtbjTiaohouCompactKnowledge(query: string): { text: string; version: string; pairs: string[]; chars: number } {
  try {
    const maxChars = Math.max(8_000, Number(process.env.SIFU_CODEX_QTBJ_MAX_CHARS || 24_000));
    const maxPairs = Math.max(1, Number(process.env.SIFU_CODEX_QTBJ_MAX_PAIRS || 4));
    const src = loadQtbjSource();
    const pairs = extractQtbjPairs(query, maxPairs);
    const canonicalBudget = Math.min(8_000, Math.floor(maxChars * 0.35));
    const perPairCanonical = pairs.length ? Math.max(900, Math.floor(canonicalBudget / pairs.length)) : 0;
    const canonical = pairs
      .map(pair => ({ pair, text: extractCanonicalSnippet(src.clean, pair, perPairCanonical) }))
      .filter(x => x.text)
      .map(x => `### Canonical ${pairKey(x.pair)}\n${x.text}`);
    const priorityGuards = pairs
      .map(canonicalPriorityGuard)
      .filter((x): x is string => Boolean(x));
    const lookupBudget = Math.max(4_000, maxChars - canonical.join("\n\n").length - 1_200);
    const lookup = selectLookupBlocks(src.lookup, pairs, lookupBudget)
      .map((block, idx) => `### Thai lookup ${idx + 1}\n${block}`);

    const text = [
      "# 窮通寶鑑 · Codex targeted retrieval",
      `Version: ${SIFU_CODEX_QTBJ_RETRIEVAL_VERSION}/${src.version}`,
      `Matched pairs: ${describePairs(pairs)}`,
      "Contract: ใช้เฉพาะชั้น 調候/月令 เพื่ออธิบายร้อน-เย็น-แห้ง-ชื้น; chart packet/engine เป็น source of truth สูงสุด; ถ้า block นี้ไม่มีคู่ที่ถาม ห้ามเดาตำราเพิ่มเอง",
      "Priority: Canonical snippets and Canonical priority notes win over Thai lookup notes. Thai lookup is only an index/teaching memo and may contain conditional reaction examples; do not turn conditional examples into default 主用/次用.",
      priorityGuards.length ? "## Canonical priority notes" : "",
      ...priorityGuards,
      canonical.length ? "## Canonical snippets" : "",
      ...canonical,
      lookup.length ? "## Thai teaching lookup" : "",
      ...lookup,
    ].filter(Boolean).join("\n\n").slice(0, maxChars);

    return { text, version: `${SIFU_CODEX_QTBJ_RETRIEVAL_VERSION}-${src.version}`, pairs: pairs.map(pairKey), chars: text.length };
  } catch (e) {
    console.warn("[sifu] qtbj targeted retrieval failed:", (e as Error).message);
    return { text: "", version: "none", pairs: [], chars: 0 };
  }
}
