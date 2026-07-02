// ทดสอบ 十干化曜 (變曜) — golden ตาม 張果星宗二·天干化曜星例 (藝術典 卷568 · verbatim)
// run: npx tsx scripts/test-qizheng-huayao.mjs
import { huaYaoForStem, qizhengHuaYao, yearStemIndexAt, HUAYAO_STEMS } from "../src/lib/astro/qizheng/huayao.ts";
import { qizhengNatal } from "../src/lib/astro/qizheng/engine.ts";
import { buildQizhengPacket } from "../src/lib/astro/qizheng/packet.ts";
import { renderQizhengPrompt } from "../src/lib/astro/qizheng/render.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${detail}`); }
};

// ---- 1) แถว 甲 เต็มแถว — verbatim 卷568: 天祿 火孛木金土月水炁計羅 (คอลัมน์แรกของทุกแถว)
// 甲: 祿=火 暗=孛 福=木 耗=金 蔭=土 貴=月 刑=水 印=炁 囚=計 權=羅
const jia = huaYaoForStem(0);
const jiaExpect = [
  ["祿", "火"], ["暗", "孛"], ["福", "木"], ["耗", "金"], ["蔭", "土"],
  ["貴", "月"], ["刑", "水"], ["印", "炁"], ["囚", "計"], ["權", "羅"],
];
ok("甲 ครบ 10 บทบาท", jia.length === 10);
let jiaOk = true, jd = "";
jia.forEach((row, i) => {
  if (row.role.zh !== jiaExpect[i][0] || row.star.zh !== jiaExpect[i][1]) { jiaOk = false; jd += `${row.role.zh}=${row.star.zh}≠${jiaExpect[i][1]} `; }
});
ok("แถว 甲 ตรงตาราง verbatim ทุกช่อง", jiaOk, jd);
// ตัวอย่างในต้นฉบับ: 「假如甲生人欲推何星化貴 … 便知月化貴也」
ok("甲化貴 = 月 (ตามตัวอย่างต้นฉบับ)", jia.find((r) => r.role.zh === "貴")?.star.zh === "月");

// ---- 2) แถว 乙 เลื่อน 1: 天暗 row 卷568 = 孛木金土月水炁計羅火 → 乙祿=孛
const yi = huaYaoForStem(1);
ok("乙 祿=孛 (เลื่อน 1 ดาว)", yi[0].role.zh === "祿" && yi[0].star.zh === "孛");
ok("乙 權=火 (天權 row: 羅火…)", yi[9].star.zh === "火");

// ---- 3) แถว 癸 วนรอบ: 天祿 row ช่องสุดท้าย = 羅 · 天暗 row ช่องสุดท้าย = 火
const gui = huaYaoForStem(9);
ok("癸 祿=羅 (wrap)", gui[0].star.zh === "羅");
ok("癸 暗=火 (wrap)", gui[1].star.zh === "火");
ok("癸 權=計 (天權 row: …水炁計)", gui[9].star.zh === "計");

// ---- 4) 管เรือน (บท 變曜): 祿→官祿 · 暗→相貌 · … · 權→命宮
const palaceExpect = ["官祿", "相貌", "財帛(福德/遷移)", "兄弟", "妻妾", "男女", "奴僕", "田宅", "疾厄", "命宮"];
ok("palace assignments ตรงบท 變曜", jia.every((r, i) => r.role.palaceZh === palaceExpect[i]));

// ---- 5) stem index ปลอดภัยทุกค่า + วน mod
ok("stemIndex 10 = 甲", huaYaoForStem(10)[0].star.zh === "火");
ok("stemIndex -1 = 癸", huaYaoForStem(-1)[0].star.zh === "羅");

// ---- 6) year stem: golden Aeaw 1984-12-31 13:15 กรุงเทพ → ปีจันทรคติ 甲子 (ตรง golden ปาจื้อ Year 甲子)
const birth = { dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018 };
const stemIdx = yearStemIndexAt(birth.dtUTC, Math.round(birth.lng / 15));
ok("Aeaw year stem = 甲", HUAYAO_STEMS[stemIdx] === "甲", `got ${HUAYAO_STEMS[stemIdx]}`);
// หลังตรุษจีน 1985 (1985-02-20+) ต้องเป็นปี 乙丑
const stemIdx85 = yearStemIndexAt(new Date("1985-03-01T06:00:00Z"), 7);
ok("1985-03-01 year stem = 乙 (หลังตรุษจีน)", HUAYAO_STEMS[stemIdx85] === "乙", `got ${HUAYAO_STEMS[stemIdx85]}`);

// ---- 7) packet integration
const packet = buildQizhengPacket(birth.dtUTC, birth.lat, birth.lng, true, undefined, new Date("2026-07-01T00:00:00Z"));
const hy = packet.data.huaYao;
ok("packet มี data.huaYao", !!hy);
ok("packet huaYao.yearStem = 甲", hy?.yearStem === "甲");
ok("packet huaYao 祿=火 (甲)", hy?.roles[0]?.role === "祿" && hy?.roles[0]?.starZh === "火");
ok("ทุกบทบาทมี natalHouse 1-12 (มีเวลาเกิด)", hy?.roles.every((r) => r.natalHouse >= 1 && r.natalHouse <= 12));
ok("ทุกบทบาทมี natalStatus จาก engine", hy?.roles.every((r) => typeof r.natalStatus === "string" && r.natalStatus.length > 0));
ok("notAvailable ไม่มี 化曜 แล้ว", !packet.notAvailable.includes("化曜"));
ok("notAvailable ยังแจ้ง 流日/小限", packet.notAvailable.includes("流日") && packet.notAvailable.includes("小限"));

// natalHouse ต้องตรงคำนวณตรงจาก natal reading
const natal = qizhengNatal(birth.dtUTC, birth.lat, birth.lng, true);
const asc = natal.reading.ascendant.sign;
let houseOk = true;
for (const r of hy.roles) {
  const star = natal.reading.stars.find((s) => s.key === r.starKey);
  const h = ((star.sign - asc + 12) % 12) + 1;
  if (h !== r.natalHouse) houseOk = false;
}
ok("natalHouse ตรงคำนวณตรงทุกดวง", houseOk);

// ---- 8) render มี section 化曜
const rendered = renderQizhengPrompt(packet);
ok("render มี 【十干化曜】 + HUAYAO_GUARD", rendered.includes("十干化曜") && rendered.includes("HUAYAO_GUARD"));
ok("render มีแถว 天祿", rendered.includes("天祿"));

// ---- 9) no-time: huaYao ยังมี (ใช้แค่ก้านปี) แต่ natalHouse ปิด
const packetNT = buildQizhengPacket(birth.dtUTC, birth.lat, birth.lng, false, undefined, new Date("2026-07-01T00:00:00Z"));
ok("no-time: มี huaYao + natalHouse = null", !!packetNT.data.huaYao && packetNT.data.huaYao.roles.every((r) => r.natalHouse === null));
ok("no-time: notAvailable ไม่มี 化曜", !packetNT.notAvailable.includes("化曜"));

// ---- 10) determinism
const packet2 = buildQizhengPacket(birth.dtUTC, birth.lat, birth.lng, true, undefined, new Date("2026-07-01T00:00:00Z"));
ok("deterministic", JSON.stringify(packet2.data.huaYao) === JSON.stringify(packet.data.huaYao));

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
