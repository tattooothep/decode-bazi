import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  buildSifuSourceManifest,
  type SifuSourceManifest,
  type SifuSourceManifestEntry,
} from "./sifu-source-manifest";

export const SIFU_AUTHORITY_BOOKS_VERSION = "sifu-authority-books-v1";

export type SifuAuthorityBookId =
  | "bazi-authority-interactions"
  | "bazi-authority-geju-xiangshen"
  | "bazi-authority-tiaohou-yongshen"
  | "bazi-authority-conghua-special-ge"
  | "bazi-authority-shishen-roles"
  | "bazi-authority-yingqi-timing"
  | "bazi-authority-hehun-liuqin"
  | "bazi-authority-shensha-secondary"
  | "bazi-authority-nayin-texture";

export type SifuAuthorityBookDescriptor = {
  bookId: SifuAuthorityBookId;
  file: string;
  title: string;
  scope: string;
  sourceIds: string[];
  routerTriggers: string[];
};

export type SifuAuthorityBookSourceRow = {
  sourceId: string;
  relativePath: string;
  authorityBook: string;
  tier: string;
  chars: number;
  bytes: number;
  sourceHashSha256: string;
  promptSegmentHashSha256: string;
  selected: boolean;
  included: boolean;
  sourcePriority: number;
};

export type SifuAuthorityBook = SifuAuthorityBookDescriptor & {
  relativePath: string;
  chars: number;
  bytes: number;
  bookHashSha256: string;
  sourceMapHashSha256: string;
  sourceRows: SifuAuthorityBookSourceRow[];
  missingSourceIds: string[];
};

export type SifuAuthorityBooksCatalog = {
  catalogVersion: string;
  generatedAt: string;
  sourceManifestHash: string;
  bookCount: number;
  totalChars: number;
  totalBytes: number;
  catalogHashSha256: string;
  books: SifuAuthorityBook[];
};

const AUTHORITY_DIR = "data/library/sifu-authority";

export const SIFU_AUTHORITY_BOOK_DESCRIPTORS: SifuAuthorityBookDescriptor[] = [
  {
    bookId: "bazi-authority-interactions",
    file: `${AUTHORITY_DIR}/bazi-authority-interactions.md`,
    title: "Interactions · 合冲刑害破 / 墓庫",
    scope: "Packet-grounded interaction resolution and no-invention discipline.",
    sourceIds: ["bazi-interaction-master", "bazi-hechong-resolution", "pillar-interactions"],
    routerTriggers: ["合", "冲", "刑", "害", "破", "墓庫", "synastry interactions"],
  },
  {
    bookId: "bazi-authority-geju-xiangshen",
    file: `${AUTHORITY_DIR}/bazi-authority-geju-xiangshen.md`,
    title: "Geju/Xiangshen · 格局 / 相神",
    scope: "Structure, helper, success/failure, rescue, and structural audit.",
    sourceIds: ["bazi-geju-master", "bazi-xiangshen-judgment", "zpzq-zhenquan-clean", "yhzp-juan3-koujue"],
    routerTriggers: ["格局", "相神", "成格", "破格", "救應", "用神"],
  },
  {
    bookId: "bazi-authority-tiaohou-yongshen",
    file: `${AUTHORITY_DIR}/bazi-authority-tiaohou-yongshen.md`,
    title: "Tiaohou/Yongshen · 調候 / 用神",
    scope: "DM x month climate, yongshen support, and climate medicine boundaries.",
    sourceIds: ["yongshen-selection-engine-reference", "qtbj-tiaohou-clean", "qtbj-tiaohou-lookup", "qtbj-tiaohou-thai-notes", "sftk-clean"],
    routerTriggers: ["日干", "月令", "調候", "窮通寶鑑", "用神", "寒暖燥濕"],
  },
  {
    bookId: "bazi-authority-conghua-special-ge",
    file: `${AUTHORITY_DIR}/bazi-authority-conghua-special-ge.md`,
    title: "Conghua/Special Ge · 從化 / 旺衰 / 通關",
    scope: "Qi momentum, strength, following/transformation boundary, and mediator logic.",
    sourceIds: ["dts-zhentian-clean", "bazi-conghua-master"],
    routerTriggers: ["旺衰", "氣勢", "從格", "化格", "通關", "病藥"],
  },
  {
    bookId: "bazi-authority-shishen-roles",
    file: `${AUTHORITY_DIR}/bazi-authority-shishen-roles.md`,
    title: "Shishen Roles · 十神",
    scope: "Ten-god role language and life-domain translation.",
    sourceIds: ["bazi-shishen-classical", "yhzp-clean"],
    routerTriggers: ["十神", "財", "官", "印", "食傷", "life roles"],
  },
  {
    bookId: "bazi-authority-yingqi-timing",
    file: `${AUTHORITY_DIR}/bazi-authority-yingqi-timing.md`,
    title: "Yingqi/Timing · 應期",
    scope: "Luck/year/month activation and five-domain timing.",
    sourceIds: ["classical-ziping-event-timing", "classical-bazi-five-life-domains"],
    routerTriggers: ["大運", "流年", "ปีจร", "วัยจร", "timing window"],
  },
  {
    bookId: "bazi-authority-hehun-liuqin",
    file: `${AUTHORITY_DIR}/bazi-authority-hehun-liuqin.md`,
    title: "Hehun/Liuqin · 合婚 / 六親",
    scope: "Pair, group, family, spouse, children, and relationship discipline.",
    sourceIds: ["bazi-hehun-classical", "bazi-zixi-mangpai"],
    routerTriggers: ["合婚", "pair", "group", "แม่ลูก", "คู่", "family"],
  },
  {
    bookId: "bazi-authority-shensha-secondary",
    file: `${AUTHORITY_DIR}/bazi-authority-shensha-secondary.md`,
    title: "Shensha Secondary · 神煞",
    scope: "Secondary stars and broad symbolic confirmation.",
    sourceIds: ["bazi-shensha-catalog", "smtg-clean"],
    routerTriggers: ["神煞", "ดาวพิเศษ", "secondary stars"],
  },
  {
    bookId: "bazi-authority-nayin-texture",
    file: `${AUTHORITY_DIR}/bazi-authority-nayin-texture.md`,
    title: "Nayin Texture · 納音60",
    scope: "Nayin texture as auxiliary metaphor only.",
    sourceIds: ["bazi-nayin-master"],
    routerTriggers: ["納音", "nayin", "60 Jiazi texture"],
  },
];

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function sourceRow(source: SifuSourceManifestEntry): SifuAuthorityBookSourceRow {
  return {
    sourceId: source.sourceId,
    relativePath: source.relativePath,
    authorityBook: source.authorityBook,
    tier: source.tier,
    chars: source.chars,
    bytes: source.bytes,
    sourceHashSha256: source.sourceHashSha256,
    promptSegmentHashSha256: source.promptSegmentHashSha256,
    selected: source.selected,
    included: source.included,
    sourcePriority: source.sourcePriority,
  };
}

