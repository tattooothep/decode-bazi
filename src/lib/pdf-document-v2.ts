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
    svg: z.string().max(250_000),
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

export function parsePdfDocumentV2(value: unknown): PdfDocumentV2 {
  return pdfDocumentV2Schema.parse(value);
}
