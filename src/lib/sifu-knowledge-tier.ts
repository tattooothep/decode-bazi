/**
 * sifu-knowledge-tier-chain · Source of Truth for classic book tiers (G1+)
 *
 * T0 = always (baseline + excerpts + QTBJ compact) — assembled in route via compact authority loaders
 * T1 = core books every question (Codex/Grok when tier≥t1)
 * T2 = intent-triggered books (when tier≥t2)
 * T3 = full Claude stack (ajek + interaction + engine4 + extra17)
 *
 * Caps are knowledge-body chars (not whole prompt). Drop lowest priority first; never drop packet/T0 anchors.
 * Isolation: this module only defines lists + load helpers · does not touch calc/packet/yam/affiliate.
 */
import { createHash } from "crypto";
import { readFileSync, statSync } from "fs";
import { join } from "path";

export type SifuKnowledgeTierName = "t0" | "t1" | "t2" | "t3";
export type SifuKnowledgeModel = "claude-max-cli" | "codex-cli" | "grok-cli" | "gemini-api" | string;

export type SifuKnowledgeBook = {
  id: string;
  /** path under process.cwd() */
  relPath: string;
  label: string;
  /** lower = drop first when over cap */
  dropPriority: number;
  /** t1 core | t2 intent groups */
  group: "t1-core" | "t2" | "t3-full";
  intents?: SifuKnowledgeIntent[];
};

export type SifuKnowledgeIntent =
  | "yong"
  | "timing"
  | "career"
  | "wealth"
  | "health"
  | "relationship"
  | "fertility"
  | "strength"
  | "shensha"
  | "nayin"
  | "interaction_deep"
  | "koujue"
  | "general";

/** Knowledge body char caps (plan G0). Env override supported. */
export function knowledgeCapChars(model: SifuKnowledgeModel): number {
  const envName =
    model === "codex-cli" ? "SIFU_CODEX_KNOWLEDGE_MAX_CHARS"
    : model === "grok-cli" ? "SIFU_GROK_KNOWLEDGE_MAX_CHARS"
    : model === "claude-max-cli" ? "SIFU_CLAUDE_KNOWLEDGE_MAX_CHARS"
    : "SIFU_KNOWLEDGE_MAX_CHARS";
  const raw = process.env[envName];
  if (raw != null && raw !== "" && Number.isFinite(Number(raw))) {
    return Math.max(50_000, Math.floor(Number(raw)));
  }
  if (model === "codex-cli") return 280_000;
  // SoT เจ้านาย: Grok knowledge body = 500K chars (ไม่ใช่ 400K เดิม)
  if (model === "grok-cli") return 500_000;
  if (model === "claude-max-cli") return 2_000_000;
  return 280_000;
}

/**
 * Resolve tier for model.
 * G2 default: codex/grok → t0 (legacy compact), claude → t3 (full).
 * G3+: set SIFU_KNOWLEDGE_TIER_CODEX=t1 / SIFU_KNOWLEDGE_TIER_GROK=t1 (or t2).
 */
export function resolveSifuKnowledgeTier(model: SifuKnowledgeModel): SifuKnowledgeTierName {
  if (model === "claude-max-cli" || model === "gemini-api") {
    const c = String(process.env.SIFU_KNOWLEDGE_TIER_CLAUDE || "t3").toLowerCase();
    if (c === "t0" || c === "t1" || c === "t2" || c === "t3") return c;
    return "t3";
  }
  const envKey = model === "grok-cli" ? "SIFU_KNOWLEDGE_TIER_GROK" : "SIFU_KNOWLEDGE_TIER_CODEX";
  /* Defaults (chain G3→G6 shipped):
   *   Grok → t2 (intent books under 500k cap · SoT เจ้านาย)
   *   Codex → t2 (intent books under 280k cap · drop low-priority first)
   * Rollback: SIFU_KNOWLEDGE_TIER_CODEX=t0 / SIFU_KNOWLEDGE_TIER_GROK=t0 (legacy compact) */
  const def: SifuKnowledgeTierName =
    model === "grok-cli" ? "t2"
    : model === "codex-cli" ? "t2"
    : "t0";
  const v = String(process.env[envKey] || def).toLowerCase();
  if (v === "t0" || v === "t1" || v === "t2" || v === "t3") return v;
  return def;
}

