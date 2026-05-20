import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { TYPES } from "@/lib/paraphrase-types";

export async function GET() {
  try {
    await requireAdmin();
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
