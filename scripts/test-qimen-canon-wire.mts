/**
 * Test · Qimen Sifu source packet wire
 * Current design is source-governed snippets with line trace, not full-book prompt stuffing.
 * Run: node --experimental-strip-types scripts/test-qimen-canon-wire.mts
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROUTE = readFileSync(new URL("../src/app/api/qimen/sifu/route.ts", import.meta.url), "utf8");
let pass = 0;
let fail = 0;

function ck(label: string, condition: boolean, guide?: string) {
  if (condition) {
    pass++;
    console.log("  ✅ " + label);
  } else {
    fail++;
    console.log("  ❌ " + label + (guide ? " · " + guide : ""));
  }
}

function has(text: string) {
  return ROUTE.includes(text);
}

console.log("[#1 wiring · source-governed snippets]");
ck("มี QMDJ_DIR", has("const QMDJ_DIR"));
ck("มี QMDJ_SNIPPETS", has("const QMDJ_SNIPPETS"));
ck("มี structured source trace item", has("type QimenSourceTraceItem"));
ck("อ่านเฉพาะบรรทัดที่กำหนด", has("function readDocLines") && has("slice(spec.start - 1, spec.end)"));
ck("มี packet cap", has("MAX_SOURCE_PACKET_CHARS"));
ck("snippet ใส่แหล่งอ้างอิง:file:start-end", has("แหล่งอ้างอิง: ${s.file}:${s.start}-${s.end}"));
ck("snippet ใส่เหตุผลเลือกแหล่งอ้างอิงเป็นไทย", has("เหตุผลเลือกแหล่งอ้างอิง: ${traceItem.reason_th}"));
ck("trace ใส่ id=file:start-end", has("trace.push(`${s.id}=${s.file}:${s.start}-${s.end}`)"));
ck("traceItems เก็บ structured source metadata", has("traceItems.push(traceItem)") && has("sourceTraceItems: QimenSourceTraceItem[]"));
ck("buildPrompt เรียก loadQimenKnowledge พร้อม message/topic/payload", has("loadQimenKnowledge({ message, topic, payload })"));
ck("response/log ส่ง qimen_source_version", has("qimen_source_version: built.knowledgeVersion"));
ck("response/log ส่ง qimen_source_trace", has("qimen_source_trace: built.sourceTrace"));
ck("response/log ส่ง qimen_source_trace_items", has("qimen_source_trace_items: built.sourceTraceItems"));
ck("ยังโหลด persona จาก qimen-sifu.md", has("loadPromptMd(\"prompts/qimen-sifu.md\""));

console.log("[#1b retrieval reasons · system-aware]");
ck("มี qimenSourceReasonTh", has("function qimenSourceReasonTh"));
ck("มี qimenSourceTraceItem", has("function qimenSourceTraceItem"));
ck("reason 年/月/日/時 เป็นไทยนำจีนรอง", has("ต้องอธิบายขอบเขต 年/月/日/時 ให้ไม่ปนกัน"));
ck("reason activity ห้ามใช้คะแนนฉีเหมินกลาง", has("ต้องใช้กฎกิจกรรม ไม่ใช้คะแนนฉีเหมินกลาง"));
ck("reason classic ยึดผังจริงจากระบบคำนวณ", has("คำตัดสินต้องยึดผังจริงจากระบบคำนวณ"));
ck("เลือก ymd snippets เมื่อ payload ไม่ใช่ hour", has("if (systemType !== \"hour\" || wantAny(text, [\"ปี\", \"เดือน\", \"วัน\""));
ck("structured trace มี title_th/source_label_th/reason_th แบบไทยนำ", has("title_th: titleTh") && has("qimenSourceTitleTh(s)") && has("source_label_th: \"ชุดความรู้ฉีเหมินสำหรับผู้ช่วยซินแส\"") && has("reason_th: qimenSourceReasonTh"));
ck("ไม่มี title user-facing ที่ขึ้นต้นอังกฤษ/จีนล้วนจากรายการเดิม", !has("title: \"คำแนะนำ UX") && !has("title: \"ฉีเหมินปี/เดือน/วัน: default lineage") && !has("title: \"BaZi overlay") && !has("title: \"統宗"));
ck("reason user-facing ไม่มีศัพท์ dev หลุด", !has("payload อยู่ในโหมด") && !has("จาก engine packet") && !has("source of truth") && !has("คะแนน/source"));

console.log("[#2 engine-first prompt contract]");
ck("ผังจริงมาก่อน source packet", has("ผังเวลา (QiMen Chart):\\n${qimenText}\\n${canonBlock}"));
ck("บอกว่าผังจากระบบเป็นหลัก", has("ข้อมูลผังจากระบบคำนวณคือหลักตัดสิน"));
ck("บอกว่าชุดแหล่งอ้างอิงไม่สร้างค่าผังใหม่", has("ชุดแหล่งอ้างอิงมีไว้แปลความหมาย ไม่ใช่สร้างค่าผังใหม่"));
ck("รายการแหล่งอ้างอิงใน prompt อธิบายเหตุผลเลือก snippet", has("${s.id} · ${s.reason_th} · ${s.file}:${s.line_range}"));
ck("มี selected palace block", has("วังที่ผู้ใช้เลือก 選宮"));
ck("กติกาวังนี้ต้องเริ่มจากวังที่เลือก", has("ให้เริ่มจากวังที่ผู้ใช้เลือกนี้ก่อน"));
ck("อธิบายทิศจากประตูดาวเทพก้านและป้ายสัญญาณ", has("ประตู + ดาว + เทพ + ก้าน + ป้ายสัญญาณจากระบบ"));

console.log("[#3 no stale full-book wiring]");
/* 7 มิ.ย. · data/library/qmdj อ้างได้เฉพาะเป็นฐานไฟล์ความรู้ไทยนำ auth-th/ (สรุป+原文)
 * ห้ามโหลดหนังสือ clean เต็มเล่ม (yanbo/tongzong/dunjia) เข้า prompt */