/** Whether model uses compact output protocol + QTBJ compact retrieval (non-full stack). */
export function usesCompactKnowledgePath(model: SifuKnowledgeModel): boolean {
  const tier = resolveSifuKnowledgeTier(model);
  return tier !== "t3";
}

// ─── Book catalogs (SoT) ─────────────────────────────────────────────

const LIB = "data/library";
const EXTRA = `${LIB}/sifu-extra`;
const ENGINE = `${LIB}/สำหรับทำ engine`;

export const SIFU_T1_CORE_BOOKS: SifuKnowledgeBook[] = [
  { id: "ajek", relPath: `${LIB}/ajek-bazi-rules.md`, label: "สูตรอ่านอาเจ๊กฮ้ง", group: "t1-core", dropPriority: 90 },
  { id: "hechong", relPath: `${EXTRA}/bazi-hechong-resolution.md`, label: "合冲·墓庫 resolution", group: "t1-core", dropPriority: 85 },
  { id: "geju", relPath: `${EXTRA}/bazi-geju-master.md`, label: "格局 master", group: "t1-core", dropPriority: 88 },
  { id: "xiangshen", relPath: `${EXTRA}/bazi-xiangshen-judgment.md`, label: "相神/成格/破格", group: "t1-core", dropPriority: 87 },
  { id: "zpzq", relPath: `${EXTRA}/zpzq-zhenquan-clean.md`, label: "子平真詮 verbatim", group: "t1-core", dropPriority: 89 },
  { id: "shishen", relPath: `${EXTRA}/bazi-shishen-classical.md`, label: "十神 classical", group: "t1-core", dropPriority: 80 },
  { id: "conghua", relPath: `${EXTRA}/bazi-conghua-master.md`, label: "從格/化格", group: "t1-core", dropPriority: 84 },
];

