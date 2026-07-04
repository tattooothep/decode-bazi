/**
 * chart-svg.ts · dispatcher ภาพพื้นดวง 6 ศาสตร์ (สำหรับหนังสือคัมภีร์ชะตา · r401)
 * ════════════════════════════════════════════════════════════════════════════
 * รวมทางเข้าเดียว: route/worker เรียก buildScienceChartSvg(science, birth) ที่เดียว
 * ไม่ต้องรู้ว่าศาสตร์ไหนใช้ grid หรือ wheel · map 6 ScienceId → 6 ฟังก์ชัน template
 *
 * ⚠️ additive/isolated — "อ่าน" template อย่างเดียว (chart-svg-grid/wheel เสร็จแล้ว ห้ามแก้)
 * ⚠️ try/catch คืน "" ถ้า engine/วาดพัง → บทยังออกได้ (ภาพเป็น optional เสมอ)
 * deterministic (template ไม่มี Date.now/Math.random)
 */
import type { ScienceId } from "@/lib/fusion5/disciplines";
import { baziChartSvg, ziweiChartSvg, vedicChartSvg, type BookBirth } from "./chart-svg-grid";
import { westernChartSvg, qizhengChartSvg, uranianChartSvg } from "./chart-svg-wheel";

/** contract input ตรงกับ template ทั้งสองไฟล์ (BookBirth ≡ Birth) */
export type ChartBirth = BookBirth;

/** map ScienceId → ฟังก์ชันวาดภาพพื้นดวง (6 ศาสตร์) */
const CHART_BUILDERS: Record<ScienceId, (birth: ChartBirth) => string> = {
  bazi: baziChartSvg,
  ziwei: ziweiChartSvg,
  vedic: vedicChartSvg,
  western: westernChartSvg,
  qizheng: qizhengChartSvg,
  uranian: uranianChartSvg,
};

/**
 * คืน inline SVG string ของ "ภาพพื้นดวง" ตามศาสตร์
 * - รู้จักทุกศาสตร์ที่ available (6 ตัว)
 * - engine/วาดพัง หรือไม่รู้จักศาสตร์ → คืน "" (บทยังออกได้ · ภาพข้าม)
 */
export function buildScienceChartSvg(science: ScienceId, birth: ChartBirth): string {
  const build = CHART_BUILDERS[science];
  if (!build) return "";
  try {
    const svg = build(birth);
    return typeof svg === "string" && svg.trim().startsWith("<svg") ? svg : "";
  } catch {
    return "";
  }
}
