import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { TYPES, expandFields } from "@/lib/paraphrase-types";
import { q, q1 } from "@/lib/db";

/**
 * POST /api/admin/paraphrase/import
 * Body: JSON (ตรงกับ format ของ /export)
 *   - แบบ single type: { type: "archetype", rows: [{id:1, title_zh:"..."}, ...] }
 *   - แบบ all types:   { types: { archetype: [...], structure: [...] } }
 *
 * Behavior:
 *   - หาแถวด้วย pk (id) หรือ composite (star_reading: star_id+pillar_position)
 *   - update เฉพาะฟิลด์ที่ whitelisted ใน paraphrase-types (en/th/zh + jsonb)
 *   - audit log ทุก diff
 *   - return summary: rows scanned, rows updated, fields updated, errors
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = body as {
    type?: string;
    rows?: Array<Record<string, unknown>>;
    types?: Record<string, Array<Record<string, unknown>>>;
    source?: string;
  };

  // Normalize to { [type]: rows[] }
  const groups: Record<string, Array<Record<string, unknown>>> = {};
  if (payload.types && typeof payload.types === "object") {
    for (const [t, rs] of Object.entries(payload.types)) {
      if (Array.isArray(rs)) groups[t] = rs;
    }
  } else if (payload.type && Array.isArray(payload.rows)) {
    groups[payload.type] = payload.rows;
  } else {
    return NextResponse.json(
      { ok: false, error: "Expect either { type, rows[] } or { types: { ... } }" },
      { status: 400 }
    );
  }

  const result = {
    ok: true,
    by_type: {} as Record<
      string,
      { scanned: number; updated: number; fields_changed: number; errors: string[] }
    >,
  };
  const source = payload.source || "import-json";

  for (const [typeKey, rows] of Object.entries(groups)) {
    const def = TYPES[typeKey];
    const r = { scanned: 0, updated: 0, fields_changed: 0, errors: [] as string[] };
    result.by_type[typeKey] = r;
    if (!def) {
      r.errors.push(`unknown type: ${typeKey}`);
      continue;
    }
    const allowed = new Set<string>(expandFields(def.fields));

    for (const row of rows) {
      r.scanned++;
      try {
        // Resolve PK
        let where = `"${def.pkColumn}"=$1`;
        let whereParams: unknown[] = [];
        if (def.type === "star_reading") {
          const sid = row.star_id;
          const pos = row.pillar_position;
          if (sid == null || pos == null) {
            r.errors.push(`row missing star_id/pillar_position`);
            continue;
          }
          where = `"star_id"=$1 AND "pillar_position"=$2`;
          whereParams = [sid, pos];
        } else {
          const pkVal = row[def.pkColumn];
          if (pkVal == null) {
            r.errors.push(`row missing ${def.pkColumn}`);
            continue;
          }
          // Normalize ISO datetime → YYYY-MM-DD for DATE pk columns
          let normalized: unknown = pkVal;
          if (typeof pkVal === "string" && /^\d{4}-\d{2}-\d{2}T/.test(pkVal)) {
            normalized = pkVal.split("T")[0];
          }
          whereParams = [normalized];
        }

        // Fetch old row
        const oldRow = await q1<Record<string, unknown>>(
          `SELECT ${Array.from(allowed)
            .map((c) => `"${c}"`)
            .join(",")} FROM ${def.table} WHERE ${where}`,
          whereParams
        );
        if (!oldRow) {
          r.errors.push(`not found: pk=${JSON.stringify(whereParams)}`);
          continue;
        }

        // Build SET clause
        const sets: string[] = [];
        const params: unknown[] = [];
        const changedFields: Array<{ k: string; v: unknown; old: unknown }> = [];
        let i = 1;
        for (const [k, v] of Object.entries(row)) {
          if (!allowed.has(k)) continue;
          const old = oldRow[k];
          // skip if same (deep compare for jsonb)
          const oldStr = old == null ? null : typeof old === "object" ? JSON.stringify(old) : String(old);
          const newStr = v == null ? null : typeof v === "object" ? JSON.stringify(v) : String(v);
          if (oldStr === newStr) continue;
          const field = def.fields.find((f) => k.startsWith(f.key + "_") || k === f.key);
          if (field?.kind === "jsonb") {
            sets.push(`"${k}" = $${i}::jsonb`);
            params.push(JSON.stringify(v ?? null));
          } else {
            sets.push(`"${k}" = $${i}`);
            params.push(v);
          }
          changedFields.push({ k, v, old });
          i++;
        }
        if (sets.length === 0) continue;

        sets.push(`"updated_at" = NOW()`);

        // Adjust where params index
        const finalWhere = where
          .replaceAll("$1", `$${i}`)
          .replaceAll("$2", `$${i + 1}`);
        params.push(...whereParams);

        const sql = `UPDATE ${def.table} SET ${sets.join(", ")} WHERE ${finalWhere}`;
        await q(sql, params);
        r.updated++;
        r.fields_changed += changedFields.length;

        // Audit
        const rowIdForAudit =
          def.type === "star_reading" ? Number(whereParams[0]) || 0 : Number(whereParams[0]) || 0;
        for (const cf of changedFields) {
          const lang = cf.k.endsWith("_en")
            ? "en"
            : cf.k.endsWith("_th")
              ? "th"
              : cf.k.endsWith("_zh")
                ? "zh"
                : null;
          await q(
            `INSERT INTO audit_paraphrase_log (table_name, row_id, field_name, lang, old_value, new_value, changed_by, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              def.table,
              rowIdForAudit,
              cf.k,
              lang,
              cf.old == null ? null : typeof cf.old === "object" ? JSON.stringify(cf.old) : String(cf.old),
              cf.v == null ? null : typeof cf.v === "object" ? JSON.stringify(cf.v) : String(cf.v),
              admin.email,
              source,
            ]
          );
        }
      } catch (err) {
        r.errors.push(`row error: ${String(err).slice(0, 200)}`);
      }
    }
  }

  return NextResponse.json(result);
}