export const SIFU_T2_BOOKS: SifuKnowledgeBook[] = [
  {
    id: "engine-yong",
    relPath: `${ENGINE}/คู่มืออ้างอิงสำหรับ Yong Shen (用神) Selection Engine ของระบบ BaZi (八字) — hourkey Platform.md`,
    label: "用神 selection engine ref",
    group: "t2",
    dropPriority: 55,
    intents: ["yong"],
  },
  {
    id: "engine-timing",
    relPath: `${ENGINE}/Classical Zi Ping (子平) BaZi Rules for Event Timing — A Codifiable Reference for the hourkey Engine.md`,
    label: "應期 event timing",
    group: "t2",
    dropPriority: 50,
    intents: ["timing"],
  },
  {
    id: "engine-domains",
    relPath: `${ENGINE}/Classical BaZi Technical Rules for Hourkey.io Scoring Engine — 5 Life Domains (Health, Career, Spouse, Wealth, Study).md`,
    label: "5 life domains",
    group: "t2",
    dropPriority: 48,
    intents: ["career", "wealth", "health", "relationship"],
  },
  {
    id: "engine-pillar",
    relPath: `${ENGINE}/Pillar Interactions.md`,
    label: "Pillar interactions deep",
    group: "t2",
    dropPriority: 40,
    intents: ["interaction_deep"],
  },
  {
    id: "qtbj-full",
    relPath: `${EXTRA}/qtbj-tiaohou-clean.md`,
    label: "窮通寶鑑 full",
    group: "t2",
    dropPriority: 60,
    intents: ["yong"],
  },
  {
    id: "qtbj-th",
    relPath: `${EXTRA}/qtbj-tiaohou-thai-notes.md`,
    label: "窮通 Thai notes",
    group: "t2",
    dropPriority: 35,
    intents: ["yong"],
  },
  {
    id: "hehun",
    relPath: `${EXTRA}/bazi-hehun-classical.md`,
    label: "合婚",
    group: "t2",
    dropPriority: 52,
    intents: ["relationship"],
  },
  {
    id: "zixi",
    relPath: `${EXTRA}/bazi-zixi-mangpai.md`,
    label: "論妻子/บุตร",
    group: "t2",
    dropPriority: 51,
    intents: ["relationship", "fertility"],
  },
  {
    id: "dts",
    relPath: `${EXTRA}/dts-zhentian-clean.md`,
    label: "滴天髓 full",
    group: "t2",
    dropPriority: 25,
    intents: ["strength"],
  },
  {
    id: "sftk",
    relPath: `${EXTRA}/sftk-clean.md`,
    label: "神峰通考",
    group: "t2",
    dropPriority: 30,
    intents: ["strength", "health"],
  },
  {
    id: "shensha",
    relPath: `${EXTRA}/bazi-shensha-catalog.md`,
    label: "神煞 catalog",
    group: "t2",
    dropPriority: 20,
    intents: ["shensha"],
  },
  {
    id: "nayin",
    relPath: `${EXTRA}/bazi-nayin-master.md`,
    label: "納音60",
    group: "t2",
    dropPriority: 18,
    intents: ["nayin"],
  },
  {
    id: "smtg",
    relPath: `${EXTRA}/smtg-clean.md`,
    label: "三命通會",
    group: "t2",
    dropPriority: 15,
    intents: ["shensha"],
  },
  {
    id: "yhzp",
    relPath: `${EXTRA}/yhzp-clean.md`,
    label: "淵海子平",
    group: "t2",
    dropPriority: 22,
    intents: ["koujue"],
  },
  {
    id: "koujue",
    relPath: `${EXTRA}/yhzp-juan3-koujue.md`,
    label: "口訣淵海卷三",
    group: "t2",
    dropPriority: 28,
    intents: ["koujue", "timing"],
  },
  {
    id: "interaction-full",
    relPath: `${LIB}/bazi-interaction-master.md`,
    label: "interaction master full",
    group: "t2",
    dropPriority: 42,
    intents: ["interaction_deep"],
  },
];

/** T3 full extra list (Claude) — same order as route SIFU_EXTRA_FILES historically */
export const SIFU_T3_EXTRA_FILES: { file: string; label: string }[] = [
  { file: "bazi-shishen-classical.md", label: "十神 · จิตวิทยาบทบาทสิบเทพ (子平 verbatim)" },
  { file: "bazi-geju-master.md", label: "格局 · โครงสร้างดวง 子平真詮 spec" },
  { file: "bazi-hehun-classical.md", label: "合婚 · ความเข้ากันดวงคู่/หลายดวง" },
  { file: "bazi-nayin-master.md", label: "納音60 · เนื้อสัมผัสนาอิน" },
  { file: "bazi-shensha-catalog.md", label: "神煞 · คาตาล็อกดาวพิเศษ (รอง)" },
  { file: "bazi-hechong-resolution.md", label: "合冲 · กฎแก้ขัด/รวมพลัง 刑沖會合解法 + 墓庫" },
  { file: "bazi-xiangshen-judgment.md", label: "相神/成格/破格/救應" },
  { file: "bazi-conghua-master.md", label: "從格/化格" },
  { file: "zpzq-zhenquan-clean.md", label: "子平真詮評註 verbatim" },
  { file: "dts-zhentian-clean.md", label: "滴天髓闡微 verbatim" },
  { file: "qtbj-tiaohou-clean.md", label: "窮通寶鑑 調候 canonical" },
  { file: "qtbj-tiaohou-thai-notes.md", label: "窮通 Thai notes" },
  { file: "smtg-clean.md", label: "三命通會" },
  { file: "yhzp-clean.md", label: "淵海子平" },
  { file: "sftk-clean.md", label: "神峰通考" },
  { file: "bazi-zixi-mangpai.md", label: "論妻子" },
  { file: "yhzp-juan3-koujue.md", label: "口訣淵海卷三" },
];

