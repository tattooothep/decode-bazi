#!/usr/bin/env node
/**
 * sync-qimen-engine-r368.mjs — ถ่ายข้อมูล r368 จาก Postgres → SQLite ของ engine :4090
 *   (/root/qimen-api/data/qimen.sqlite · engine อ่าน stored_formations ต่อ request จากตารางนี้)
 *
 * ทำ 3 อย่าง (additive + idempotent):
 *  1. dict: ลบ SAN_ZHA_ZHEN orphan (ตรวจ usage=0 ก่อน) + upsert 13 格ใหม่จาก Postgres
 *     (SQLite dict ไม่มีคอลัมน์ description_zh → เก็บ ZH ไว้ใน source_note)
 *  2. chart_formations: ลบแถว seed phase_b_r368 เดิม (json_extract) แล้ว insert 2,584 แถวจาก Postgres
 *  3. qimen_charts: แก้ 3+1 คอลัมน์สรุป (chief_star_code / zhi_shi_door_code / zhi_shi_palace_id
 *     / zhi_shi_palace_zh) ให้ตรงค่าที่ validate แล้วใน Postgres — เป็น legacy fallback
 *     (runtime ปกติ engine ใช้ deriveCtextFuShi คำนวณสดอยู่แล้ว ค่าตรงกัน 10/10 จากการเทียบรอบ Task A)
 *     ตรวจ pillar_zh+dun_type+ju_number ตรงกันทั้งสองฐานก่อนแก้ทุกแถว — ไม่ตรง = SKIP+log
 *
 * ใช้: node scripts/sync-qimen-engine-r368.mjs [--dry-run]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import pg from "pg";

const require2 = createRequire("/root/qimen-api/server.js");
const Database = require2("better-sqlite3");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const DRY = process.argv.includes("--dry-run");
const SEED = "phase_b_r368";
const PALACE_ZH = { 1: "坎一宮", 2: "坤二宮", 3: "震三宮", 4: "巽四宮", 5: "中五宮", 6: "乾六宮", 7: "兌七宮", 8: "艮八宮", 9: "離九宮" };

const pool = new pg.Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER || "decode_user",
  password: process.env.PGPASSWORD,
  max: 2,
});
const db = new Database("/root/qimen-api/data/qimen.sqlite");
db.pragma("busy_timeout = 10000");

async function main() {
  /* ── ดึงข้อมูลต้นทางจาก Postgres ── */
  const { rows: dict } = await pool.query(`
    SELECT formation_code, name_zh, name_pinyin, name_th, name_en, scope, base_quality,
           description_th, description_en, description_zh
    FROM ref_qimen_formations_dict
    WHERE formation_code IN ('SAN_QI_DE_SHI','LIU_YI_JI_XING','SAN_QI_RU_MU','YU_NU_SHOU_MEN',
      'QING_LONG_TAO_ZOU','BAI_HU_CHANG_KUANG','ZHU_QUE_TOU_JIANG','TENG_SHE_YAO_JIAO',
      'TAI_BAI_RU_YING','YING_RU_TAI_BAI','DA_GE','XIAO_GE','XING_GE') ORDER BY formation_code`);
  const { rows: forms } = await pool.query(`
    SELECT chart_id, scope, scope_ref, formation_code, evidence
    FROM ref_qimen_chart_formations WHERE evidence->>'seed_version'=$1 ORDER BY id`, [SEED]);
  const { rows: charts } = await pool.query(`
    SELECT id, pillar_zh, dun_type, ju_number, chief_star_code, zhi_shi_door_code, zhi_shi_palace_id
    FROM ref_qimen_charts ORDER BY id`);
  if (dict.length !== 13) throw new Error(`dict จาก Postgres ได้ ${dict.length} != 13`);
  if (forms.length !== 2584) throw new Error(`formations จาก Postgres ได้ ${forms.length} != 2584`);
  console.log(`ต้นทาง Postgres: dict=${dict.length} formations=${forms.length} charts=${charts.length}`);

  /* ── ตรวจ identity ผังตรงกันสองฐาน ── */
  const sqCharts = new Map(db.prepare("SELECT id, pillar_zh, dun_type, ju_number FROM qimen_charts").all().map((r) => [r.id, r]));
  const mismatch = charts.filter((c) => {
    const s = sqCharts.get(c.id);
    return !s || s.pillar_zh !== c.pillar_zh || s.dun_type !== c.dun_type || Number(s.ju_number) !== Number(c.ju_number);
  });
  if (mismatch.length > 0) throw new Error(`identity ไม่ตรง ${mismatch.length} แถว เช่น id=${mismatch[0].id} — หยุด`);
  console.log("identity ผัง 1,080 ใบตรงกันทั้งสองฐาน ✓");

  const zhenUsage = db.prepare("SELECT count(*) n FROM qimen_chart_formations WHERE formation_code='SAN_ZHA_ZHEN'").get().n;
  if (zhenUsage !== 0) throw new Error(`SQLite SAN_ZHA_ZHEN usage=${zhenUsage} ไม่ใช่ 0`);

  const chartsToFix = charts.filter((c) => {
    const s = db.prepare("SELECT chief_star_code, zhi_shi_door_code, zhi_shi_palace_id FROM qimen_charts WHERE id=?").get(c.id);
    return s.chief_star_code !== c.chief_star_code || s.zhi_shi_door_code !== c.zhi_shi_door_code || Number(s.zhi_shi_palace_id) !== Number(c.zhi_shi_palace_id);
  });
  const oldSeedRows = db.prepare("SELECT count(*) n FROM qimen_chart_formations WHERE json_extract(evidence,'$.seed_version')=?").get(SEED).n;
  console.log(`จะทำ: dict -SAN_ZHA_ZHEN +13 upsert · formations ลบ seed เดิม ${oldSeedRows} → insert ${forms.length} · แก้สรุป ${chartsToFix.length} ผัง`);
  if (DRY) { console.log("[dry-run] ไม่เขียน"); return; }

  const tx = db.transaction(() => {
    /* 1. dict */
    db.prepare("DELETE FROM qimen_formations_dict WHERE formation_code='SAN_ZHA_ZHEN'").run();
    const upsert = db.prepare(`
      INSERT INTO qimen_formations_dict
        (formation_code, name_zh, name_pinyin, name_th, name_en, scope, base_quality,
         description_th, description_en, source_note)
      VALUES (@formation_code, @name_zh, @name_pinyin, @name_th, @name_en, @scope, @base_quality,
              @description_th, @description_en, @source_note)
      ON CONFLICT(formation_code) DO UPDATE SET
        name_zh=excluded.name_zh, name_pinyin=excluded.name_pinyin, name_th=excluded.name_th,
        name_en=excluded.name_en, scope=excluded.scope, base_quality=excluded.base_quality,
        description_th=excluded.description_th, description_en=excluded.description_en,
        source_note=excluded.source_note`);
    for (const d of dict) upsert.run({ ...d, source_note: d.description_zh });
    /* 2. chart_formations (idempotent by seed) */
    db.prepare("DELETE FROM qimen_chart_formations WHERE json_extract(evidence,'$.seed_version')=?").run(SEED);
    const ins = db.prepare(
      "INSERT INTO qimen_chart_formations (chart_id, scope, scope_ref, formation_code, evidence) VALUES (?,?,?,?,?)");
    for (const f of forms) ins.run(f.chart_id, f.scope, f.scope_ref, f.formation_code, JSON.stringify(f.evidence));
    /* 3. summary columns */
    const upd = db.prepare(`
      UPDATE qimen_charts SET chief_star_code=?, zhi_shi_door_code=?, zhi_shi_palace_id=?,
        zhi_shi_palace_zh=?, updated_at=datetime('now') WHERE id=?`);
    for (const c of chartsToFix) {
      upd.run(c.chief_star_code, c.zhi_shi_door_code, Number(c.zhi_shi_palace_id), PALACE_ZH[c.zhi_shi_palace_id], c.id);
    }
  });
  tx();
  const after = db.prepare("SELECT count(*) n FROM qimen_chart_formations").get().n;
  const dictN = db.prepare("SELECT count(*) n FROM qimen_formations_dict").get().n;
  console.log(`COMMIT: SQLite formations=${after} (เดิม 3276 + ${forms.length}) · dict=${dictN} · แก้สรุป ${chartsToFix.length} ผัง`);
}
main().then(() => { db.close(); return pool.end(); }).catch((e) => { console.error("FAIL:", e.message); db.close(); pool.end(); process.exit(1); });
