import { Pool, types as PgTypes } from "pg";

// DATE (OID 1082) — return as YYYY-MM-DD string (ไม่ shift timezone)
PgTypes.setTypeParser(1082, (v) => v);

const globalForPg = globalThis as unknown as { _pgPool?: Pool };

export const pool: Pool =
  globalForPg._pgPool ??
  new Pool({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5433),
    database: process.env.PGDATABASE || "decode_db",
    user: process.env.PGUSER || "decode_user",
    password: process.env.PGPASSWORD,  // 1 มิ.ย. · ย้ายไป .env.local (เลิก hardcoded รหัส DB ในโค้ด/zip)
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForPg._pgPool = pool;

export async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function q1<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] || null;
}
