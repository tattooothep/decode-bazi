// ทดสอบ Ziwei OVERLAY (大限ปัจจุบัน + 疊宮 + 自化 + 借星 + 流昌曲)
// run: npx tsx scripts/test-ziwei-overlay.mjs
import { ziweiChart } from "../src/lib/astro/ziwei/engine.ts";
import { buildZiweiOverlay } from "../src/lib/astro/ziwei/overlay.ts";
import { buildZiweiPacket } from "../src/lib/astro/ziwei/packet.ts";
import { renderZiweiPrompt } from "../src/lib/astro/ziwei/render.ts";
import { buildSciencePrompt } from "../src/lib/fusion5/build-prompt.ts";
import { SI_HUA, PALACE_NAMES, fix12, groundOf } from "../src/lib/astro/ziwei/tables.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${detail}`); }
};

// golden Aeaw: 1984-12-31 13:15 กรุงเทพ (UTC+7) — ปีจันทรคติ 1984 (甲子) → 虛歲 2026 = 43
const birth = { dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018 };
const refDate = new Date("2026-07-01T00:00:00Z");
const chart = ziweiChart(birth.dtUTC, birth.lat, birth.lng, "M", true, { refDate });
const ov = buildZiweiOverlay(chart, birth.dtUTC, 7, 2026);

// 1) 虛歲: เกิด ธ.ค. 1984 (จันทรคติ 甲子 = 1984) → 2026-1984+1 = 43
ok("虛歲 = 43", ov.age.xuSui === 43, `got ${ov.age.xuSui}`);

// 2) 大限ปัจจุบัน: ต้องเป็น宮ที่ ageStart<=43<=ageEnd และตรงกับ palaces จริง
const dx = chart.palaces.find((p) => 43 >= p.daXian.ageStart && 43 <= p.daXian.ageEnd);
ok("มี大限ปัจจุบัน", !!ov.currentDaXian);
ok("大限ตรงกับผังจริง", ov.currentDaXian?.natalPalaceName === dx?.name && ov.currentDaXian?.branch === dx?.branch,
  `ov=${ov.currentDaXian?.natalPalaceName} จริง=${dx?.name}`);

// 3) 疊宮: ครบ 12 ground · 大限命ตกที่宮大限จริง · 流年命ตกที่ taisui
ok("疊宮ครบ 12", ov.dieGong.length === 12);
const dgAtDaxian = ov.dieGong.find((r) => r.branch === dx.branch);
ok("疊宮: ที่地支ของ大限宮 → 大限=命宮", dgAtDaxian?.daXianName === "命宮", JSON.stringify(dgAtDaxian));
const liuNianBranch = chart.liuNian.mingBranch;
const dgAtTaisui = ov.dieGong.find((r) => r.branch === liuNianBranch);
ok("疊宮: ที่太歲 → 流年=命宮", dgAtTaisui?.liuNianName === "命宮", JSON.stringify(dgAtTaisui));
// natal ชื่อในทุกแถวต้องตรง palaces
ok("疊宮 natal ตรงผังทุกแถว", ov.dieGong.every((r) => chart.palaces.find((p) => p.branch === r.branch)?.name === r.natalName));
// ทิศการ relabel: ทวนเข็มเหมือน natal — ตรวจ宮ถัดไป (ground+1) ของ大限命 ต้องเป็น父母宮
const dgNext = ov.dieGong.find((r) => fix12(groundOf(r.branch)) === fix12(groundOf(dx.branch) + 1));
ok("疊宮 ทิศ relabel ถูก (ground+1 จาก大限命 = 父母)", dgNext?.daXianName === "父母", JSON.stringify(dgNext));

// 4) 自化: ตรวจทุกรายการกับตาราง SI_HUA + ตำแหน่งดาวจริง · และไม่มีตกหล่น
const starIn = (star, pal) => pal.majorStars.some((s) => s.name === star) || pal.minorStars.some((s) => s.name === star);
let ziOk = true, missing = 0;
for (const p of chart.palaces) {
  (SI_HUA[p.stem] || []).forEach((star, i) => {
    const isSelf = starIn(star, p);
    const reported = ov.ziHua.some((z) => z.palaceName === p.name && z.star === star);
    if (isSelf !== reported) { ziOk = false; missing++; }
  });
}
ok("自化 ครบและถูกทุกรายการ (เทียบ SI_HUA×ตำแหน่งจริง)", ziOk, `mismatch=${missing} · found=${ov.ziHua.length}`);

