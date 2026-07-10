import { createHash } from "crypto";
import type { PdfBlockV2, PdfDocumentV2 } from "@/lib/pdf-document-v2";

export type AiSection = { title: string; blocks: PdfBlockV2[] };

export function pdfReportId(prefix: string, evidence: unknown): string {
  const safePrefix = String(prefix || "HK").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "HK";
  const digest = createHash("sha256").update(JSON.stringify(evidence)).digest("hex").slice(0, 10).toUpperCase();
  return `${safePrefix}-${digest}`;
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .trim();
}

/** Convert constrained AI Markdown into safe V2 prose/list blocks. Tables are intentionally unsupported. */
export function aiSectionsFromMarkdown(markdown: string): AiSection[] {
  const lines = String(markdown || "").split(/\r?\n/);
  const raw: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of lines) {
    const heading = line.match(/^\s*##\s+(.+?)\s*$/);
    if (heading) {
      current = { title: cleanInlineMarkdown(heading[1]), lines: [] };
      raw.push(current);
      continue;
    }
    if (!current) {
      if (!line.trim()) continue;
      current = { title: "", lines: [] };
      raw.push(current);
    }
    current.lines.push(line);
  }

  return raw.map((section) => {
    const blocks: PdfBlockV2[] = [];
    let prose: string[] = [];
    let list: string[] = [];
    const flushProse = () => {
      if (prose.length) blocks.push({ type: "prose", paragraphs: prose });
      prose = [];
    };
    const flushList = () => {
      if (list.length) blocks.push({ type: "list", items: list, ordered: false });
      list = [];
    };
    for (const line of section.lines) {
      const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
      if (bullet) {
        flushProse();
        list.push(cleanInlineMarkdown(bullet[1]));
        continue;
      }
      if (!line.trim()) {
        flushProse();
        flushList();
        continue;
      }
      flushList();
      prose.push(cleanInlineMarkdown(line));
    }
    flushProse();
    flushList();
    return { title: section.title, blocks };
  }).filter((section) => section.title || section.blocks.length);
}

export function assertAiSectionCount(markdown: string, expected: number): void {
  const count = aiSectionsFromMarkdown(markdown).length;
  if (count !== expected) throw new Error(`ai_format_invalid_sections_${count}_expected_${expected}`);
}

/** Reject concrete measurements that were not supplied by the deterministic packet. */
export function assertEvidenceBoundMeasurements(markdown: string, evidence: unknown): void {
  const text = String(markdown || "");
  const source = JSON.stringify(evidence);
  if (/\b\d+(?:\.\d+)?\s*%/g.test(text)) throw new Error("ai_novel_percentage");

  const exactPatterns = [
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b(?:[01]\d|2[0-3]):[0-5]\d\b/g,
  ];
  for (const pattern of exactPatterns) {
    for (const match of text.matchAll(pattern)) {
      if (!source.includes(match[0])) throw new Error(`ai_novel_measurement_${match[0]}`);
    }
  }

  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\s*°/g)) {
    if (!source.includes(match[1])) throw new Error(`ai_novel_degree_${match[1]}`);
  }
  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\s*\/\s*100\b/g)) {
    if (!source.includes(match[1])) throw new Error(`ai_novel_score_${match[1]}`);
  }
}

export function makeAiDocument(input: {
  prefix: string;
  evidence: unknown;
  lang: string;
  title: string;
  headerTitle?: string;
  verificationLabel?: string;
  cover: PdfDocumentV2["cover"];
  markdown: string;
  deterministicFirstPage?: PdfBlockV2[];
}): PdfDocumentV2 {
  const sections = aiSectionsFromMarkdown(input.markdown);
  const pages = sections.map((section, index) => ({
    title: section.title || undefined,
    landscape: false,
    blocks: index === 0 && input.deterministicFirstPage?.length
      ? [...input.deterministicFirstPage, ...section.blocks]
      : section.blocks,
  }));
  if (!pages.length) pages.push({ title: undefined, landscape: false, blocks: input.deterministicFirstPage || [] });
  return {
    version: "hourkey.pdf.v2",
    report: {
      id: pdfReportId(input.prefix, input.evidence),
      kind: "ai",
      lang: input.lang,
      title: input.title,
      headerTitle: input.headerTitle,
      issuedAt: new Date().toISOString(),
      verificationLabel: input.verificationLabel,
    },
    cover: input.cover,
    pages,
  };
}
