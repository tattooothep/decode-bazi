import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { TYPES } from "@/lib/paraphrase-types";
import { q } from "@/lib/db";

/**
 * GET /api/admin/paraphrase/audit
 * Query:
 *   - type?    paraphrase type slug (archetype, structure, …) → maps to table_name
 *   - table?   raw table_name (ถ้าใส่จะ override type)
 *   - lang?    en | th | zh
 *   - source?  manual | import-json | translate-ai | smoke-test | …
 *   - user?    email (substring match)
 *   - field?   field_name substring
 *   - since?   ISO date (changed_at >= since)
 *   - until?   ISO date (changed_at <= until)
 *   - limit?   default 200 max 1000
 *   - offset?  default 0
 */
export async function GET(req: Request) {
  try {
    await requirePermission("admin.paraphrase.read");
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sp = url.searchParams;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  // Resolve table from type or raw table
  const typeSlug = sp.get("type");
  const rawTable = sp.get("table");
  let resolvedTable: string | null = rawTable;
  if (!resolvedTable && typeSlug) {
    const def = TYPES[typeSlug];
    if (def) resolvedTable = def.table;
  }
  if (resolvedTable) {
    conditions.push(`"table_name" = $${i++}`);
    params.push(resolvedTable);
  }

  const lang = sp.get("lang");
  if (lang) {
    conditions.push(`"lang" = $${i++}`);
    params.push(lang);
  }
  const source = sp.get("source");
  if (source) {
    conditions.push(`"source" = $${i++}`);
    params.push(source);
  }
  const user = sp.get("user");
  if (user) {
    conditions.push(`"changed_by" ILIKE $${i++}`);
    params.push(`%${user}%`);
  }
  const field = sp.get("field");
  if (field) {
    conditions.push(`"field_name" ILIKE $${i++}`);
    params.push(`%${field}%`);
  }
  const since = sp.get("since");
  if (since) {
    conditions.push(`"changed_at" >= $${i++}`);
    params.push(since);
  }
  const until = sp.get("until");
  if (until) {
    conditions.push(`"changed_at" <= $${i++}`);
    params.push(until);
  }

  const limit = Math.min(Number(sp.get("limit") || 200) || 200, 1000);
  const offset = Math.max(Number(sp.get("offset") || 0) || 0, 0);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRows = await q<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM audit_paraphrase_log ${where}`,
    params
  );
  const total = Number(totalRows[0]?.c || 0);

  const sourceCounts = await q(
    `SELECT source, COUNT(*)::int AS c FROM audit_paraphrase_log ${where} GROUP BY source ORDER BY c DESC`,
    params
  );
  const tableCounts = await q(
    `SELECT table_name, COUNT(*)::int AS c FROM audit_paraphrase_log ${where} GROUP BY table_name ORDER BY c DESC LIMIT 30`,
    params
  );
  const userCounts = await q(
    `SELECT changed_by, COUNT(*)::int AS c FROM audit_paraphrase_log ${where} GROUP BY changed_by ORDER BY c DESC LIMIT 20`,
    params
  );

  const entries = await q(
    `SELECT id, table_name, row_id, field_name, lang, old_value, new_value,
            changed_by, changed_at, source
     FROM audit_paraphrase_log
     ${where}
     ORDER BY changed_at DESC, id DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...params, limit, offset]
  );

  // Map table_name → type slug for friendly display
  const tableToType: Record<string, { type: string; section: string }> = {};
  for (const def of Object.values(TYPES)) {
    tableToType[def.table] = { type: def.type, section: def.section };
  }

  return NextResponse.json({
    ok: true,
    total,
    limit,
    offset,
    filters: {
      type: typeSlug,
      table: resolvedTable,
      lang,
      source,
      user,
      field,
      since,
      until,
    },
    summary: {
      sources: sourceCounts,
      tables: tableCounts.map((r) => ({
        ...r,
        type_info: tableToType[String((r as Record<string, unknown>).table_name)] || null,
      })),
      users: userCounts,
    },
    entries: entries.map((e) => ({
      ...e,
      type_info: tableToType[String((e as Record<string, unknown>).table_name)] || null,
    })),
  });
}