ck("ถ้าอ้าง data/library/qmdj ต้องเป็นฐาน auth-th ไทยนำเท่านั้น", !has("data/library/qmdj") || has("auth-th"));
ck("ไม่คาดหวัง yanbo full book", !has("yanbo-diaosou-ge.md"));
ck("ไม่คาดหวัง tongzong clean full book", !has("qimen-tongzong-clean.md"));
ck("ไม่คาดหวัง dunjia yanyi full book", !has("dunjia-yanyi-juan2.md"));

console.log("[#3b ไฟล์ความรู้ไทยนำ (repo · auth-th)]");
ck("route รองรับ flag repo", has("repo?: boolean") && has("QMDJ_REPO_DIR"));
ck("ขึ้น snippet 主客法+生剋 (host-guest-shengke)", has('id: "host-guest-shengke"') && has("auth-th/zhuke-shengke-th.md"));
const authDir = join(new URL("../data/library/qmdj/auth-th/", import.meta.url).pathname);
const zhuke = join(authDir, "zhuke-shengke-th.md");
const zhukeOk = existsSync(zhuke) && statSync(zhuke).size > 800;
ck("ไฟล์ zhuke-shengke-th.md มีจริง", zhukeOk, zhuke);
if (zhukeOk) {
  const t = readFileSync(zhuke, "utf8");
  ck("ไทยนำ: อธิบายเจ้าบ้าน–แขก", t.includes("เจ้าบ้าน") && t.includes("แขก") && (t.includes("รุก") || t.includes("รับ")));
  ck("原文 主客 ตรงคัมภีร์ (兵事分主客 verbatim ตัวย่อ)", t.includes("兵事分主客：宫为主，星门为客。客生星门利客，星门生宫利主。宫克星门利主，星门克宫利客。"));
  ck("原文 主客雌雄 ตรงคัมภีร์ (ตัวย่อ)", t.includes("主客雌雄：世为客，应为主。"));
}

console.log("[#3c 旺相休囚死 กำลังดาว (repo · auth-th)]");
ck("ขึ้น snippet star-vigor", has('id: "star-vigor"') && has("auth-th/wangxiang-vigor-th.md"));
const vigor = join(authDir, "wangxiang-vigor-th.md");
const vigorOk = existsSync(vigor) && statSync(vigor).size > 800;
ck("ไฟล์ wangxiang-vigor-th.md มีจริง", vigorOk, vigor);
if (vigorOk) {
  const v = readFileSync(vigor, "utf8");
  ck("ไทยนำ: อธิบายดาวแรง/อ่อน", v.includes("แรง") && v.includes("อ่อน") && v.includes("旺") && v.includes("廢"));
  ck("ใช้สูตรดาว 烟波 ไม่ใช้บรรทัด 402 (มีหมายเหตุ flag)", v.includes("煙波釣叟歌") || v.includes("烟波"));
  ck("原文 旺相休囚 ตรงคัมภีร์ (与我同行即为相 verbatim ตัวย่อ)", v.includes("与我同行即为相，我生之月诚为旺，"));
  ck("原文 廢休囚 ตรงคัมภีร์", v.includes("废于父母休于财，囚于鬼兮真不妄，"));
}