// 5) 借星: ทุก宮ที่ไม่มี主星ต้องมี (ถ้า對宮มีดาว) และดาวตรง對宮จริง
let jieOk = true;
for (const p of chart.palaces) {
  const opp = chart.palaces.find((x) => x.ground === fix12(p.ground + 6));
  const expect = p.majorStars.length === 0 && opp.majorStars.length > 0;
  const row = ov.jieXing.find((j) => j.palaceName === p.name);
  if (expect !== !!row) jieOk = false;
  if (row && JSON.stringify(row.stars) !== JSON.stringify(opp.majorStars.map((s) => s.name))) jieOk = false;
}
ok("借星 ครบถูกทุก宮ว่าง", jieOk, JSON.stringify(ov.jieXing));

// 6) 流昌流曲: 2026 = 丙午 → 流昌@申 流曲@午
ok("流年 2026 = 丙午", chart.liuNian.ganzhi === "丙午", chart.liuNian.ganzhi);
const lc = ov.liuChangQu.find((s) => s.star === "流昌"), lq = ov.liuChangQu.find((s) => s.star === "流曲");
ok("流昌@申 (丙)", lc?.branch === "申", JSON.stringify(lc));
ok("流曲@午 (丙)", lq?.branch === "午", JSON.stringify(lq));

// 7) packet + render + เต็มสาย
const packet = buildZiweiPacket(birth.dtUTC, birth.lat, birth.lng, "M", true, { refDate });
ok("packet มี overlay", !!packet.data.overlay);
ok("notAvailable ไม่มีธง overlay", !packet.notAvailable.some((x) => x.startsWith("overlay")));
const rendered = renderZiweiPrompt(packet);
ok("render มี OVERLAY + 疊宮 + 大限ปัจจุบัน", rendered.includes("【OVERLAY ปี 2026】") && rendered.includes("疊宮") && rendered.includes("大限ปัจจุบัน"));
const prompt = buildSciencePrompt("ziwei", [{ name: "เทส", dtUTC: birth.dtUTC, lat: birth.lat, lng: birth.lng, hasTime: true, gender: "M" }], "การงานปี 2026 เป็นยังไง", "th");
ok("เต็มสาย prompt มี OVERLAY", prompt.includes("【OVERLAY ปี 2026】"));
ok("prompt ไม่เกิน 118K (cap fusion5 4 ดวง)", prompt.length <= 118000, `${prompt.length}`);
console.log(`ขนาด prompt: ${prompt.length}`);

// 8) no-time → overlay null + ธง notAvailable
const packetNT = buildZiweiPacket(birth.dtUTC, birth.lat, birth.lng, "M", false, { refDate });
ok("no-time: overlay = null + ติดธง", packetNT.data.overlay === null && packetNT.notAvailable.some((x) => x.startsWith("overlay")));

// 9) ไม่มี refDate → overlay null (ไม่พังของเดิม)
const packetNoRef = buildZiweiPacket(birth.dtUTC, birth.lat, birth.lng, "M", true, {});
ok("ไม่มี refDate: overlay = null ไม่พัง", packetNoRef.data.overlay === null);

// 10) determinism + เคสเกิดต้นปี (ก่อนตรุษจีน · ปีจันทรคติต้องเป็นปีก่อน)
const ov2 = buildZiweiOverlay(chart, birth.dtUTC, 7, 2026);
ok("deterministic", JSON.stringify(ov2) === JSON.stringify(ov));
const chartJan = ziweiChart(new Date("1985-01-15T06:00:00Z"), 13.75, 100.5, "M", true, { refDate });
const ovJan = buildZiweiOverlay(chartJan, new Date("1985-01-15T06:00:00Z"), 7, 2026);
ok("เกิด ม.ค. ก่อนตรุษจีน: 虛歲นับจากปีจันทรคติ 1984 = 43", ovJan.age.xuSui === 43, `got ${ovJan.age.xuSui}`);

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