export const SIFU_T3_ENGINE_FILES: { file: string; label: string }[] = [
  { file: "คู่มืออ้างอิงสำหรับ Yong Shen (用神) Selection Engine ของระบบ BaZi (八字) — hourkey Platform.md", label: "調候用神 · การเลือกธาตุที่ใช้" },
  { file: "Classical Zi Ping (子平) BaZi Rules for Event Timing — A Codifiable Reference for the hourkey Engine.md", label: "應期 · จังหวะเวลาเกิดเหตุ" },
  { file: "Classical BaZi Technical Rules for Hourkey.io Scoring Engine — 5 Life Domains (Health, Career, Spouse, Wealth, Study).md", label: "5 ด้านชีวิต" },
  { file: "Pillar Interactions.md", label: "ปฏิกิริยาระหว่างเสาเชิงลึก" },
];

// ─── Intent classification ───────────────────────────────────────────

export function classifySifuKnowledgeIntents(message: string, historyText = ""): SifuKnowledgeIntent[] {
  const text = `${message}\n${historyText}`.toLowerCase();
  const hit = new Set<SifuKnowledgeIntent>();

  if (/(用神|ธาตุช่วย|เสริมธาตุ|เติมธาตุ|เลี่ยงธาตุ|調候|tiaohou|yong\s*shen)/i.test(text)) hit.add("yong");
  if (/(ปี|เดือน|ช่วง|เมื่อไหร่|ทำนาย|流年|大運|应期|應期|202[0-9]|25[0-9]{2})/i.test(text)) hit.add("timing");
  if (/(งาน|การงาน|อาชีพ|เลื่อนตำแหน่ง|เปลี่ยนงาน|career)/i.test(text)) hit.add("career");
  if (/(เงิน|ทรัพย์|รวย|รายได้|ลงทุน|wealth)/i.test(text)) hit.add("wealth");
  if (/(สุขภาพ|ป่วย|โรค|ผ่าตัด|health)/i.test(text)) hit.add("health");
  if (/(คู่|แฟน|แต่ง|สามี|ภรรยา|ความรัก|合婚|relationship)/i.test(text)) hit.add("relationship");
  if (/(ลูก|บุตร|ตั้งครรภ์|ท้อง|icsi|fertility)/i.test(text)) hit.add("fertility");
  if (/(從|化格|旺|อ่อน|แรง|พังโครง|通關|strength|conghua)/i.test(text)) hit.add("strength");
  if (/(神煞|ดาวพิเศษ|shensha)/i.test(text)) hit.add("shensha");
  if (/(納音|nayin|นาอิน)/i.test(text)) hit.add("nayin");
  if (/(合冲|刑冲|墓庫|三合|ปฏิกิริยา|interaction)/i.test(text)) hit.add("interaction_deep");
  if (/(口訣|ตำราคลาสสิก|命例)/i.test(text)) hit.add("koujue");

  if (!hit.size) hit.add("general");
  return [...hit];
}

// ─── File load + cap ─────────────────────────────────────────────────

function readRel(relPath: string): string {
  try {
    return readFileSync(join(process.cwd(), relPath), "utf8");
  } catch {
    return "";
  }
}

export type LoadedKnowledgePiece = {
  id: string;
  label: string;
  relPath: string;
  text: string;
  chars: number;
  dropPriority: number;
};

function loadBook(book: SifuKnowledgeBook): LoadedKnowledgePiece | null {
  const text = readRel(book.relPath);
  if (!text.trim()) return null;
  return {
    id: book.id,
    label: book.label,
    relPath: book.relPath,
    text,
    chars: text.length,
    dropPriority: book.dropPriority,
  };
}