export function buildSifuAuthorityBooksCatalog(opts: {
  root?: string;
  generatedAt?: string;
  manifest?: SifuSourceManifest;
} = {}): SifuAuthorityBooksCatalog {
  const root = opts.root || process.cwd();
  const generatedAt = opts.generatedAt || new Date().toISOString();
  const manifest = opts.manifest || buildSifuSourceManifest("sifu-single-full-current", { root, generatedAt });
  const byId = new Map(manifest.sources.map((source) => [source.sourceId, source]));
  const books = SIFU_AUTHORITY_BOOK_DESCRIPTORS.map((descriptor) => {
    const path = join(root, descriptor.file);
    const text = readFileSync(path, "utf8").trim();
    const sourceRows: SifuAuthorityBookSourceRow[] = [];
    const missingSourceIds: string[] = [];
    for (const sourceId of descriptor.sourceIds) {
      const source = byId.get(sourceId);
      if (source) sourceRows.push(sourceRow(source));
      else missingSourceIds.push(sourceId);
    }
    const sourceMapHashSha256 = sha256(JSON.stringify({
      version: SIFU_AUTHORITY_BOOKS_VERSION,
      bookId: descriptor.bookId,
      sourceManifestHash: manifest.sourceManifestHash,
      sources: sourceRows.map((row) => ({
        sourceId: row.sourceId,
        sourceHashSha256: row.sourceHashSha256,
        promptSegmentHashSha256: row.promptSegmentHashSha256,
        selected: row.selected,
        included: row.included,
        sourcePriority: row.sourcePriority,
      })),
    }));
    return {
      ...descriptor,
      relativePath: relative(root, path),
      chars: text.length,
      bytes: Buffer.byteLength(text, "utf8"),
      bookHashSha256: sha256(text),
      sourceMapHashSha256,
      sourceRows,
      missingSourceIds,
    };
  });
  const catalogHashSha256 = sha256(JSON.stringify({
    version: SIFU_AUTHORITY_BOOKS_VERSION,
    sourceManifestHash: manifest.sourceManifestHash,
    books: books.map((book) => ({
      bookId: book.bookId,
      bookHashSha256: book.bookHashSha256,
      sourceMapHashSha256: book.sourceMapHashSha256,
      sourceIds: book.sourceRows.map((row) => row.sourceId),
    })),
  }));
  return {
    catalogVersion: SIFU_AUTHORITY_BOOKS_VERSION,
    generatedAt,
    sourceManifestHash: manifest.sourceManifestHash,
    bookCount: books.length,
    totalChars: books.reduce((sum, book) => sum + book.chars, 0),
    totalBytes: books.reduce((sum, book) => sum + book.bytes, 0),
    catalogHashSha256,
    books,
  };
}

export function summarizeSifuAuthorityBooksCatalog(catalog: SifuAuthorityBooksCatalog) {
  return {
    catalogVersion: catalog.catalogVersion,
    sourceManifestHash: catalog.sourceManifestHash,
    bookCount: catalog.bookCount,
    totalChars: catalog.totalChars,
    totalBytes: catalog.totalBytes,
    catalogHashSha256: catalog.catalogHashSha256,
    books: catalog.books.map((book) => ({
      bookId: book.bookId,
      relativePath: book.relativePath,
      scope: book.scope,
      chars: book.chars,
      bytes: book.bytes,
      bookHashSha256: book.bookHashSha256,
      sourceMapHashSha256: book.sourceMapHashSha256,
      missingSourceIds: book.missingSourceIds,
      sourceIds: book.sourceRows.map((row) => row.sourceId),
      routerTriggers: book.routerTriggers,
    })),
  };
}

