#!/usr/bin/env node
/**
 * seed-qimen-formations-r368.mjs — เติม格 (formations) คลาสสิกแบบ additive · seed_version=phase_b_r368
 *
 * แหล่งคัมภีร์ (verbatim ใน data/library/qmdj/):
 *  [T53]  qimen-tongzong-clean.md:53  「身残毁兮，乙遇辛而龙逃走；财虚耗兮，辛遇乙而虎猖狂。癸见丁，腾蛇妖矫；丁见癸，朱雀投江。
 *                                      …大格庚临六癸，刑格庚临六己。…三奇得使众善皆臻，六仪击刑百凶俱集。」
 *  [T54]  qimen-tongzong-clean.md:54  「六庚加丙白入荧，六丙加庚荧入白。白入荧兮贼即来，荧入白兮贼欲隔。
 *                                      庚加癸兮为大格，加己为刑大不宜。加壬之时为小格。
 *                                      六癸加丁腾蛇矫，六丁加癸雀入水。六辛加乙虎猖狂，六乙加辛龙逃走。
 *                                      六仪击刑为大凶，甲子值符愁向东。戌刑在未申在寅，寅巳辰辰午刑午。
 *                                      三奇入墓可推详…更嫌六乙来临二，丙丁临六亦如之。」
 *  [T99]  qimen-tongzong-clean.md:99  「三奇得使 乙奇加甲午甲戌 丙奇加甲子甲申 丁奇加甲寅甲辰」
 *  [Y40]  dunjia-yanyi-juan2.md:40    「玉女守門者謂丁為玉女而會天乙直使之門也」
 *  [Y44]  dunjia-yanyi-juan2.md:44    「乙為使者乙竒加甲戌甲午 丙為使者丙竒加甲子甲申也 丁為使者丁竒加甲辰甲寅也此時最吉
 *                                      但乙竒加甲午辛乃青龍逃走 丙竒加甲申庚上乃熒入太白 丁竒加甲寅癸乃朱雀投江 凡此三者尚有微疵」
 *  [Y184] dunjia-yanyi-juan2.md:184   「王璋曰三竒墓者謂六乙日竒下臨二宫 六丙月竒到六宫 六丁星竒下臨八宫 是謂三竒入墓也」
 *  [Y189] dunjia-yanyi-juan2.md:189   「王璋曰甲子直符加三宫 甲戌直符加二宫 甲申直符加八宫 甲午直符加九宫
 *                                      甲辰直符臨四宫 甲寅直符臨四宫 已上皆為六儀擊刑」(葛洪曰六儀擊刑者謂六甲直符加所刑之地也)
 *
 * ทำไม่ได้เพราะขาดข้อมูล (ผัง 1,080 ใบผูกกับ 局+時辰 ไม่มีเสาวัน):
 *  - 五不遇時 [T54]「时干来克日干上」ต้องใช้ 日干
 *  - 伏干格   [T53]「庚临日干伏干格」ต้องใช้ 日干
 *  - 飛干格   [T53]「日干临庚飞干格」ต้องใช้ 日干
 *
 * Idempotent: ลบแถว seed_version=phase_b_r368 ก่อน insert ทุกครั้ง · ไม่แตะแถว phase_a เดิม
 * ใช้: node scripts/seed-qimen-formations-r368.mjs [--dry-run]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const DRY = process.argv.includes("--dry-run");
const SEED = "phase_b_r368";

const pool = new pg.Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER || "decode_user",
  password: process.env.PGPASSWORD,
  max: 4,
});

/* ── พจนานุกรม 13 格ใหม่ (3 ภาษาบังคับ) ── */
const DICT = [
  ["SAN_QI_DE_SHI", "三奇得使", "San Qi De Shi", "สามสิ่งวิเศษได้ผู้ใช้", "Three Nobles Obtain Envoy", "auspicious",
   "奇เหนือ儀คู่มงคล: 乙加甲午/甲戌 · 丙加甲子/甲申 · 丁加甲辰/甲寅 — งานทุกด้านหนุน (统宗:53「三奇得使众善皆臻」·统宗:99·演義:44)",
   "Heaven noble stem over its envoy yi-stem pair (Yi over Xin/Ji, Bing over Wu/Geng, Ding over Ren/Gui). All undertakings supported (Tongzong:53,99; Yanyi:44)",
   "三奇得使众善皆臻。乙奇加甲午甲戌、丙奇加甲子甲申、丁奇加甲寅甲辰(统宗:53/99·演義:44)"],
  ["LIU_YI_JI_XING", "六儀擊刑", "Liu Yi Ji Xing", "หกอี๋ถูกทัณฑ์", "Six Yi Strike Punishment", "severe",
   "值符ของรอบสิบวันบินไปวังที่กิ่งถูกทัณฑ์: 甲子→วัง3 甲戌→วัง2 甲申→วัง8 甲午→วัง9 甲辰/甲寅→วัง4 — ร้ายแรง ห้ามใช้การ (统宗:54「六仪击刑为大凶」·演義:189 王璋)",
   "The xun's duty-chief yi-stem lands on its punishment palace (Jiazi→3, Jiaxu→2, Jiashen→8, Jiawu→9, Jiachen/Jiayin→4). Gravely inauspicious (Tongzong:54; Yanyi:189)",
   "六仪击刑为大凶：甲子直符加三宫、甲戌加二宫、甲申加八宫、甲午加九宫、甲辰甲寅临四宫(统宗:54·演義:189王璋)"],
  ["SAN_QI_RU_MU", "三奇入墓", "San Qi Ru Mu", "สามสิ่งวิเศษเข้าสุสาน", "Three Nobles Enter Tomb", "inauspicious",
   "奇ตกวังสุสานธาตุ: 乙→วัง2(未) · 丙→วัง6(戌) · 丁→วัง6(统宗:54)/วัง8(丑·演義:184 王璋) — พลังอ่อน งานไม่เดิน (统宗:54「三奇入墓可推详…更嫌六乙来临二，丙丁临六亦如之」)",
   "Noble stem falls into its tomb palace: Yi→2 (Wei), Bing→6 (Xu), Ding→6 (Tongzong:54) / 8 (Chou, Yanyi:184). Weakened, affairs stall",
   "三奇入墓：六乙临二宫、丙丁临六宫(统宗:54)；王璋曰六丁下临八宫亦是(演義:184)"],
  ["YU_NU_SHOU_MEN", "玉女守門", "Yu Nu Shou Men", "นางแก้วเฝ้าประตู", "Jade Maiden Guards Gate", "auspicious",
   "丁奇ลอยมาอยู่วังเดียวกับประตู值使 — เด่นเรื่องเจรจา สมานฉันท์ งานลับ (演義:40「玉女守門者謂丁為玉女而會天乙直使之門也」·统宗:54「凡作阴私和合事，请君但向此中推」)",
   "Heaven Ding arrives at the duty-door (Zhi Shi) palace. Excellent for negotiation, harmony, discreet matters (Yanyi:40; Tongzong:54)",
   "玉女守門：謂丁為玉女而會天乙直使之門也(演義:40)。凡作阴私和合事，请君但向此中推(统宗:54)"],
  ["QING_LONG_TAO_ZOU", "青龍逃走", "Qing Long Tao Zou", "มังกรเขียวหลบหนี", "Azure Dragon Flees", "inauspicious",
   "乙เหนือ辛 — เสียหายเสื่อมถอย คนหนี ของหาย (统宗:53「身残毁兮，乙遇辛而龙逃走」·统宗:54「六乙加辛龙逃走」·演義:114)",
   "Heaven Yi over earth Xin. Loss, escape, damage (Tongzong:53-54; Yanyi:114)",
   "六乙加辛龙逃走，身残毁(统宗:53/54·演義:114)"],
  ["BAI_HU_CHANG_KUANG", "白虎猖狂", "Bai Hu Chang Kuang", "เสือขาวคลุ้มคลั่ง", "White Tiger Rampages", "inauspicious",
   "辛เหนือ乙 — ทรัพย์รั่วไหล ทั้งเจ้าบ้านและแขกเสีย แต่งงาน/ก่อสร้างร้ายมาก (统宗:53「财虚耗兮，辛遇乙而虎猖狂」·统宗:54·演義:119「主客兩傷婚姻修造大凶」)",
   "Heaven Xin over earth Yi. Wealth drains, both host and guest harmed (Tongzong:53-54; Yanyi:119)",
   "六辛加乙虎猖狂，财虚耗，主客兩傷(统宗:53/54·演義:119)"],
  ["ZHU_QUE_TOU_JIANG", "朱雀投江", "Zhu Que Tou Jiang", "หงส์แดงทิ้งลงน้ำ", "Vermilion Bird Plunges into River", "inauspicious",
   "丁เหนือ癸 — เอกสารพัวพัน สูญหาย คดีความ ปากเสียง (统宗:53「丁见癸，朱雀投江」·统宗:54「六丁加癸雀入水」·演義:123「主文書牽連或失脫文書」)",
   "Heaven Ding over earth Gui. Documents entangled or lost, lawsuits, quarrels (Tongzong:53-54; Yanyi:123)",
   "六丁加癸朱雀投江，主文書牽連、口舌官事(统宗:53/54·演義:123)"],
  ["TENG_SHE_YAO_JIAO", "螣蛇夭蹻", "Teng She Yao Jiao", "งูเหินหลงทาง", "Coiling Snake Contorts", "inauspicious",
   "癸เหนือ丁 — หลงทาง ติดขัด กังวลไม่สงบ (统宗:53「癸见丁，腾蛇妖矫」·统宗:54「六癸加丁腾蛇矫」·演義:127「跃蹻迷路程憂惶難進歩」)",
   "Heaven Gui over earth Ding. Lost paths, obstruction, restless anxiety (Tongzong:53-54; Yanyi:127)",
   "六癸加丁腾蛇夭蹻，迷路程、憂惶難進歩(统宗:53/54·演義:127)"],
  ["TAI_BAI_RU_YING", "太白入熒", "Tai Bai Ru Ying", "ดาวขาวเข้าไฟ", "Venus Enters Mars", "inauspicious",
   "庚เหนือ丙 — โจร/ศัตรูกำลังเข้ามา ต้องตั้งรับ (统宗:54「六庚加丙白入荧。白入荧兮贼即来」·演義:152「天盤庚加地盤丙乃金入火鄉而受尅凶對敵宜防賊」)",
   "Heaven Geng over earth Bing. The bandit/adversary approaches; defend (Tongzong:54; Yanyi:152)",
   "六庚加丙白入荧，贼即来，對敵宜防賊(统宗:54·演義:152)"],
  ["YING_RU_TAI_BAI", "熒入太白", "Ying Ru Tai Bai", "ไฟเข้าดาวขาว", "Mars Enters Venus", "inauspicious",
   "丙เหนือ庚 — ศัตรู/โจรกำลังถอย อย่าไล่ตาม ระวังกลลวง (统宗:54「六丙加庚荧入白。荧入白兮贼欲隔」·统宗:53「火入金乡贼将去」)",
   "Heaven Bing over earth Geng. The adversary withdraws; do not pursue, beware deception (Tongzong:53-54)",
   "六丙加庚荧入白，贼欲隔/贼将去(统宗:53/54)"],
  ["DA_GE", "大格", "Da Ge", "ต้าเก๋อ ขัดใหญ่", "Great Obstruction", "inauspicious",
   "庚เหนือ癸 — ติดขัดใหญ่ เดินทาง/เริ่มงานไม่ควร (统宗:53「大格庚临六癸」·统宗:54「庚加癸兮为大格」)",
   "Heaven Geng over earth Gui. Major blockage; unwise to travel or launch (Tongzong:53-54)",
   "庚加癸兮为大格(统宗:53/54)"],
  ["XIAO_GE", "小格", "Xiao Ge", "เสี่ยวเก๋อ ขัดเล็ก", "Minor Obstruction", "inauspicious",
   "庚เหนือ壬 — ติดขัดย่อย งานสะดุด (统宗:54「加壬之时为小格」)",
   "Heaven Geng over earth Ren. Minor blockage, delays (Tongzong:54)",
   "庚加壬之时为小格(统宗:54)"],
  ["XING_GE", "刑格", "Xing Ge", "สิงเก๋อ ขัดทัณฑ์", "Punishment Obstruction", "inauspicious",
   "庚เหนือ己 — ขัดแบบทัณฑ์ คดีความ/บาดหมาง ไม่ควรทั้งสิ้น (统宗:53「刑格庚临六己」·统宗:54「加己为刑大不宜」)",
   "Heaven Geng over earth Ji. Punitive clash, litigation; highly unfavorable (Tongzong:53-54)",
   "庚临六己为刑格，大不宜(统宗:53/54)"],
];

