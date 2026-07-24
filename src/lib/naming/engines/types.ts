/**
 * โครง response ร่วมของทุก engine ตั้งชื่อหลายชาติ (ฝั่ง server)
 * ทุก engine (ไทยทักษา/เลขศาสตร์/นักษัตร/คาลเดียน/พีทาโกรัส/ญี่ปุ่น五格) คืนโครงเดียวกันนี้
 * - evidence[] ต้องอ้าง quote จากไฟล์ตำราจริงใน data/library/naming-canon เสมอ
 * - ค่าไหนที่ตำราไม่มี → ใส่ notAvailable ห้ามเดา
 */

export type Evidence = {
  canonFile: string; // path สัมพัทธ์ใน data/library/naming-canon เช่น "thai/taksa-pakorn.md"
  quote: string; // ข้อความจริงจากตำรา (ยกมาตรง)
};

export type BreakdownItem = {
  label: string;
  value: string | number;
  luck?: string | null; // เช่น "มงคล" | "ร้าย" | "great_luck" ...
  note?: string | null;
};

export type NotAvailableItem = {
  field: string;
  reason: string; // อธิบายว่าทำไมตำราไม่มี/ยังหาไม่เจอ
};

export type NamingEngineResult = {
  ok: boolean;
  system: string; // thai_taksa | thai_leksart | indian_nakshatra | chaldean | pythagorean | japanese_gokaku
  score: number | null; // สรุปคะแนน (อาจ null ถ้าตำราไม่ให้เกณฑ์คะแนน)
  verdict: string; // ฟันธงสั้น 1-2 บรรทัด สำหรับจอ
  breakdown: BreakdownItem[];
  evidence: Evidence[];
  notAvailable: NotAvailableItem[];
  disclaimer: string | null; // ข้อความกำกับที่มา/ข้อจำกัด (เช่น เลขศาสตร์ไทยไม่มีต้นฉบับเล่มเดียว)
  canonRef: string; // ไฟล์ตำราหลักที่ engine นี้อ้าง
};

export function fail(system: string, canonRef: string, verdict: string, notAvailable: NotAvailableItem[] = []): NamingEngineResult {
  return { ok: false, system, score: null, verdict, breakdown: [], evidence: [], notAvailable, disclaimer: null, canonRef };
}
