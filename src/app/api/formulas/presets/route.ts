import { NextResponse } from "next/server";
import { PRESET_PROFILES } from "@/lib/formula-output-map";

export async function GET() {
  return NextResponse.json({ ok: true, presets: PRESET_PROFILES });
}
