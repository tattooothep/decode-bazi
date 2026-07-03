#!/usr/bin/env node
/**
 * fix-qimen-summary-r368.mjs — แก้ 3 คอลัมน์สรุปใน ref_qimen_charts (1,080 แถว)
 *   - chief_star_code   : ดาว 值符 ประจำรอบสิบวัน (旬) = ดาวประจำวังที่儀หัวรอบ (旬首六儀) นั่งในผังดิน · คงที่ทั้ง旬
 *   - zhi_shi_door_code : ประตู 值使 = ประตูประจำวังหัวรอบ · คงที่ทั้ง旬
 *   - zhi_shi_palace_id : วังที่ประตู 值使 ลอยไปอยู่ ณ ชั่วยามนั้น (值使隨時支)
 *
 * ที่มา (คัมภีร์ 煙波釣叟歌 ใน 奇門遁甲統宗 data/library/qmdj/qimen-tongzong-clean.md:54):
 *   「六仪击刑为大凶，甲子值符愁向东」— 值符 ผูกกับ旬 (甲子旬 yang ju1 → 戊 วัง1 → 天蓬)
 * วิธีหา 值使宮: จับคู่จากชั้นประตูใน raw_data ของ ref_qimen_chart_palaces
 *   (วังที่ door_code == ประตู值使, ไม่นับวัง 5 เพราะประตูวังกลางเป็นค่า fill ซ้ำ)
 * ตรวจไขว้ (cross-validate) ทุกแถวก่อนแก้:
 *   (a) ดาวที่ลอยมาอยู่วัง 值符 (zhi_fu_palace_id เดิมซึ่งถูกอยู่แล้ว) ต้อง == ดาว值符
 *       ยกเว้นกรณี 天禽 (旬首儀อยู่วังกลาง) → ดาวที่วัง值符 = 天芮 (禽寄芮 寄坤二宮)
 *   (b) heaven_stems_all ที่วัง值符 ต้องมี 旬首六儀 (值符พา儀หัวรอบไปด้วย)
 *   (c) 值使 walk (เดินตามลำดับวัง 1-9 นับรวมวัง 5, yang เดินหน้า / yin ถอยหลัง,
 *       ตกวัง 5 → 寄坤二宮) ต้องตรงกับผลจับคู่ประตู
 *   แถวไหน validate ไม่ผ่าน → SKIP + log (ไม่เดา)
 *
 * Idempotent: คำนวณใหม่จาก raw_data ทุกครั้ง รันซ้ำได้ค่าเดิม
 * ใช้: node scripts/fix-qimen-summary-r368.mjs [--dry-run]
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

const pool = new pg.Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER || "decode_user",
  password: process.env.PGPASSWORD,
  max: 4,
});

/* ดาว/ประตูประจำวัง (ผังต้น 洛書) */
const STAR_OF_PALACE = {
  1: "TIAN_PENG", 2: "TIAN_RUI", 3: "TIAN_CHONG", 4: "TIAN_FU", 5: "TIAN_QIN",
  6: "TIAN_XIN", 7: "TIAN_ZHU", 8: "TIAN_REN", 9: "TIAN_YING",
};
const DOOR_OF_PALACE = {
  1: "XIU_MEN", 2: "SI_MEN", 3: "SHANG_MEN", 4: "DU_MEN",
  5: "SI_MEN", /* 旬首อยู่วังกลาง → 寄坤二宮 ใช้ 死門 (ยืนยันกับ raw_data chart 41/42) */
  6: "KAI_MEN", 7: "JING_FEAR_MEN", 8: "SHENG_MEN", 9: "JING_VIEW_MEN",
};
/* ลำดับ 60 甲子 เพื่อหา offset ในรอบ旬 */
const STEMS = "甲乙丙丁戊己庚辛壬癸";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
function jiaziIndex(pz) {
  const s = STEMS.indexOf(pz[0]);
  const b = BRANCHES.indexOf(pz[1]);
  for (let i = 0; i < 60; i++) if (i % 10 === s && i % 12 === b) return i;
  throw new Error(`bad pillar ${pz}`);
}