/** Select T1 (+ optional T2) books under cap. Sort dropPriority ascending = drop first. */
export function selectTieredBooks(opts: {
  tier: SifuKnowledgeTierName;
  model: SifuKnowledgeModel;
  intents: SifuKnowledgeIntent[];
  /** chars already reserved (baseline/qtbj compact/rules headers) counted against cap */
  reservedChars?: number;
}): { selected: LoadedKnowledgePiece[]; dropped: string[]; intents: SifuKnowledgeIntent[] } {
  const { tier, model, intents } = opts;
  const cap = knowledgeCapChars(model);
  const reserved = opts.reservedChars || 0;

  if (tier === "t0" || tier === "t3") {
    return { selected: [], dropped: [], intents };
  }

  const wanted: SifuKnowledgeBook[] = [...SIFU_T1_CORE_BOOKS];
  if (tier === "t2") {
    for (const b of SIFU_T2_BOOKS) {
      if (!b.intents || b.intents.some((i) => intents.includes(i))) wanted.push(b);
    }
  }

  // Load all wanted then drop by priority until under cap
  const loaded: LoadedKnowledgePiece[] = [];
  for (const b of wanted) {
    const piece = loadBook(b);
    if (piece) loaded.push(piece);
  }

  // Keep high dropPriority (important) · drop low first
  loaded.sort((a, b) => b.dropPriority - a.dropPriority);
  const selected: LoadedKnowledgePiece[] = [];
  const dropped: string[] = [];
  let used = reserved;
  for (const p of loaded) {
    if (used + p.chars > cap) {
      dropped.push(p.id);
      continue;
    }
    selected.push(p);
    used += p.chars;
  }
  return { selected, dropped, intents };
}

export function renderTieredExtraBlock(pieces: LoadedKnowledgePiece[]): string {
  if (!pieces.length) return "";
  return pieces
    .map((p) => `\n──────── ตำรา tier: ${p.label} ────────\n${p.text}`)
    .join("\n");
}

export function tieredBooksVersion(pieces: LoadedKnowledgePiece[], tier: string, intents: string[]): string {
  const h = createHash("sha1");
  h.update(tier);
  h.update(intents.join(","));
  for (const p of pieces) {
    h.update(p.id);
    h.update(String(p.chars));
    try {
      const st = statSync(join(process.cwd(), p.relPath));
      h.update(String(st.mtimeMs));
    } catch {
      h.update("0");
    }
  }
  return `tier-${tier}-${h.digest("hex").slice(0, 12)}`;
}

export type SifuKnowledgeMeta = {
  tier: SifuKnowledgeTierName;
  model: string;
  intents: SifuKnowledgeIntent[];
  files: string[];
  knowledge_chars: number;
  dropped: string[];
  cap: number;
  version: string;
};

/** Canary questions locked in G0 (for scripts / agents). */
export const SIFU_KNOWLEDGE_CANARY: { id: string; message: string; intents: SifuKnowledgeIntent[] }[] = [
  { id: "yong", message: "ปีนี้ควรเสริมธาตุอะไร 用神หลักคืออะไร", intents: ["yong"] },
  { id: "year", message: "ปี 2026 การงานเป็นอย่างไร", intents: ["timing", "career"] },
  { id: "couple", message: "ดูคู่สมรส / ความรักจากดวงนี้", intents: ["relationship"] },
  { id: "cong", message: "ดวงนี้เข้า 從格 หรือไม่ แรง–อ่อนแค่ไหน", intents: ["strength"] },
  { id: "job", message: "งานการเหมาะสายไหน", intents: ["career"] },
  { id: "money", message: "เรื่องเงิน–ทรัพย์ปีนี้", intents: ["wealth"] },
  { id: "health", message: "สุขภาพจุดที่ต้องระวัง", intents: ["health"] },
  { id: "child", message: "เรื่องลูก–บุตรจากดวง", intents: ["fertility"] },
  { id: "shensha", message: "มี神煞สำคัญอะไรที่ควรรู้", intents: ["shensha"] },
  { id: "general", message: "สรุปภาพรวมดวงแบบสั้น", intents: ["general"] },
];
