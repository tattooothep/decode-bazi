import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-guard";
import { TYPES } from "@/lib/paraphrase-types";

export async function GET() {
  try {
    await requirePermission("admin.paraphrase.read");
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const list = Object.values(TYPES).map((t) => ({
    type: t.type,
    table: t.table,
    section: t.section,
    fields: t.fields.length,
  }));
  return NextResponse.json({ ok: true, types: list });
}
