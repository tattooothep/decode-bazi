import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { TYPES, expandFields } from "@/lib/paraphrase-types";
import { q, q1 } from "@/lib/db";

type Ctx = { params: Promise<{ type: string; id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  let admin;
  try {
    admin = await requirePermission("admin.paraphrase.read");
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const { type, id } = await ctx.params;
  const def = TYPES[type];
  if (!def) return NextResponse.json({ error: "unknown type" }, { status: 404 });

  const cols = [def.pkColumn, ...(def.fixedColumns?.map((f) => f.key) || []), ...expandFields(def.fields)];
  const colList = Array.from(new Set(cols)).map((c) => `"${c}"`).join(",");
  // Handle composite PK: star_reading uses (star_id, pillar_position)
  let where = `"${def.pkColumn}"=$1`;
  let params: unknown[] = [id];
  if (def.type === "star_reading") {
    const m = id.split("__");
    if (m.length === 2) {
      where = `"star_id"=$1 AND "pillar_position"=$2`;
      params = [m[0], m[1]];
    }
  }
  const row = await q1(`SELECT ${colList} FROM ${def.table} WHERE ${where} LIMIT 1`, params);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, type, id, def, row, admin: { email: admin.email, role: admin.role } });
}

export async function PUT(req: Request, ctx: Ctx) {
  let admin;
  try {
    admin = await requirePermission("admin.paraphrase.write");
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const { type, id } = await ctx.params;
  const def = TYPES[type];
  if (!def) return NextResponse.json({ error: "unknown type" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates = body.updates as Record<string, unknown> | undefined;
  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "missing updates" }, { status: 400 });
  }

  // Whitelist columns we allow to write
  const allowed = new Set<string>(expandFields(def.fields));
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  // Composite PK handling
  let where = `"${def.pkColumn}"=$%P1%`;
  const whereParams: unknown[] = [];
  if (def.type === "star_reading") {
    const m = id.split("__");
    if (m.length !== 2) return NextResponse.json({ error: "bad composite id" }, { status: 400 });
    where = `"star_id"=$%P1% AND "pillar_position"=$%P2%`;
    whereParams.push(m[0], m[1]);
  } else {
    whereParams.push(id);
  }

  // Fetch old values for audit
  const oldRow = await q1<Record<string, unknown>>(
    `SELECT ${Array.from(allowed).map((c) => `"${c}"`).join(",")} FROM ${def.table} WHERE ${where
      .replace("$%P1%", "$1")
      .replace("$%P2%", "$2")}`,
    whereParams
  );

  for (const [k, v] of Object.entries(updates)) {
    if (!allowed.has(k)) continue;
    // Determine kind
    const field = def.fields.find((f) => k.startsWith(f.key + "_") || k === f.key);
    if (field?.kind === "jsonb") {
      sets.push(`"${k}" = $${i}::jsonb`);
      params.push(JSON.stringify(v ?? null));
    } else {
      sets.push(`"${k}" = $${i}`);
      params.push(v);
    }
    i++;
  }
  if (sets.length === 0) return NextResponse.json({ error: "no allowed updates" }, { status: 400 });

  sets.push(`"updated_at" = NOW()`);

  const finalWhere = where
    .replace("$%P1%", `$${i}`)
    .replace("$%P2%", `$${i + 1}`);
  params.push(...whereParams);

  const sql = `UPDATE ${def.table} SET ${sets.join(", ")} WHERE ${finalWhere} RETURNING *`;
  const updated = await q(sql, params);

  // Audit log
  for (const [k, v] of Object.entries(updates)) {
    if (!allowed.has(k)) continue;
    const oldVal = oldRow ? (oldRow as Record<string, unknown>)[k] : null;
    if (oldVal === v) continue;
    const lang = k.endsWith("_en") ? "en" : k.endsWith("_th") ? "th" : k.endsWith("_zh") ? "zh" : null;
    await q(
      `INSERT INTO audit_paraphrase_log (table_name, row_id, field_name, lang, old_value, new_value, changed_by, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        def.table,
        Number(String(id).split("__")[0]) || 0,
        k,
        lang,
        oldVal == null ? null : typeof oldVal === "object" ? JSON.stringify(oldVal) : String(oldVal),
        v == null ? null : typeof v === "object" ? JSON.stringify(v) : String(v),
        admin.email,
        body.source || "manual",
      ]
    );
  }

  return NextResponse.json({ ok: true, row: updated[0] });
}
