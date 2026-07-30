/**
 * ด่านตรวจคำอวยพรจากองค์เทพ — ต้องเป็นประโยค ไม่ใช่คำแนะนำ
 *
 * เจ้าของแจ้ง 30 ก.ค. สองรอบ
 *   ① "เสียงอวยพรเป็นคำแนะนำ ไม่ใช่ประโยคอวยพร"
 *   ② "เจนคำอวยพรให้มันยาวกว่านี้หน่อย"
 *
 * 🔴 กฎที่ห้ามหลุด: เนื้อความต้องมาจากผังจริงทุกคำ
 * เราแต่งได้แค่ **โครงประโยคพิธี** เท่านั้น
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBlessingSentence } from "../src/lib/qimen-blessing-sentence.ts";

let passed = 0;
function check(label: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`  ✅ ${label}`);
}

const PARTS = {
  deity: "ท่านจื๋อฝู",
  direction: "ตะวันออก",
  words: "เหมาะแก่การเจรจาและเริ่มงานใหม่",
};

console.log("── คำอวยพรต้องเป็นประโยค ──");

for (const locale of ["th", "en", "zh"] as const) {
  const text = buildBlessingSentence(PARTS, locale);
  console.log(`     [${locale}] ${text.length} ตัวอักษร`);
  check(`ภาษา ${locale}: มีคำจากผังอยู่ครบ`, () => {
    assert.ok(text.includes(PARTS.words), "คำจากผังหายไป");
    assert.ok(text.includes(PARTS.deity), "ชื่อองค์หายไป");
    assert.ok(text.includes(PARTS.direction), "ชื่อทิศหายไป");
  });
  check(`ภาษา ${locale}: ยาวพอจะเป็นคำอวยพร ไม่ใช่ประกาศสั้นๆ`, () => {
    // เจ้าของสั่งให้ยาวขึ้น — สั้นกว่านี้ฟังแล้วเหมือนป้ายบอกทาง
    const floor = locale === "zh" ? 60 : 150;
    assert.ok(text.length > floor, `ยาวแค่ ${text.length} ตัว`);
  });
  check(`ภาษา ${locale}: ไม่ยาวจนผู้ใช้ยืนฟังไม่ไหว`, () => {
    const ceiling = locale === "zh" ? 200 : 500;
    assert.ok(text.length < ceiling, `ยาวถึง ${text.length} ตัว`);
  });
}

check("🔴 ภาษาจีนต้องเป็นจีนล้วน ห้ามปนไทย", () => {
  // กฎ 3 ภาษาเข้มของโปรเจกต์
  const zh = buildBlessingSentence({ ...PARTS, deity: "值符", direction: "東方" }, "zh");
  assert.ok(!/[฀-๿]/.test(zh), `มีอักษรไทยปนอยู่: ${zh}`);
});

check("🔴 ภาษาอังกฤษต้องไม่มีอักษรไทยหรือจีนปน", () => {
  const en = buildBlessingSentence(
    { deity: "Zhi Fu", direction: "east", words: "good for negotiation" },
    "en",
  );
  assert.ok(!/[฀-๿一-鿿]/.test(en), `มีอักษรอื่นปน: ${en}`);
});

console.log("── ห้ามแต่งพรลอยๆ ──");

check("🔴 ไม่มีคำจากผัง = ไม่มีพร", () => {
  // พรที่ไม่มีที่มาคือการหลอกผู้ใช้
  assert.equal(buildBlessingSentence({ ...PARTS, words: "" }, "th"), "");
  assert.equal(buildBlessingSentence({ ...PARTS, words: "   " }, "th"), "");
});

check("ขาดชื่อองค์หรือทิศ = อ่านเฉพาะคำจากผัง ไม่พูดชื่อผิดองค์", () => {
  const noDeity = buildBlessingSentence({ ...PARTS, deity: "" }, "th");
  assert.equal(noDeity, PARTS.words);
  const noDir = buildBlessingSentence({ ...PARTS, direction: "" }, "th");
  assert.equal(noDir, PARTS.words);
});

console.log("── เส้นเสียงต้องใช้ประโยคที่ประกอบแล้ว ──");

const ROUTE = readFileSync(
  "src/app/api/mobile/v1/qimen/blessing-voice/route.ts",
  "utf8",
);

check("🔴 ต้องส่งประโยคที่ประกอบแล้วให้ตัวอ่านออกเสียง ไม่ใช่คำดิบ", () => {
  assert.ok(/buildBlessingSentence/.test(ROUTE), "ไม่ได้ประกอบประโยค");
  assert.ok(
    /contents: \[\{ parts: \[\{ text: spoken \}\] \}\]/.test(ROUTE),
    "ยังส่งคำดิบจากผังไปอ่าน = กลับไปเป็นคำแนะนำเหมือนเดิม",
  );
});

check("🔴 เก็บเสียงไว้ใช้ซ้ำต้องคิดจากประโยคที่ประกอบแล้ว", () => {
  // ถ้าคิดจากคำดิบ เปลี่ยนโครงประโยคแล้วจะได้เสียงเก่าค้างมา
  assert.ok(/cacheKey\(spoken, locale\)/.test(ROUTE), "คิดกุญแจเก็บเสียงจากคำดิบ");
});

console.log(`\n✅ ผ่านทั้งหมด ${passed} ข้อ`);
