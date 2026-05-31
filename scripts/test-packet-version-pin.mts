/**
 * Test (#3 · dev/test-only · พ่อ codex: checksum ไม่เข้า prompt · อยู่ test เท่านั้น)
 * กัน "field drift": ถ้าโครง packet เปลี่ยน (เพิ่ม field derive จากเดือน / เปลี่ยน version) ต้อง bump โดยตั้งใจ
 * รัน: node --experimental-strip-types scripts/test-packet-version-pin.mts
 * อ่าน source ตรงๆ (ไม่ import chart-packet ที่ลาก wrapper/db) → เบา + ไม่แตะ chart-packet LOCKED
 */
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../src/lib/chart-packet.ts", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ck = (l: string, c: boolean, g?: string) => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (g ? " · " + g : ""))); };

/* version ที่ตรึงไว้ (ทั้ง type lock + ค่าจริงใน buildStructuredChartPacket) */
const EXPECT_VERSION = "hourkey-chart-packet-lite-v1.1";
const EXPECT_LEVEL = "step1_lite";
/* MONTH_DERIVED_FIELDS = ชุด field ที่ derive จากเสาเดือน · เพิ่ม/ลบ = โครง packet เปลี่ยน → ต้อง bump version */
const EXPECT_MONTH_DERIVED = 11; // 31 พ.ค. · +ธาตุรวม/ราก/透干/用神/病藥 (AI sifu: กัน金=0 ฟันธงข้างเดียว)

console.log("[#3 · packet version/field drift guard]");
const verHits = (SRC.match(new RegExp(`packetVersion:\\s*"${EXPECT_VERSION}"`, "g")) || []).length;
ck(`packetVersion ตรึง = "${EXPECT_VERSION}" (type + runtime · พบ ${verHits} จุด)`, verHits >= 2, "พบ " + verHits + " จุด");
ck(`packetLevel ตรึง = "${EXPECT_LEVEL}"`, new RegExp(`packetLevel:\\s*"${EXPECT_LEVEL}"`).test(SRC), "");

const mdLine = SRC.split("\n").find((l) => l.includes("const MONTH_DERIVED_FIELDS"));
const mdCount = mdLine ? (mdLine.match(/"/g) || []).length / 2 : -1;
ck(`MONTH_DERIVED_FIELDS = ${EXPECT_MONTH_DERIVED} รายการ (เพิ่ม field เดือน = ต้อง bump version + แก้ test นี้)`, mdCount === EXPECT_MONTH_DERIVED, "นับได้ " + mdCount);

console.log(`\n[packet-version-pin] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