async function main() {
  const { rows: charts } = await pool.query(`
    SELECT id, dun_type, ju_number, pillar_zh,
           raw_data->>'dun_gan_code' AS dun_gan_code,
           raw_data->>'xun_hour_zh'  AS xun_hour_zh,
           chief_star_code, zhi_fu_palace_id, zhi_shi_door_code, zhi_shi_palace_id
    FROM ref_qimen_charts ORDER BY id`);
  const { rows: palRows } = await pool.query(`
    SELECT chart_id, palace_id,
           raw_data->>'star_code' AS star_code,
           raw_data->>'door_code' AS door_code,
           raw_data->>'earth_stem_code' AS earth_stem_code,
           raw_data->>'heaven_stems_all' AS heaven_stems_all,
           raw_data->>'earth_stems_all'  AS earth_stems_all
    FROM ref_qimen_chart_palaces ORDER BY chart_id, palace_id`);
  const palByChart = new Map();
  for (const p of palRows) {
    if (!palByChart.has(p.chart_id)) palByChart.set(p.chart_id, []);
    palByChart.get(p.chart_id).push({
      ...p,
      hsa: JSON.parse(p.heaven_stems_all || "[]"),
      esa: JSON.parse(p.earth_stems_all || "[]"),
    });
  }

  const updates = [];
  const skipped = [];
  for (const c of charts) {
    const pals = palByChart.get(c.id) || [];
    const fail = (why) => skipped.push({ id: c.id, pillar: c.pillar_zh, why });
    if (pals.length !== 9) { fail(`palaces=${pals.length}`); continue; }
    const byId = Object.fromEntries(pals.map((p) => [p.palace_id, p]));
    const dg = c.dun_gan_code;
    if (!dg) { fail("no dun_gan_code"); continue; }

    /* (1) หาวังหัวรอบ P0 = วังผังดินของ 旬首六儀 (วัง 5 มาก่อน เพราะ儀วังกลางถูก寄ซ้ำในวัง 2/8) */
    let p0 = null;
    if (byId[5]?.esa.includes(dg)) p0 = 5;
    else {
      const hits = pals.filter((p) => p.palace_id !== 5 && p.earth_stem_code === dg);
      if (hits.length !== 1) { fail(`earth ${dg} hits=${hits.length}`); continue; }
      p0 = hits[0].palace_id;
    }
    const chief = STAR_OF_PALACE[p0];
    const zsDoor = DOOR_OF_PALACE[p0];

    /* (2) 值使宮 = วังที่ประตู值使อยู่ในชั้นประตู raw_data (ไม่นับวัง 5) */
    const doorHits = pals.filter((p) => p.palace_id !== 5 && p.door_code === zsDoor);
    if (doorHits.length !== 1) { fail(`door ${zsDoor} hits=${doorHits.length}`); continue; }
    const zsPalace = doorHits[0].palace_id;

    /* (3) ตรวจไขว้ a: ดาวที่วัง值符 */
    const zfPal = byId[c.zhi_fu_palace_id];
    if (!zfPal) { fail(`no zhi_fu palace ${c.zhi_fu_palace_id}`); continue; }
    const starOk = c.zhi_fu_palace_id === 5
      ? zfPal.star_code === "TIAN_QIN"
      : (zfPal.star_code === chief || (chief === "TIAN_QIN" && zfPal.star_code === "TIAN_RUI"));
    if (!starOk) { fail(`star@zhifu=${zfPal.star_code} chief=${chief}`); continue; }
    /* ตรวจไขว้ b: 值符พา旬首儀 */
    if (c.zhi_fu_palace_id !== 5 && !zfPal.hsa.includes(dg)) { fail(`hsa@zhifu missing ${dg}`); continue; }
    /* ตรวจไขว้ c: 值使 walk (นับรวมวัง 5 · ตกวัง 5 → 寄2) */
    const off = (jiaziIndex(c.pillar_zh) - jiaziIndex(c.xun_hour_zh) + 60) % 60;
    if (off > 9) { fail(`offset ${off} > 9`); continue; }
    const dir = c.dun_type === "yang" ? 1 : -1;
    let walk = ((p0 - 1 + dir * off) % 9 + 9) % 9 + 1;
    if (walk === 5) walk = 2; /* 寄坤二宮 (ยืนยันกับ chart 5: 休門ไปวัง 2) */
    if (walk !== zsPalace) { fail(`walk=${walk} doorMatch=${zsPalace}`); continue; }

    if (c.chief_star_code !== chief || c.zhi_shi_door_code !== zsDoor || Number(c.zhi_shi_palace_id) !== zsPalace) {
      updates.push({ id: c.id, chief, zsDoor, zsPalace });
    }
  }

  console.log(`charts=${charts.length} validated-need-update=${updates.length} already-ok=${charts.length - updates.length - skipped.length} skipped=${skipped.length}`);
  for (const s of skipped) console.log(`SKIP id=${s.id} ${s.pillar}: ${s.why}`);
  if (skipped.length > 0) console.log("⚠ มีแถว validate ไม่ผ่าน — ไม่แตะแถวเหล่านั้น");
  if (DRY) { console.log("[dry-run] ไม่เขียน DB"); await pool.end(); return; }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let n = 0;
    for (const u of updates) {
      const r = await client.query(
        `UPDATE ref_qimen_charts
         SET chief_star_code=$2, zhi_shi_door_code=$3, zhi_shi_palace_id=$4, updated_at=now()
         WHERE id=$1`,
        [u.id, u.chief, u.zsDoor, u.zsPalace]);
      n += r.rowCount;
    }
    if (skipped.length === 0 && n + (charts.length - updates.length - skipped.length) !== 1080) {
      throw new Error(`count check fail: updated=${n}`);
    }
    await client.query("COMMIT");
    console.log(`COMMIT: updated ${n} rows`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("ROLLBACK:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
