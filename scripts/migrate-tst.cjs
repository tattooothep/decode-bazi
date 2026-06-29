/**
 * Migration · re-compute pillar+yongshen+ge_ju ของ profile ทั้งหมด
 * ใช้ TST · เก็บค่าใหม่ลง DB
 *
 * Safety:
 *   - DRY RUN by default · ส่ง --apply เพื่อ commit
 *   - log ทุก row ที่จะเปลี่ยน
 */

const { Client } = require('pg');
const tyme = require('tyme4ts');

const APPLY = process.argv.includes('--apply');

function applyTST({ year, month, day, hour, minute, longitude, gmtOffsetHours = 7 }) {
  const standardMeridian = gmtOffsetHours * 15;
  const dt = new Date(Date.UTC(year, month - 1, day, hour - gmtOffsetHours, minute, 0));
  const dayOfYear = Math.floor((dt.getTime() - Date.UTC(dt.getUTCFullYear(),0,0)) / 86400000);
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const eotMin = 229.18 * (
    0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2*gamma) - 0.040849 * Math.sin(2*gamma)
  );
  const longitudeShiftMin = (longitude - standardMeridian) * 4;
  const totalShiftMin = longitudeShiftMin + eotMin;
  const totalMin = hour * 60 + minute + totalShiftMin;
  let appliedHour = Math.floor(totalMin / 60);
  let appliedMinute = Math.floor(totalMin - appliedHour * 60);
  if (appliedHour < 0) appliedHour += 24;
  if (appliedHour >= 24) appliedHour -= 24;
  if (appliedMinute < 0) appliedMinute += 60;
  return { appliedHour, appliedMinute, totalShiftMin: Math.round(totalShiftMin*10)/10 };
}

async function main() {
  const c = new Client({
    host: '127.0.0.1', port: 5433, database: 'decode_db',
    user: 'decode_user', password: process.env.PGPASSWORD,
  });
  await c.connect();

  const w3 = require('/root/decode-app/data/library/wrappers/3-ge-ju.js');
  const w6 = require('/root/decode-app/data/library/wrappers/6-strength-yongshen.js');

  const rows = (await c.query(`
    SELECT id, name, birth_datetime, birth_lng, bazi_pillars, day_master, day_master_strength
    FROM profiles
    WHERE bazi_pillars IS NOT NULL
    ORDER BY created_at DESC
  `)).rows;

  console.log(`\n${rows.length} profiles to check · APPLY=${APPLY}\n`);

  let changed = 0, kept = 0;
  for (const row of rows) {
    const bd = new Date(row.birth_datetime);
    // Force Bangkok TZ for date components
    const yy = bd.getFullYear();
    const mm = bd.getMonth() + 1;
    const dd = bd.getDate();
    const hh = bd.getHours();
    const mn = bd.getMinutes();
    const lng = parseFloat(row.birth_lng || '100.5018');

    const tst = applyTST({ year: yy, month: mm, day: dd, hour: hh, minute: mn, longitude: lng, gmtOffsetHours: 7 });
    const ec = tyme.SolarTime.fromYmdHms(yy, mm, dd, tst.appliedHour, tst.appliedMinute, 0).getLunarHour().getEightChar();
    const newPillars = {
      year:  { stem: ec.getYear().getName()[0],  branch: ec.getYear().getName()[1]  },
      month: { stem: ec.getMonth().getName()[0], branch: ec.getMonth().getName()[1] },
      day:   { stem: ec.getDay().getName()[0],   branch: ec.getDay().getName()[1]   },
      hour:  { stem: ec.getHour().getName()[0],  branch: ec.getHour().getName()[1]  },
    };
    const oldPillars = row.bazi_pillars?.pillars || {};
    const oldHourStr = `${oldPillars.hour?.stem || '?'}${oldPillars.hour?.branch || '?'}`;
    const newHourStr = `${newPillars.hour.stem}${newPillars.hour.branch}`;
    const oldDayStr  = `${oldPillars.day?.stem || '?'}${oldPillars.day?.branch || '?'}`;
    const newDayStr  = `${newPillars.day.stem}${newPillars.day.branch}`;

    const samePillars =
      oldPillars.year?.stem === newPillars.year.stem &&
      oldPillars.year?.branch === newPillars.year.branch &&
      oldPillars.month?.stem === newPillars.month.stem &&
      oldPillars.month?.branch === newPillars.month.branch &&
      oldPillars.day?.stem === newPillars.day.stem &&
      oldPillars.day?.branch === newPillars.day.branch &&
      oldPillars.hour?.stem === newPillars.hour.stem &&
      oldPillars.hour?.branch === newPillars.hour.branch;

    if (samePillars) {
      kept++;
      continue;
    }

    // Recompute analysis
    const ge = w3.inferGeJu(newPillars);
    const yong = w6.bridgeYongshen(newPillars);

    console.log(`  ${row.id.slice(0,8)}.. ${row.name.padEnd(12)} · old H=${oldHourStr} → NEW H=${newHourStr} · old ge_ju=${row.bazi_pillars?.ge_ju || '?'} → NEW ${ge.structure} · DM ${row.day_master_strength} → ${yong.strength.level} · TST shift ${tst.totalShiftMin}min`);

    if (APPLY) {
      await c.query(
        `UPDATE profiles SET
           day_master = $1,
           day_master_strength = $2,
           yongshen = $3,
           bazi_pillars = $4,
           updated_at = now()
         WHERE id = $5`,
        [
          newPillars.day.stem,
          yong.strength.level,
          JSON.stringify({ top3: yong.yongshenFinal, climate: yong.climate?.climate || null }),
          JSON.stringify({ pillars: newPillars, ge_ju: ge.structure, tst_applied: true, migrated_at: new Date().toISOString() }),
          row.id,
        ]
      );
    }
    changed++;
  }

  console.log(`\n${changed} profiles ${APPLY ? 'updated' : 'would change'} · ${kept} unchanged`);
  console.log(APPLY ? '✅ committed' : '👀 dry-run · add --apply to commit');

  await c.end();
}

main().catch(e => { console.error('❌', e); process.exit(1); });
