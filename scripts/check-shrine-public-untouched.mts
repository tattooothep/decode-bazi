/** ตรวจอย่างเดียว: ตารางจริงใน public ไม่ถูกแตะจากด่านทดสอบ */
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

async function main() {
  const news = await pool.query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('shrine_ritual_strikes','shrine_qian_permit_casts','shrine_qian_draws')`,
  );
  console.log(
    "ตารางใหม่ใน public (ควรเป็น 0 เพราะยังไม่ได้ลงจริง):",
    news.rowCount,
  );
  const counts = await pool.query(
    `SELECT 'shrine_jiaobei_casts' AS t, COUNT(*)::text AS n FROM shrine_jiaobei_casts
     UNION ALL SELECT 'shrine_jiaobei_questions', COUNT(*)::text FROM shrine_jiaobei_questions
     UNION ALL SELECT 'shrine_offering_grants', COUNT(*)::text FROM shrine_offering_grants
     UNION ALL SELECT 'shrine_dedication_lanterns', COUNT(*)::text FROM shrine_dedication_lanterns`,
  );
  console.table(counts.rows);
  const testUsers = await pool.query(
    `SELECT COUNT(*)::text AS n FROM shrine_jiaobei_casts
      WHERE user_id::text LIKE '00000000-0000-4000-8000-%'`,
  );
  console.log("แถวของผู้ใช้ทดสอบที่หลุดลง public:", testUsers.rows[0].n);
  await pool.end();
}

main().catch((error) => {
  console.error("ล้มเหลว:", error.message);
  process.exit(1);
});
