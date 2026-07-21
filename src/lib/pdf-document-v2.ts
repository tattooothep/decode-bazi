import { z } from "zod";

export const pdfCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const pdfBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    text: z.string().max(180),
    level: z.union([z.literal(2), z.literal(3)]).default(2),
  }),
  z.object({
    type: z.literal("callout"),
    label: z.string().max(100).optional(),
    text: z.string().max(4000),
    tone: z.enum(["neutral", "good", "warning", "danger"]).default("neutral"),
  }),
  z.object({
    type: z.literal("facts"),
    items: z.array(z.object({ label: z.string().max(120), value: z.string().max(1000) })).max(20),
    columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  }),
  z.object({
    type: z.literal("table"),
    columns: z.array(z.object({ key: z.string().max(80), label: z.string().max(120), width: z.string().max(20).optional() })).min(1).max(6),
    rows: z.array(z.record(z.string(), pdfCellSchema)).max(200),
    compact: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("list"),
    items: z.array(z.string().max(2000)).max(40),
    ordered: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("prose"),
    paragraphs: z.array(z.string().max(5000)).max(30),
  }),
  z.object({
    type: z.literal("figure"),
    svg: z.string().max(1_000_000),
    caption: z.string().max(500).optional(),
  }),
]);

export const pdfDocumentV2Schema = z.object({
  version: z.literal("hourkey.pdf.v2"),
  report: z.object({
    id: z.string().min(4).max(100),
    kind: z.enum(["quick", "ai"]),
    lang: z.string().min(2).max(10),
    title: z.string().min(1).max(180),
    headerTitle: z.string().max(180).optional(),
    issuedAt: z.string().datetime().optional(),
    verificationLabel: z.string().max(180).optional(),
  }),
  cover: z.object({
    kick: z.string().max(180).optional(),
    title: z.string().min(1).max(180),
    who: z.string().max(300).optional(),
    meta: z.array(z.string().max(500)).max(12).default([]),
    glyph: z.string().max(8).optional(),
    badge: z.string().max(240).optional(),
  }),
  pages: z.array(z.object({
    title: z.string().max(180).optional(),
    landscape: z.boolean().default(false),
    blocks: z.array(pdfBlockSchema).max(80),
  })).min(1).max(80),
});

export type PdfBlockV2 = z.infer<typeof pdfBlockSchema>;
export type PdfDocumentV2 = z.infer<typeof pdfDocumentV2Schema>;

const legacyHtmlSchema = z.string().max(500_000);
export const legacyPdfDocumentSchema = z.object({
  version: z.literal("hourkey.pdf.legacy.v1"),
  report: z.object({
    id: z.string().min(4).max(100),
    lang: z.string().min(2).max(10),
    title: z.string().min(1).max(300),
    headerTitle: z.string().max(300).optional(),
    verificationLabel: z.string().max(180).optional(),
  }),
  extraCss: z.string().max(120_000).optional(),
  cover: z.object({
    kick: z.string().max(300).optional(),
    title: z.string().min(1).max(300),
    who: z.string().max(500).optional(),
    metaHtml: legacyHtmlSchema.optional(),
    big: z.string().max(20).optional(),
    sub: z.string().max(1000).optional(),
    badge: z.string().max(500).optional(),
  }).optional(),
  pages: z.array(z.object({
    sections: z.array(legacyHtmlSchema).max(60),
    landscape: z.boolean().default(false),
  })).min(1).max(30),
});

export type LegacyPdfDocument = z.infer<typeof legacyPdfDocumentSchema>;

export function parsePdfDocumentV2(value: unknown): PdfDocumentV2 {
  return pdfDocumentV2Schema.parse(value);
}

export function parseLegacyPdfDocument(value: unknown): LegacyPdfDocument {
  return legacyPdfDocumentSchema.parse(value);
}

function assertPassiveMarkup(value: string): void {
  if (/<\/?(?:script|foreignObject|iframe|object|embed|link|meta|base|form|input|button)\b/i.test(value)
    || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(value)
    || /\son[a-z]+\s*=/i.test(value)
    || /javascript\s*:/i.test(value)
    || /@import/i.test(value)) {
    throw new Error("pdf_unsafe_markup");
  }
  const refs = value.matchAll(/\s(?:href|xlink:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi);
  for (const match of refs) {
    const ref = match[1] ?? match[2] ?? match[3] ?? "";
    if (!/^#[A-Za-z_][\w:.-]*$/.test(ref)
      && !/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(ref)) {
      throw new Error("pdf_external_reference");
    }
  }
  const urls = value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi);
  for (const match of urls) {
    const ref = match[1] ?? match[2] ?? match[3] ?? "";
    if (!/^#[A-Za-z_][\w:.-]*$/.test(ref)
      && !/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(ref)) {
      throw new Error("pdf_external_url");
    }
  }
}

function assertPassiveCss(value: string): void {
  if (/@import|javascript\s*:|expression\s*\(|behavior\s*:|-moz-binding/i.test(value)) {
    throw new Error("pdf_unsafe_css");
  }
  const urls = value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi);
  for (const match of urls) {
    const ref = match[1] ?? match[2] ?? match[3] ?? "";
    if (!/^#[A-Za-z_][\w:.-]*$/.test(ref)
      && !/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(ref)) {
      throw new Error("pdf_external_css_url");
    }
  }
}

/** Client-built quick reports may contain inline SVG diagrams. Keep Chromium
 * rendering data-only: no active markup and no external file/network loads. */
export function assertPdfDocumentServerSafe(doc: PdfDocumentV2): void {
  for (const page of doc.pages) {
    for (const block of page.blocks) {
      if (block.type !== "figure") continue;
      const svg = block.svg.trim();
      if (!/^<svg(?:\s|>)/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
        throw new Error("pdf_figure_invalid_svg");
      }
      assertPassiveMarkup(svg);
    }
  }
}

export function assertLegacyPdfDocumentServerSafe(doc: LegacyPdfDocument): void {
  if (doc.extraCss) assertPassiveCss(doc.extraCss);
  if (doc.cover?.metaHtml) assertPassiveMarkup(doc.cover.metaHtml);
  for (const page of doc.pages) {
    for (const section of page.sections) assertPassiveMarkup(section);
  }
}
