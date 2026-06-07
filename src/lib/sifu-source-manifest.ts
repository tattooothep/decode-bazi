import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const SIFU_SOURCE_MANIFEST_VERSION = "sifu-source-manifest-v1";

type SourceKind =
  | "procedure"
  | "interaction"
  | "engine"
  | "classic"
  | "compact_virtual";

type SourceTier =
  | "baseline"
  | "topic_retrieval"
  | "secondary_retrieval"
  | "compact_virtual";

export type SifuSourceDescriptor = {
  sourceId: string;
  routeGroup: "ajek" | "interaction" | "engine" | "extra" | "codex_compact";
  kind: SourceKind;
  tier: SourceTier;
  file: string;
  title: string;
  promptLabel?: string;
  authorityBook:
    | "bazi-authority-procedure"
    | "bazi-authority-interactions"
    | "bazi-authority-geju-xiangshen"
    | "bazi-authority-tiaohou-yongshen"
    | "bazi-authority-conghua-special-ge"
    | "bazi-authority-shishen-roles"
    | "bazi-authority-yingqi-timing"
    | "bazi-authority-hehun-liuqin"
    | "bazi-authority-shensha-secondary"
    | "bazi-authority-nayin-texture"
    | "sifu-codex-compact-canon";
  routeInclusion: {
    sifuSingleFull: boolean;
    sifuGroupFull: boolean;
    codexCompact: boolean;
  };
  selectionReason: string;
  sourcePriority: number;
};

export type SifuSourceManifestEntry = SifuSourceDescriptor & {
  path: string;
  relativePath: string;
  chars: number;
  bytes: number;
  sourceHashSha256: string;
  promptSegmentHashSha256: string;
  selected: boolean;
  included: boolean;
};

export type SifuSourceManifest = {
  manifestVersion: string;
  generatedAt: string;
  mode: "sifu-single-full-current" | "sifu-group-full-current" | "codex-compact-current";
  knownSourceCount: number;
  sourceCount: number;
  totalChars: number;
  totalBytes: number;
  sourceManifestHash: string;
  sources: SifuSourceManifestEntry[];
};

const ROOT = process.cwd();

const ENGINE_DIR = "data/library/สำหรับทำ engine";
const EXTRA_DIR = "data/library/sifu-extra";

