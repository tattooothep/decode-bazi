/**
 * ด่านตรวจดาวเหินจร 紫白 ที่ต่อเข้าหน้าทิศเทพฉีเหมิน (30 ก.ค. 69)
 *
 * เจ้าของสั่งเอาดาวมาแสดงคู่องค์เทพ โดย "ไม่เตือน แค่โชว์"
 * ด่านนี้ยืนยันว่าดาวที่ส่งให้แอพถูกต้องตามตำรา และไม่ไปแตะผังฉีเหมิน
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeFlyingLayers } from "../src/lib/fengshui-luxing.ts";

const PALACE_TO_DIRECTION = {
  1: "N", 2: "SW", 3: "E", 4: "SE", 5: "C", 6: "NW", 7: "W", 8: "NE", 9: "S",
} as const;
const NAME: Record<number, string> = {
  1: "一白", 2: "二黑", 3: "三碧", 4: "四綠", 5: "五黃",
  6: "六白", 7: "七赤", 8: "八白", 9: "九紫",
};

let passed = 0;
function check(label: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`  ✅ ${label}`);
}

const L = computeFlyingLayers(2026, 7, 30, 14, 0);

console.log("── ดาวต่อกัง ยามนี้ ──");
for (const [palace, dir] of Object.entries(PALACE_TO_DIRECTION)) {
  const key = dir as keyof typeof L.hour_stars.palaces;
  console.log(
    `     กัง ${palace} (${dir})  ยาม ${NAME[L.hour_stars.palaces[key]]}`
    + `  วัน ${NAME[L.day_stars.palaces[key]]}`
    + `  เดือน ${NAME[L.month_stars.palaces[key]]}`,
  );
}

console.log("── ตรวจตามตำรา ──");

check("🔴 ดาวครบ 9 ดวงไม่ซ้ำไม่ขาด ในทุกชั้น", () => {
  // ลั่วซูบินลง 9 ช่อง ต้องได้ 1-9 ครบพอดี ซ้ำแปลว่าสูตรบินผิด
  for (const layer of [L.hour_stars, L.day_stars, L.month_stars]) {
    const got = Object.values(layer.palaces).sort((a, b) => a - b);
    assert.deepEqual(got, [1, 2, 3, 4, 5, 6, 7, 8, 9], "ดาวซ้ำหรือขาด");
  }
});

check("🔴 กังกลางต้องได้ดาวกลางตรงกับที่ประกาศ", () => {
  assert.equal(L.hour_stars.palaces.C, L.hour_stars.center);
  assert.equal(L.day_stars.palaces.C, L.day_stars.center);
  assert.equal(L.month_stars.palaces.C, L.month_stars.center);
});

check("🔴 ทุกกังฉีเหมินต้องมีดาว ไม่มีกังไหนว่าง", () => {
  for (const [palace, dir] of Object.entries(PALACE_TO_DIRECTION)) {
    const star = L.hour_stars.palaces[dir as keyof typeof L.hour_stars.palaces];
    assert.ok(star >= 1 && star <= 9, `กัง ${palace} ไม่มีดาว`);
  }
});

check("🔴 ดาวยามต้องเปลี่ยนเมื่อข้ามยาม", () => {
  // ผังฉีเหมินเปลี่ยนทุก 2 ชั่วโมง ดาวยามต้องเดินตามกันไป
  const next = computeFlyingLayers(2026, 7, 30, 16, 0);
  assert.notEqual(
    next.hour_stars.center,
    L.hour_stars.center,
    "ข้ามยามแล้วดาวไม่ขยับ",
  );
});

check("ดาวเดือนต้องไม่เปลี่ยนเมื่อข้ามแค่ยาม", () => {
  const next = computeFlyingLayers(2026, 7, 30, 16, 0);
  assert.equal(next.month_stars.center, L.month_stars.center);
});

console.log("── ต้องไม่ไปแตะผังฉีเหมิน ──");

const ROUTE = readFileSync("src/app/api/mobile/v1/qimen/route.ts", "utf8");

check("🔴 ดาวเป็นช่องเพิ่ม ไม่ทับช่องเดิมของผัง", () => {
  assert.ok(/flying_stars: flying/.test(ROUTE), "ไม่ได้ส่งดาวออกไป");
  assert.ok(/\.\.\.data,/.test(ROUTE), "ไม่ได้คงข้อมูลผังเดิมไว้ครบ");
});

check("🔴 ดาวล้มต้องไม่ลากผังฉีเหมินไปด้วย", () => {
  // ผังคือของหลัก ดาวคือของแถม — ของแถมพังห้ามทำของหลักพัง
  const block = ROUTE.slice(
    ROUTE.indexOf("let flying"),
    ROUTE.indexOf("return NextResponse.json(publicAiPayload"),
  );
  assert.ok(/try \{/.test(block) && /catch/.test(block), "ไม่มีกรอบกันข้อผิดพลาด");
  assert.ok(/console\.error/.test(block), "ดาวหายแล้วเงียบ");
});

check("🔴 ห้ามเอาดาวไปเปลี่ยนอันดับทิศของฉีเหมิน", () => {
  // เจ้าของเคาะ 30 ก.ค. "ไม่เตือน แค่โชว์ ผู้ใช้ตัดสินใจเอง"
  assert.ok(
    /ห้ามเอาดาวไปเปลี่ยนอันดับทิศของฉีเหมิน/.test(ROUTE),
    "ไม่ได้เขียนข้อตกลงนี้ไว้ในโค้ด คนอ่านทีหลังจะเอาไปรวมคะแนน",
  );
  assert.ok(
    !/ranking|score/i.test(
      ROUTE.slice(ROUTE.indexOf("let flying"), ROUTE.indexOf("return NextResponse")),
    ),
    "ดาวไปยุ่งกับคะแนนหรืออันดับ",
  );
});

check("การจับคู่กังกับทิศต้องตรงลั่วซู", () => {
  // 坎1北 坤2西南 震3東 巽4東南 中5 乾6西北 兌7西 艮8東北 離9南
  const want = { 1: "N", 2: "SW", 3: "E", 4: "SE", 5: "C", 6: "NW", 7: "W", 8: "NE", 9: "S" };
  for (const [palace, dir] of Object.entries(want)) {
    assert.ok(
      new RegExp(`${palace}: "${dir}"`).test(ROUTE),
      `กัง ${palace} ควรคู่กับทิศ ${dir}`,
    );
  }
});

console.log(`\n✅ ผ่านทั้งหมด ${passed} ข้อ`);
