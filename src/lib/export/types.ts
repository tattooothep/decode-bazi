/**
 * src/lib/export/types.ts · "Export สรุป PDF ด้วย AI" registry — สัญญาที่ทุกหน้า (chart/palm/fusion/…) ต้องทำตาม
 * ─ route.ts (POST/GET /api/export/summary) dispatch ผ่าน HANDLERS[page] ตัวเดียว · ไม่ hardcode หน้าใดหน้าหนึ่ง
 * ─ resolveInputs: รับ raw body.inputs + session → คืน {dataHash, ctx} (cache key + ข้อมูลที่ generate ต้องใช้ รวม cookie ภายใน)
 *   หรือ {error, status} ถ้า inputs ไม่ถูกต้อง/หา resource ไม่เจอ (route.ts แปลงเป็น NextResponse ตรง ๆ)
 * ─ generate: รับ ctx (จาก resolveInputs) + lang → เรียก engine/AI จริง คืน {markdown, cover, figs} (เก็บลง export_jobs.result)
 * ⚠️ ปกบังคับทุกหน้า (cover ต้องมีเสมอ) · ห้าม AI มั่ว: engine/ข้อมูลจริงคำนวณเสร็จก่อน AI แค่สรุปภาษา
 */
import type { Session } from "@/lib/auth";

export type ExportFig = { svg: string; cap: string };
export type ExportCover = Record<string, unknown>;

export type GenerateResult = {
  markdown: string;
  cover: ExportCover;
  figs: ExportFig[];
};

export type ResolveOk<Ctx> = { dataHash: string; ctx: Ctx };
export type ResolveErr = { error: string; status: number };

export interface PageHandler<Ctx = unknown> {
  /** validate + โหลดข้อมูลที่ generate ต้องใช้ (รวม auth cookie ถ้าต้องเรียก /api/sifu ภายใน) → คืน ctx + cache key */
  resolveInputs(rawInputs: Record<string, unknown>, session: Session): Promise<ResolveOk<Ctx> | ResolveErr>;
  /** engine คำนวณ/ดึงข้อมูลเสร็จแล้ว (จาก ctx) → AI แค่สรุปภาษา → markdown + cover(บังคับ) + figs */
  generate(ctx: Ctx, lang: string): Promise<GenerateResult>;
}