export const SIFU_SOURCE_DESCRIPTORS: SifuSourceDescriptor[] = [
  {
    sourceId: "ajek-bazi-rules",
    routeGroup: "ajek",
    kind: "procedure",
    tier: "baseline",
    file: "data/library/ajek-bazi-rules.md",
    title: "Ajek BaZi reading procedure",
    authorityBook: "bazi-authority-procedure",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: reading order and discipline",
    sourcePriority: 10,
  },
  {
    sourceId: "bazi-interaction-master",
    routeGroup: "interaction",
    kind: "interaction",
    tier: "baseline",
    file: "data/library/bazi-interaction-master.md",
    title: "Internal Interaction Master Engine",
    authorityBook: "bazi-authority-interactions",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: core interaction mechanism",
    sourcePriority: 20,
  },
  {
    sourceId: "yongshen-selection-engine-reference",
    routeGroup: "engine",
    kind: "engine",
    tier: "baseline",
    file: `${ENGINE_DIR}/คู่มืออ้างอิงสำหรับ Yong Shen (用神) Selection Engine ของระบบ BaZi (八字) — hourkey Platform.md`,
    title: "調候用神 · Yong Shen selection reference",
    promptLabel: "調候用神 · การเลือกธาตุที่ใช้",
    authorityBook: "bazi-authority-tiaohou-yongshen",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: yongshen/tiaohou decision support",
    sourcePriority: 30,
  },
  {
    sourceId: "classical-ziping-event-timing",
    routeGroup: "engine",
    kind: "engine",
    tier: "topic_retrieval",
    file: `${ENGINE_DIR}/Classical Zi Ping (子平) BaZi Rules for Event Timing — A Codifiable Reference for the hourkey Engine.md`,
    title: "應期 · Classical Zi Ping event timing",
    promptLabel: "應期 · จังหวะเวลาเกิดเหตุ",
    authorityBook: "bazi-authority-yingqi-timing",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: timing/event activation support",
    sourcePriority: 60,
  },
  {
    sourceId: "classical-bazi-five-life-domains",
    routeGroup: "engine",
    kind: "engine",
    tier: "topic_retrieval",
    file: `${ENGINE_DIR}/Classical BaZi Technical Rules for Hourkey.io Scoring Engine — 5 Life Domains (Health, Career, Spouse, Wealth, Study).md`,
    title: "5 life domains · Health/Career/Spouse/Wealth/Study",
    promptLabel: "5 ด้านชีวิต · สุขภาพ/อาชีพ/คู่/ทรัพย์/เรียน",
    authorityBook: "bazi-authority-yingqi-timing",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: domain-specific application rules",
    sourcePriority: 65,
  },
  {
    sourceId: "pillar-interactions",
    routeGroup: "engine",
    kind: "engine",
    tier: "topic_retrieval",
    file: `${ENGINE_DIR}/Pillar Interactions.md`,
    title: "Pillar interactions · deep pair-by-pair rules",
    promptLabel: "ปฏิกิริยาระหว่างเสาเชิงลึก (รายคู่)",
    authorityBook: "bazi-authority-interactions",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: detailed interaction prose",
    sourcePriority: 50,
  },
  {
    sourceId: "bazi-shishen-classical",
    routeGroup: "extra",
    kind: "classic",
    tier: "baseline",
    file: `${EXTRA_DIR}/bazi-shishen-classical.md`,
    title: "十神 · classical ten-god roles",
    promptLabel: "十神 · จิตวิทยาบทบาทสิบเทพ (子平 verbatim)",
    authorityBook: "bazi-authority-shishen-roles",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: ten-god role language",
    sourcePriority: 40,
  },
  {
    sourceId: "bazi-geju-master",
    routeGroup: "extra",
    kind: "classic",
    tier: "baseline",
    file: `${EXTRA_DIR}/bazi-geju-master.md`,
    title: "格局 · Zi Ping structure spec",
    promptLabel: "格局 · โครงสร้างดวง 子平真詮 spec",
    authorityBook: "bazi-authority-geju-xiangshen",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: structure/geju support",
    sourcePriority: 35,
  },
  {
    sourceId: "bazi-hehun-classical",
    routeGroup: "extra",
    kind: "classic",
    tier: "topic_retrieval",
    file: `${EXTRA_DIR}/bazi-hehun-classical.md`,
    title: "合婚 · compatibility and relationship classics",
    promptLabel: "合婚 · ความเข้ากันดวงคู่/หลายดวง",
    authorityBook: "bazi-authority-hehun-liuqin",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: pair/group compatibility support",
    sourcePriority: 70,
  },
  {
    sourceId: "bazi-nayin-master",
    routeGroup: "extra",
    kind: "classic",
    tier: "secondary_retrieval",
    file: `${EXTRA_DIR}/bazi-nayin-master.md`,
    title: "納音60 · auxiliary texture",
    promptLabel: "納音60 · เนื้อสัมผัสนาอิน",
    authorityBook: "bazi-authority-nayin-texture",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: nayin secondary texture",
    sourcePriority: 90,
  },
  {
    sourceId: "bazi-shensha-catalog",
    routeGroup: "extra",
    kind: "classic",
    tier: "secondary_retrieval",
    file: `${EXTRA_DIR}/bazi-shensha-catalog.md`,
    title: "神煞 · secondary star catalog",
    promptLabel: "神煞 · คาตาล็อกดาวพิเศษ (รอง)",
    authorityBook: "bazi-authority-shensha-secondary",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: secondary stars",
    sourcePriority: 95,
  },
  {
    sourceId: "bazi-hechong-resolution",
    routeGroup: "extra",
    kind: "classic",
    tier: "baseline",
    file: `${EXTRA_DIR}/bazi-hechong-resolution.md`,
    title: "合冲 · resolution, binding, clash, vault rules",
    promptLabel: "合冲 · กฎแก้ขัด/รวมพลัง 刑沖會合解法 + 墓庫 (子平真詮 Resolution)",
    authorityBook: "bazi-authority-interactions",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: interaction resolution authority",
    sourcePriority: 25,
  },
  {
    sourceId: "bazi-xiangshen-judgment",
    routeGroup: "extra",
    kind: "classic",
    tier: "baseline",
    file: `${EXTRA_DIR}/bazi-xiangshen-judgment.md`,
    title: "相神/成格/破格/救應 judgment",
    promptLabel: "相神/成格/破格/救應 · ตัดสินโครงดวงสมบูรณ์/พัง (子平真詮 Judgment)",
    authorityBook: "bazi-authority-geju-xiangshen",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: structure success/failure authority",
    sourcePriority: 32,
  },
  {
    sourceId: "bazi-conghua-master",
    routeGroup: "extra",
    kind: "classic",
    tier: "baseline",
    file: `${EXTRA_DIR}/bazi-conghua-master.md`,
    title: "從格/化格 · special structure boundary rules",
    promptLabel: "從格/化格 · ดวงตาม/แปรธาตุ + 真假 boundary + 合化 (滴天髓+三命通會)",
    authorityBook: "bazi-authority-conghua-special-ge",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: cong/hua special chart authority",
    sourcePriority: 38,
  },
  {
    sourceId: "zpzq-zhenquan-clean",
    routeGroup: "extra",
    kind: "classic",
    tier: "baseline",
    file: `${EXTRA_DIR}/zpzq-zhenquan-clean.md`,
    title: "子平真詮評註 · canonical structure ground truth",
    promptLabel: "📜 子平真詮評註 ตัวบทจริง verbatim (ctext · GROUND TRUTH เหนือ reconstruction · บท合化→48 + 74命例เฉลยจริง) · ใช้ quote/เทียบ案例 · ห้ามคัดจีนดิบ แปลไทยตามกฎ9",
    authorityBook: "bazi-authority-geju-xiangshen",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: primary geju/xiangshen classic",
    sourcePriority: 31,
  },
  {
    sourceId: "dts-zhentian-clean",
    routeGroup: "extra",
    kind: "classic",
    tier: "baseline",
    file: `${EXTRA_DIR}/dts-zhentian-clean.md`,
    title: "滴天髓闡微 · qi, strength, conghua, tongguan",
    promptLabel: "📜 滴天髓闡微 ตัวบทจริง verbatim (ctext · 任鐵樵注 · GROUND TRUTH เหนือ reconstruction · 62 บท) · สาย旺衰氣勢: ยึดตอนอ่าน旺衰/化氣-從格/調候(寒暖燥濕)/通關/性情/疾病/女命/何知章 · 格局/相神ยึด子平真詮 · ห้ามคัดจีนดิบ แปลไทยตามกฎ9",
    authorityBook: "bazi-authority-conghua-special-ge",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: qi momentum and conghua classic",
    sourcePriority: 37,
  },
  {
    sourceId: "qtbj-tiaohou-clean",
    routeGroup: "extra",
    kind: "classic",
    tier: "baseline",
    file: `${EXTRA_DIR}/qtbj-tiaohou-clean.md`,
    title: "窮通寶鑑 · canonical DM x month climate",
    promptLabel: "📜 窮通寶鑑 · 調候用神/月令 ตัวบทจริง canonical (admin library id 13 · 10干×12เดือน · ใช้เติมชั้นร้อนเย็นแห้งชื้น ห้าม override packet)",
    authorityBook: "bazi-authority-tiaohou-yongshen",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: true },
    selectionReason: "current_full_prompt_included_all_or_codex_targeted_retrieval_source: climate/month command authority",
    sourcePriority: 33,
  },
  {
    sourceId: "qtbj-tiaohou-thai-notes",
    routeGroup: "extra",
    kind: "classic",
    tier: "topic_retrieval",
    file: `${EXTRA_DIR}/qtbj-tiaohou-thai-notes.md`,
    title: "窮通寶鑑 · Thai teaching notes",
    promptLabel: "📘 窮通寶鑑 · Thai teaching notes จาก memo id 13 (ชั้นอธิบาย 調候/月令 เป็นไทย · ใช้เสริม canonical ห้าม override packet)",
    authorityBook: "bazi-authority-tiaohou-yongshen",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: Thai explanatory climate notes",
    sourcePriority: 75,
  },
  {
    sourceId: "smtg-clean",
    routeGroup: "extra",
    kind: "classic",
    tier: "secondary_retrieval",
    file: `${EXTRA_DIR}/smtg-clean.md`,
    title: "三命通會 · broad classical signals",
    promptLabel: "📜 三命通會 (萬民英 · 明 1578 · 神煞+納音+論女命 verbatim)",
    authorityBook: "bazi-authority-shensha-secondary",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: broad classic, shensha/nayin/female chart support",
    sourcePriority: 85,
  },
  {
    sourceId: "yhzp-clean",
    routeGroup: "extra",
    kind: "classic",
    tier: "topic_retrieval",
    file: `${EXTRA_DIR}/yhzp-clean.md`,
    title: "淵海子平 · early Zi Ping source",
    promptLabel: "📜 淵海子平 (徐升 · 宋 1271 · 子平 ต้นน้ำ · 五干通變圖+喜忌篇 verbatim)",
    authorityBook: "bazi-authority-shishen-roles",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: early Zi Ping ten-god/geju support",
    sourcePriority: 55,
  },
  {
    sourceId: "sftk-clean",
    routeGroup: "extra",
    kind: "classic",
    tier: "topic_retrieval",
    file: `${EXTRA_DIR}/sftk-clean.md`,
    title: "神峰通考 · illness-medicine and marriage support",
    promptLabel: "📜 神峰通考 (張楠 · 明 · 命理正宗 · 病藥論+動靜說+蓋頭說+男女合婚說 verbatim · ต้นทาง BY-08)",
    authorityBook: "bazi-authority-tiaohou-yongshen",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: bingyao/tongguan and hehun support",
    sourcePriority: 58,
  },
  {
    sourceId: "bazi-zixi-mangpai",
    routeGroup: "extra",
    kind: "classic",
    tier: "topic_retrieval",
    file: `${EXTRA_DIR}/bazi-zixi-mangpai.md`,
    title: "論妻子 · spouse and children support",
    promptLabel: "📜 論妻子 · ดูคู่+ดูบุตร (子平真詮 verbatim แกน · นับลูก長生沐浴之歌 + เพศ庚男辛女/陽男陰女 · มุม盲派暗藏เสริมไม่ทับ)",
    authorityBook: "bazi-authority-hehun-liuqin",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: true, codexCompact: false },
    selectionReason: "current_full_prompt_included_all: spouse/children reading support",
    sourcePriority: 72,
  },
  {
    sourceId: "yhzp-juan3-koujue",
    routeGroup: "extra",
    kind: "classic",
    tier: "topic_retrieval",
    file: `${EXTRA_DIR}/yhzp-juan3-koujue.md`,
    title: "口訣淵海子平卷三 · koujue formulas",
    promptLabel: "📜 口訣淵海子平卷三 · บทพยากรณ์ verbatim+แปลไทย (寸金搜髓論+傷官說+心鏡歌+妖祥賦+綜釋賦+玄機賦 · 113口訣 · แกน格局成敗·官殺印財·傷官用神 + 調候/六親宮位/相克致病 · ไม่ซ้ำเล่มอื่น)",
    authorityBook: "bazi-authority-geju-xiangshen",
    routeInclusion: { sifuSingleFull: true, sifuGroupFull: false, codexCompact: false },
    selectionReason: "current_full_prompt_included_all_single_only: koujue formulas",
    sourcePriority: 62,
  },
  {
    sourceId: "qtbj-tiaohou-lookup",
    routeGroup: "codex_compact",
    kind: "compact_virtual",
    tier: "compact_virtual",
    file: `${EXTRA_DIR}/qtbj-tiaohou-lookup.md`,
    title: "窮通寶鑑 · Thai lookup source for compact retrieval",
    promptLabel: "窮通寶鑑 · compact lookup source",
    authorityBook: "bazi-authority-tiaohou-yongshen",
    routeInclusion: { sifuSingleFull: false, sifuGroupFull: false, codexCompact: true },
    selectionReason: "codex_compact_retrieval_source: lookup blocks selected by DM/month",
    sourcePriority: 34,
  },
  {
    sourceId: "sifu-codex-base-canon-source",
    routeGroup: "codex_compact",
    kind: "compact_virtual",
    tier: "compact_virtual",
    file: "src/lib/sifu-codex-canon.ts",
    title: "Codex base canon source",
    promptLabel: "Codex base canon compact source",
    authorityBook: "sifu-codex-compact-canon",
    routeInclusion: { sifuSingleFull: false, sifuGroupFull: false, codexCompact: true },
    selectionReason: "codex_compact_baseline_source: compact canon pack used by QTBJ retrieval",
    sourcePriority: 15,
  },
  {
    sourceId: "sifu-qtbj-compact-router-source",
    routeGroup: "codex_compact",
    kind: "compact_virtual",
    tier: "compact_virtual",
    file: "src/lib/sifu-qtbj-compact.ts",
    title: "Codex QTBJ compact retrieval router source",
    promptLabel: "Codex QTBJ compact retrieval router",
    authorityBook: "sifu-codex-compact-canon",
    routeInclusion: { sifuSingleFull: false, sifuGroupFull: false, codexCompact: true },
    selectionReason: "codex_compact_retrieval_router: deterministic DM/month source selection algorithm",
    sourcePriority: 16,
  },
];

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function loaderSegment(source: SifuSourceDescriptor, text: string): string {
  const label = source.promptLabel || source.title;
  if (source.routeGroup === "engine") {
    return `\n──────── ตำราเสริม: ${label} ────────\n${text}`;
  }
  if (source.routeGroup === "extra") {
    return `\n──────── ตำราเจาะลึก: ${label} ────────\n${text}`;
  }
  return text;
}

