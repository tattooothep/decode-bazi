/**
 * recompute-profiles-yongshen.mjs · 10 มิ.ย. 2026 · แผน A1/A2
 * Batch recompute profile cached columns หลัง deploy r268 (wrapper-6 用神ใหม่)
 *
 * เขียน column เดียวกับ profile PUT (src/app/api/profile/[id]/route.ts):
 *   day_master_strength = calc.strength.level
 *   yongshen            = { top3: calc.yongshen, climate: calc.climate }
 *   bazi_pillars        = { pillars, ge_ju, day_boundary }
 * sanity: day_master ต้องเท่าเดิม (Layer 0-1 ไม่ถูกแตะ) · ถ้าต่าง = SKIP + ERROR
 *
 * ใช้: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/recompute-profiles-yongshen.mjs           (dry-run)
 *      node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/recompute-profiles-yongshen.mjs --write  (เขียนจริง)
 */
import { calcBazi } from "../src/lib/bazi-calc.ts";
import pg from "pg";
import fs from "node:fs";

const WRITE = process.argv.includes("--write");

/* อ่าน PG creds จาก .env.local (แบบเดียวกับ src/lib/db.ts) */
const envFile = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const pool = new pg.Pool({
  host: env.PGHOST || "127.0.0.1",
  port: Number(env.PGPORT || 5433),
  database: env.PGDATABASE || "decode_db",
  user: env.PGUSER || "postgres",
  password: env.PGPASSWORD,
});

/* birth_datetime → string เวลาไทย (แบบเดียวกับ profile PUT บรรทัด 40) */
const rows = (await pool.query(
  `SELECT id, name, day_master, day_master_strength, yongshen,
          to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS') AS bdt,
          birth_lng, birth_time_known, day_boundary
     FROM profiles ORDER BY created_at`
)).rows;

console.log(`profiles: ${rows.length} · mode: ${WRITE ? "WRITE" : "DRY-RUN"}\n`);
let changed = 0, same = 0, errors = 0;

for (const r of rows) {
  try {
    const date = r.bdt.slice(0, 10);
    const time = r.bdt.slice(11, 16);
    const lng = Number(r.birth_lng) || 100.5018;
    const known = r.birth_time_known !== false;
    /* day_boundary default ตรง PUT บรรทัด 125: NULL → "23:00" (ห้ามใช้ ||"00:00") */
    const dayBoundary = r.day_boundary === "00:00" ? "00:00" : "23:00";
    const calc = known
      ? await calcBazi({ date, time, longitude: lng,
          gmtOffsetHours: 7, dayBoundary, birthTimeKnown: true })
      : await calcBazi({ date, longitude: lng, gmtOffsetHours: 7, birthTimeKnown: false });

    /* sanity: เสา/日主 ต้องไม่เปลี่ยน */
    if (r.day_master && calc.dayMaster !== r.day_master) {
      console.log(`🛑 ${r.name}: day_master เปลี่ยน ${r.day_master}→${calc.dayMaster} — SKIP (ตรวจด่วน!)`);
      errors++; continue;
    }

    const oldY = (r.yongshen?.top3 || []).slice(0, 3).map((y) => y.element).join("·") || "-";
    const newY = (calc.yongshen || []).slice(0, 3).map((y) => y.element).join("·");
    const oldS = r.day_master_strength || "-";
    const newS = calc.strength.level;
    const diff = oldY !== newY || oldS !== newS;

    if (diff) {
      changed++;
      console.log(`${WRITE ? "✍️" : "Δ"} ${r.name} (${calc.dayMaster}): 用神 ${oldY} → ${newY} · str ${oldS} → ${newS} · 格局 ${calc.geJu.structure}`);
      if (WRITE) {
        await pool.query(
          `UPDATE profiles SET day_master=$1, day_master_strength=$2, yongshen=$3, bazi_pillars=$4, updated_at=now() WHERE id=$5`,
          [calc.dayMaster, newS,
           JSON.stringify({ top3: calc.yongshen, climate: calc.climate }),
           JSON.stringify({ pillars: calc.pillars, ge_ju: calc.geJu.structure, day_boundary: dayBoundary }),
           r.id]
        );
      }
    } else same++;
  } catch (e) {
    errors++;
    console.log(`🛑 ${r.name}: ${e.message} — SKIP`);
  }
}

console.log(`\nสรุป: เปลี่ยน ${changed} · เท่าเดิม ${same} · error ${errors} / ${rows.length}`);
if (!WRITE && changed) console.log("→ รันจริง: เพิ่ม --write");
await pool.end();
