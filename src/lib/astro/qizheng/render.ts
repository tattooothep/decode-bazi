/**
 * astro/qizheng · render packet → prompt (ไทยนำ · ให้ AI ตีความ)
 * ⚠️ ศัพท์เฉพาะ 七政四餘 (命主/廟旺/恩用仇難/格局/12宮) — ห้ามปนปาจื้อ(用神/十神)/Western(house สากล)
 */
import type { QizhengPacket } from "./packet";

export function renderQizhengPrompt(p: QizhengPacket, lang: "th" | "en" | "zh" = "th"): string {
  const d = p.data;
  const L: string[] = [];
  L.push(`【ผังดวง 七政四餘 (ดาวจริงบนฟ้า)】 — packetVersion=${p.packetVersion}`);
  if (!p.hasBirthTime) L.push(`⚠️ ดวงนี้ไม่ระบุเวลาเกิด → ไม่มีลัคนา/命宮/12宮 (อ่านได้เฉพาะดาว+廟旺+格局ระดับวัน)`);
  L.push(`命宮(ลัคนา): ${d.ascendant.signTh} · 命主(เจ้าชะตา · ดาวเจ้าเรือนลัคนา): ${d.ascendant.rulerTh} สถานะ${d.yongshen.status}`);
  L.push(`\nดาว 7政+4餘 (廟旺):`);
  for (const s of d.stars) L.push(`  ${s.zh} ${s.th} · ราศี${s.signTh} 宿${s.shu} · ${s.status}${s.retro ? " (พักร์)" : ""}`);
  L.push(`\n恩星(หนุน命主): ${d.enStars.join("、") || "—"} · 用星(命主ระบายไป): ${d.yongStars.join("、") || "—"} · 仇星: ${d.chouStars.join("、") || "—"} · 難星(ขัด命主): ${d.nanStars.join("、") || "—"}`);
  if (d.geju.length) L.push(`格局: ${d.geju.map((g) => g.th + (g.good ? "(ดี)" : "(ระวัง)")).join(" · ")}`);
  if (d.houses12.length) {
    L.push(`\n【12 เรือนชีวิต — 先看其宮後看其主】`);
    for (const h of d.houses12) {
      const mk = h.level === "good" ? "⭐เด่น" : h.level === "weak" ? "⚠ระวัง" : "ปานกลาง";
      L.push(`  เรือน${h.house} ${h.zh}(${h.domain}) [${mk}] — ราศี${h.signTh} เจ้าเรือน=${h.rulerTh}(${h.rulerStatus}) ตกเรือน${h.rulerInHouse}${h.starsInHouse.length ? " · มีดาว:" + h.starsInHouse.join("+") : ""}`);
    }
  }
  if (d.transit.length) {
    L.push(`\n【ดาวจร 流年 — 木(โอกาส)/土(ภาระ) เทียบเรือนเกิด】`);
    for (const t of d.transit) L.push(`  ${t.year}: ${t.note}`);
  }
  L.push(`\nสรุป engine: ${d.verdictTh} (ระดับ ${d.level})`);
  L.push(`\n⟦คำสั่ง⟧ คุณคือซินแส 七政四餘 (โหราศาสตร์ดาวจริงสายจีน/果老星宗) · อ่านเฉพาะจากผังนี้ · ใช้ศัพท์ 命主/廟旺/恩用仇難/格局/เรือน12 · ห้ามใช้ศัพท์ปาจื้อ(用神十神)หรือฝรั่ง · field ไหนไม่มีให้บอกว่าไม่มี ห้ามเดา · ไทยนำ`);
  return L.join("\n");
}
