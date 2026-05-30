/**
 * เคส "เกิดวันคาบ節氣 + ไม่รู้เวลา (3 เสา)" — import helper ตัวจริง (ไม่ลอก logic)
 * รัน: node --experimental-strip-types scripts/test-border-case-3pillar.mts
 * (Codex รอบ 52: ต้อง import src/lib/bazi-boundary.ts จริง เพื่อจับ drift/compile พัง)
 * พิสูจน์: na 5/5/1996 (立夏) → เสาเดือนก้ำกึ่ง 壬辰/癸巳 · วันปกติ → ไม่เตือน · 立春 → เสาปีก้ำกึ่ง
 */
import { monthPillarBoundary, yearPillarBoundary, boundaryWarning3p } from "../src/lib/bazi-boundary.ts";

let pass = 0, fail = 0;
function check(label: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label} · got: ${String(got)}`); }
}

console.log("[border-case 3 เสา · เกิดวันคาบ節氣 · helper จริง]");

// 1) na 5/5/1996 立夏 13:26 → เสาเดือนก้ำกึ่ง 壬辰(ก่อน)/癸巳(หลัง)
const na = monthPillarBoundary("1996-05-05");
check("na 1996-05-05 boundary=true", na.boundary === true, JSON.stringify(na));
check("na termName=立夏", na.termName === "立夏", na.termName);
check("na before=壬辰", na.before === "壬辰", na.before);
check("na after=癸巳",  na.after === "癸巳", na.after);
check("na jieqiIctApprox=1996-05-05 12:26", na.jieqiIctApprox === "1996-05-05 12:26", na.jieqiIctApprox);
const naWarn = boundaryWarning3p("1996-05-05");
check("na warning มี 壬辰+癸巳", /壬辰/.test(naWarn) && /癸巳/.test(naWarn), naWarn);

// 2) วันปกติกลางเดือน → ไม่เตือน
check("1996-05-15 boundary=false", monthPillarBoundary("1996-05-15").boundary === false, JSON.stringify(monthPillarBoundary("1996-05-15")));
check('1996-05-15 warning=""', boundaryWarning3p("1996-05-15") === "", `"${boundaryWarning3p("1996-05-15")}"`);

// 3) Aeaw 1984-12-31 冬至(中氣 ไม่ใช่ 節) → ไม่ก้ำกึ่งเสาเดือน
check("Aeaw 1984-12-31 month boundary=false", monthPillarBoundary("1984-12-31").boundary === false, JSON.stringify(monthPillarBoundary("1984-12-31")));

// 4) timezone edge (Codex รอบ 52): 立春 2013 = BJT 2013-02-04 00:13 = ICT 2013-02-03 23:13
//    คนเกิดวันไทย 2013-02-03 (ไม่รู้เวลา) → อาจหลัง立春 → ต้องเตือนเสาปีก้ำกึ่ง 壬辰/癸巳
const yb = yearPillarBoundary("2013-02-03");
check("2013-02-03 year boundary=true (ICT window)", yb.boundary === true, JSON.stringify(yb));
check("2013-02-03 termName=立春", yb.termName === "立春", yb.termName);
check("2013-02-03 before=壬辰", yb.before === "壬辰", yb.before);
check("2013-02-03 after=癸巳", yb.after === "癸巳", yb.after);
check("2013-02-03 jieqiIctApprox=2013-02-03 23:13", yb.jieqiIctApprox === "2013-02-03 23:13", yb.jieqiIctApprox);
//    วันไทย 2013-02-04 ทั้งวันผ่าน立春แล้ว (ICT) → ไม่ก้ำกึ่ง
check("2013-02-04 year boundary=false", yearPillarBoundary("2013-02-04").boundary === false, JSON.stringify(yearPillarBoundary("2013-02-04")));

// 5) edge: input มี error/รูปแบบเพี้ยน → ไม่ throw · คืน false/""
check("garbage date → boundary=false", monthPillarBoundary("not-a-date").boundary === false, JSON.stringify(monthPillarBoundary("not-a-date")));
check('garbage date → warning=""', boundaryWarning3p("not-a-date") === "", `"${boundaryWarning3p("not-a-date")}"`);

console.log(`\n[border-case] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