/* ── กติกาจับ格จากชั้นสิบทิศใน raw_data ── */
/* คู่ก้านฟ้า×ก้านดิน (heaven over earth) */
const STEM_PAIR_RULES = [
  { code: "QING_LONG_TAO_ZOU", h: "YI", e: "XIN", canon: "统宗:54 六乙加辛龙逃走 · 演義:114" },
  { code: "BAI_HU_CHANG_KUANG", h: "XIN", e: "YI", canon: "统宗:54 六辛加乙虎猖狂 · 演義:119" },
  { code: "ZHU_QUE_TOU_JIANG", h: "DING", e: "GUI", canon: "统宗:54 六丁加癸雀入水 · 演義:123" },
  { code: "TENG_SHE_YAO_JIAO", h: "GUI", e: "DING", canon: "统宗:54 六癸加丁腾蛇矫 · 演義:127" },
  { code: "TAI_BAI_RU_YING", h: "GENG", e: "BING", canon: "统宗:54 六庚加丙白入荧 · 演義:152" },
  { code: "YING_RU_TAI_BAI", h: "BING", e: "GENG", canon: "统宗:54 六丙加庚荧入白" },
  { code: "DA_GE", h: "GENG", e: "GUI", canon: "统宗:54 庚加癸兮为大格 · 统宗:53 大格庚临六癸" },
  { code: "XIAO_GE", h: "GENG", e: "REN", canon: "统宗:54 加壬之时为小格" },
  { code: "XING_GE", h: "GENG", e: "JI", canon: "统宗:54 加己为刑大不宜 · 统宗:53 刑格庚临六己" },
  /* 三奇得使 [T99 乙奇加甲午(辛)甲戌(己) 丙奇加甲子(戊)甲申(庚) 丁奇加甲寅(癸)甲辰(壬)] */
  { code: "SAN_QI_DE_SHI", h: "YI", e: "JI", canon: "统宗:99 乙奇加甲戌(己) · 演義:44" },
  { code: "SAN_QI_DE_SHI", h: "YI", e: "XIN", canon: "统宗:99 乙奇加甲午(辛) · 演義:44 尚有微疵(兼青龍逃走)", flaw: true },
  { code: "SAN_QI_DE_SHI", h: "BING", e: "WU", canon: "统宗:99 丙奇加甲子(戊) · 演義:44" },
  { code: "SAN_QI_DE_SHI", h: "BING", e: "GENG", canon: "统宗:99 丙奇加甲申(庚) · 演義:44 尚有微疵(兼熒入太白)", flaw: true },
  { code: "SAN_QI_DE_SHI", h: "DING", e: "REN", canon: "统宗:99 丁奇加甲辰(壬) · 演義:44" },
  { code: "SAN_QI_DE_SHI", h: "DING", e: "GUI", canon: "统宗:99 丁奇加甲寅(癸) · 演義:44 尚有微疵(兼朱雀投江)", flaw: true },
];
/* ก้านฟ้าตกวังสุสาน [T54 + Y184] */
const RU_MU_RULES = [
  { h: "YI", palace: 2, canon: "统宗:54 更嫌六乙来临二 · 演義:184 六乙日竒下臨二宫" },
  { h: "BING", palace: 6, canon: "统宗:54 丙丁临六亦如之 · 演義:184 六丙月竒到六宫" },
  { h: "DING", palace: 6, canon: "统宗:54 丙丁临六亦如之(丁火墓戌)" },
  { h: "DING", palace: 8, canon: "演義:184 王璋曰六丁星竒下臨八宫(丁墓丑) · 煙波釣叟歌:34 丁奇临八亦同论" },
];
/* 六儀擊刑: 直符ของ旬บินไปวังทัณฑ์ [Y189 王璋] · key = 旬首六儀 */
const JI_XING_PALACE = { WU: 3, JI: 2, GENG: 8, XIN: 9, REN: 4, GUI: 4 };
const JI_XING_CANON = "演義:189 王璋曰甲子直符加三宫甲戌加二宫甲申加八宫甲午加九宫甲辰甲寅臨四宫 · 统宗:54 六仪击刑为大凶";

