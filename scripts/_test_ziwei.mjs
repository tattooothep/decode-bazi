/**
 * _test_ziwei.mjs · ดวงตัวอย่าง紫微斗數 + sanity check
 * รัน: npx tsx scripts/_test_ziwei.mjs
 * — Ziwei engine
 */
import { ziweiChart } from "../src/lib/astro/ziwei/engine.ts";
import { buildZiweiPacket } from "../src/lib/astro/ziwei/packet.ts";
import { renderZiweiPrompt } from "../src/lib/astro/ziwei/render.ts";

/* dtUTC = เวลาเกิดท้องถิ่น - offset (ไทย +7) */
function localToUTC(y, mo, d, h, mi, offset = 7) {
  return new Date(Date.UTC(y, mo - 1, d, h - offset, mi, 0));
}

const cases = [
  { label: "Aeaw 1984-12-31 13:15 ชาย กทม.", dt: localToUTC(1984, 12, 31, 13, 15), lat: 13.75, lng: 100.5018, g: "M" },
  { label: "Mai 1986-04-08 00:04 หญิง ชลบุรี", dt: localToUTC(1986, 4, 8, 0, 4), lat: 13.36, lng: 100.98, g: "F" },
];

for (const c of cases) {
  console.log("\n==================================================");
  console.log(c.label);
  console.log("==================================================");
  const chart = ziweiChart(c.dt, c.lat, c.lng, c.g, true, { gmtOffsetHours: 7, refDate: new Date(Date.UTC(2026, 0, 1)) });
  console.log(`命宮 ${chart.mingGong.ganzhi}(${chart.mingGong.branch}) · 身宮 ${chart.shenGong.branch} · ${chart.wuxingJu.name} · 紫微@ground${chart.ziweiGround}=${["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"][((chart.ziweiGround+2)%12)]}`);
  const packet = buildZiweiPacket(c.dt, c.lat, c.lng, c.g, true, { gmtOffsetHours: 7 });
  console.log("\n--- render (th) ---");
  console.log(renderZiweiPrompt(packet, "th"));
}

/* no-time degrade */
console.log("\n\n=== degrade (ไม่ทราบเวลา) ===");
const noTime = buildZiweiPacket(localToUTC(1984, 12, 31, 12, 0), 13.75, 100.5018, "M", false);
console.log(renderZiweiPrompt(noTime, "th"));
console.log("\ndegradeLevel:", noTime.degradeLevel, "| notAvailable:", noTime.notAvailable.join(", "));