console.log("[#3d 守護·值符 ดาวผู้นำ (repo · auth-th)]");
ck("ขึ้น snippet zhifu-guardian", has('id: "zhifu-guardian"') && has("auth-th/zhifu-guardian-th.md"));
const zhifu = join(authDir, "zhifu-guardian-th.md");
const zhifuOk = existsSync(zhifu) && statSync(zhifu).size > 800;
ck("ไฟล์ zhifu-guardian-th.md มีจริง", zhifuOk, zhifu);
if (zhifuOk) {
  const z = readFileSync(zhifu, "utf8");
  ck("ไทยนำ: อธิบายดาวผู้นำ/ที่พึ่ง + เตือน空亡", z.includes("ผู้นำ") && (z.includes("ที่พึ่ง") || z.includes("คุ้มกัน")) && z.includes("空亡"));
  ck("原文 值符 ตรงคัมภีร์ (九宫逢甲为值符 verbatim ตัวย่อ)", z.includes("九宫逢甲为值符，八门值使自分明，"));
  ck("原文 天乙之神 ตรงคัมภีร์", z.includes("天乙之神所在宫，大将宜居击对冲，"));
}

console.log("[#3e 應期法 จับเวลา (repo · auth-th)]");
ck("ขึ้น snippet yingqi-timing", has('id: "yingqi-timing"') && has("auth-th/yingqi-timing-th.md"));
const yingqi = join(authDir, "yingqi-timing-th.md");
const yingqiOk = existsSync(yingqi) && statSync(yingqi).size > 800;
ck("ไฟล์ yingqi-timing-th.md มีจริง", yingqiOk, yingqi);
if (yingqiOk) {
  const y = readFileSync(yingqi, "utf8");
  ck("ไทยนำ: 空亡冲填 + 馬星 + 入墓 timing", y.includes("空亡") && y.includes("冲") && y.includes("馬星") && y.includes("入墓"));
  ck("原文 統宗 ตรงคัมภีร์ (奇门以克应为微妙 verbatim ตัวย่อ)", y.includes("奇门以克应为微妙。触机即发，物来顺应。"));
  ck("原文 烟波 太冲天马 ตรงคัมภีร์", y.includes("太冲天马最为贵，猝然有难宜逃避，"));
}

console.log("[#3f 格局 吉凶格 (repo · auth-th)]");
ck("ขึ้น snippet geju-formations", has('id: "geju-formations"') && has("auth-th/geju-formations-th.md"));
const geju = join(authDir, "geju-formations-th.md");
const gejuOk = existsSync(geju) && statSync(geju).size > 800;
ck("ไฟล์ geju-formations-th.md มีจริง", gejuOk, geju);
if (gejuOk) {
  const g = readFileSync(geju, "utf8");
  ck("ไทยนำ: แยก吉格/凶格 (返首·伏吟)", g.includes("吉格") && g.includes("凶格") && g.includes("龍返首") && g.includes("伏吟"));
  ck("原文 吉神 ตรงคัมภีร์ (鸟跌穴龙返首 verbatim ตัวย่อ)", g.includes("丙加甲兮鸟跌穴，甲加丙兮龙返首，只此二者是吉神，为事如意十八九，"));
  ck("原文 凶格 六儀擊刑 ตรงคัมภีร์", g.includes("六仪击刑何太凶，甲子直符愁向东，"));
  ck("原文 三遁 ตรงคัมภีร์", g.includes("生门六丙合六丁，此为天遁自分明，开门六乙合六己，地遁如斯而已矣，"));
}

console.log("[#4 source files exist]");
const qmdjDir = process.env.QIMEN_DOCS_DIR || "/var/www/hourkey/docs/Qimendunjia คัมภีร์";
const requiredFiles = [
  "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
  "คู่มืออ้างอิง — ฤกษ์ยามในวิชา Qi Men Dun Jia (奇門遁甲) ตามประเภทกิจกรรม สำหรับ datepick .md",
  "奇門遁甲統宗 (ฉีเหมินตุนเจี่ย ถ่งจง)RV1.txt",
];

for (const file of requiredFiles) {
  const path = join(qmdjDir, file);
  const ok = existsSync(path) && statSync(path).size > 1000;
  ck(`${file} exists`, ok, path);
}

console.log(`\n[qimen-canon-wire] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