async function main() {
  const client = await pool.connect();
  try {
    /* ── B1: dedupe SAN_ZHA_ZHEN (ต้อง usage=0 เท่านั้น) ── */
    const { rows: [zhen] } = await client.query(
      "SELECT count(*)::int AS n FROM ref_qimen_chart_formations WHERE formation_code='SAN_ZHA_ZHEN'");
    if (zhen.n !== 0) throw new Error(`SAN_ZHA_ZHEN usage=${zhen.n} ไม่ใช่ 0 — หยุด ไม่ลบ`);
    console.log("SAN_ZHA_ZHEN usage=0 → ลบ dict orphan ได้");

    /* ── โหลดข้อมูล ── */
    const { rows: charts } = await client.query(`
      SELECT id, dun_type, ju_number, pillar_zh, zhi_shi_palace_id, zhi_shi_door_code,
             zhi_fu_palace_id, raw_data->>'dun_gan_code' AS dun_gan_code,
             raw_data->>'xun_hour_zh' AS xun_hour_zh
      FROM ref_qimen_charts ORDER BY id`);
    const { rows: palRows } = await client.query(`
      SELECT chart_id, palace_id,
             raw_data->>'heaven_stems_all' AS hsa, raw_data->>'earth_stems_all' AS esa
      FROM ref_qimen_chart_palaces ORDER BY chart_id, palace_id`);
    const palByChart = new Map();
    for (const p of palRows) {
      if (!palByChart.has(p.chart_id)) palByChart.set(p.chart_id, []);
      palByChart.get(p.chart_id).push({
        palace_id: p.palace_id,
        hsa: JSON.parse(p.hsa || "[]"),
        esa: JSON.parse(p.esa || "[]"),
      });
    }

    /* ── ตรวจจับ ── */
    const inserts = []; // {chart_id, scope, scope_ref, formation_code, evidence}
    for (const c of charts) {
      const pals = palByChart.get(c.id) || [];
      for (const p of pals) {
        if (p.palace_id === 5) continue; // วังกลางไม่มีก้านฟ้า (ก้าน寄ไปวัง 2/8 แล้ว)
        /* คู่ก้านฟ้า×ก้านดิน */
        for (const r of STEM_PAIR_RULES) {
          if (p.hsa.includes(r.h) && p.esa.includes(r.e)) {
            inserts.push({
              chart_id: c.id, scope: "palace", scope_ref: p.palace_id, formation_code: r.code,
              evidence: {
                seed_version: SEED, source: "canon_r368", palace: p.palace_id,
                heaven_stem: r.h, earth_stem: r.e, canon: r.canon, ...(r.flaw ? { flaw_note: "微疵" } : {}),
              },
            });
          }
        }
        /* 三奇入墓 */
        for (const r of RU_MU_RULES) {
          if (p.palace_id === r.palace && p.hsa.includes(r.h)) {
            inserts.push({
              chart_id: c.id, scope: "palace", scope_ref: p.palace_id, formation_code: "SAN_QI_RU_MU",
              evidence: { seed_version: SEED, source: "canon_r368", palace: p.palace_id, heaven_stem: r.h, canon: r.canon },
            });
          }
        }
        /* 玉女守門: 丁ลอยมาวังประตู值使 */
        if (p.palace_id === Number(c.zhi_shi_palace_id) && p.hsa.includes("DING")) {
          inserts.push({
            chart_id: c.id, scope: "palace", scope_ref: p.palace_id, formation_code: "YU_NU_SHOU_MEN",
            evidence: {
              seed_version: SEED, source: "canon_r368", palace: p.palace_id, heaven_stem: "DING",
              zhi_shi_door: c.zhi_shi_door_code, canon: "演義:40 玉女守門者謂丁為玉女而會天乙直使之門也 · 统宗:54",
            },
          });
        }
      }
      /* 六儀擊刑: 值符(旬首儀)ตกวังทัณฑ์ */
      const jx = JI_XING_PALACE[c.dun_gan_code];
      if (jx && Number(c.zhi_fu_palace_id) === jx) {
        inserts.push({
          chart_id: c.id, scope: "palace", scope_ref: jx, formation_code: "LIU_YI_JI_XING",
          evidence: {
            seed_version: SEED, source: "canon_r368", palace: jx, xun: c.xun_hour_zh,
            yi_stem: c.dun_gan_code, zhi_fu_palace: Number(c.zhi_fu_palace_id), canon: JI_XING_CANON,
          },
        });
      }
    }

    const byCode = {};
    for (const i of inserts) byCode[i.formation_code] = (byCode[i.formation_code] || 0) + 1;
    console.log("จะ insert รวม", inserts.length, "แถว:", byCode);
    if (DRY) { console.log("[dry-run] ไม่เขียน DB"); return; }

    await client.query("BEGIN");
    /* dict: ลบ orphan + upsert 13 ตัวใหม่ */
    await client.query("DELETE FROM ref_qimen_formations_dict WHERE formation_code='SAN_ZHA_ZHEN'");
    for (const d of DICT) {
      await client.query(`
        INSERT INTO ref_qimen_formations_dict
          (formation_code, name_zh, name_pinyin, name_th, name_en, scope, base_quality,
           description_th, description_en, description_zh)
        VALUES ($1,$2,$3,$4,$5,'palace',$6,$7,$8,$9)
        ON CONFLICT (formation_code) DO UPDATE SET
          name_zh=EXCLUDED.name_zh, name_pinyin=EXCLUDED.name_pinyin, name_th=EXCLUDED.name_th,
          name_en=EXCLUDED.name_en, scope=EXCLUDED.scope, base_quality=EXCLUDED.base_quality,
          description_th=EXCLUDED.description_th, description_en=EXCLUDED.description_en,
          description_zh=EXCLUDED.description_zh`,
        [d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8]]);
    }
    /* chart_formations: idempotent — ลบของ seed นี้ก่อน แล้ว insert ใหม่ */
    const del = await client.query(
      "DELETE FROM ref_qimen_chart_formations WHERE evidence->>'seed_version'=$1", [SEED]);
    console.log(`ลบแถว seed เดิม ${del.rowCount} แถว (idempotent)`);
    let n = 0;
    for (let i = 0; i < inserts.length; i += 500) {
      const batch = inserts.slice(i, i + 500);
      const vals = [];
      const params = [];
      batch.forEach((r, j) => {
        const o = j * 5;
        vals.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5})`);
        params.push(r.chart_id, r.scope, r.scope_ref, r.formation_code, JSON.stringify(r.evidence));
      });
      const res = await client.query(
        `INSERT INTO ref_qimen_chart_formations (chart_id, scope, scope_ref, formation_code, evidence)
         VALUES ${vals.join(",")}`, params);
      n += res.rowCount;
    }
    if (n !== inserts.length) throw new Error(`insert count mismatch ${n} != ${inserts.length}`);
    await client.query("COMMIT");
    console.log(`COMMIT: dict -1 orphan +${DICT.length} upsert · formations +${n} แถว (seed ${SEED})`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