function isIncluded(source: SifuSourceDescriptor, mode: SifuSourceManifest["mode"]): boolean {
  if (mode === "sifu-single-full-current") return source.routeInclusion.sifuSingleFull;
  if (mode === "sifu-group-full-current") return source.routeInclusion.sifuGroupFull;
  return source.routeInclusion.codexCompact;
}

export function buildSifuSourceManifest(
  mode: SifuSourceManifest["mode"] = "sifu-single-full-current",
  opts: { root?: string; generatedAt?: string } = {}
): SifuSourceManifest {
  const root = opts.root || ROOT;
  const generatedAt = opts.generatedAt || new Date().toISOString();
  const sources = SIFU_SOURCE_DESCRIPTORS
    .map((source) => {
      const included = isIncluded(source, mode);
      const path = join(root, source.file);
      const text = readFileSync(path, "utf8");
      const segment = loaderSegment(source, text);
      return {
        ...source,
        path,
        relativePath: relative(root, path),
        chars: text.length,
        bytes: Buffer.byteLength(text, "utf8"),
        sourceHashSha256: sha256(text),
        promptSegmentHashSha256: sha256(segment),
        selected: included,
        included,
      };
    });
  const canonical = sources.map((source) => ({
    sourceId: source.sourceId,
    relativePath: source.relativePath,
    selected: source.selected,
    included: source.included,
    tier: source.tier,
    selectionReason: source.selectionReason,
    sourceHashSha256: source.sourceHashSha256,
    promptSegmentHashSha256: source.promptSegmentHashSha256,
    chars: source.chars,
    bytes: source.bytes,
    authorityBook: source.authorityBook,
    sourcePriority: source.sourcePriority,
  }));
  return {
    manifestVersion: SIFU_SOURCE_MANIFEST_VERSION,
    generatedAt,
    mode,
    knownSourceCount: sources.length,
    sourceCount: sources.filter((source) => source.included).length,
    totalChars: sources.filter((source) => source.included).reduce((sum, source) => sum + source.chars, 0),
    totalBytes: sources.filter((source) => source.included).reduce((sum, source) => sum + source.bytes, 0),
    sourceManifestHash: sha256(JSON.stringify({ version: SIFU_SOURCE_MANIFEST_VERSION, mode, sources: canonical })),
    sources,
  };
}

export function summarizeSifuSourceManifest(manifest: SifuSourceManifest) {
  return {
    manifestVersion: manifest.manifestVersion,
    mode: manifest.mode,
    knownSourceCount: manifest.knownSourceCount,
    sourceCount: manifest.sourceCount,
    totalChars: manifest.totalChars,
    totalBytes: manifest.totalBytes,
    sourceManifestHash: manifest.sourceManifestHash,
    sources: manifest.sources.map((source) => ({
      sourceId: source.sourceId,
      routeGroup: source.routeGroup,
      tier: source.tier,
      authorityBook: source.authorityBook,
      sourcePriority: source.sourcePriority,
      relativePath: source.relativePath,
      chars: source.chars,
      bytes: source.bytes,
      sourceHashSha256: source.sourceHashSha256,
      promptSegmentHashSha256: source.promptSegmentHashSha256,
      selected: source.selected,
      included: source.included,
      selectionReason: source.selectionReason,
    })),
  };
}
