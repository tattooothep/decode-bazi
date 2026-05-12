/**
 * /api/_audit/engine · Read-only
 * Phase 7 · Engine Audit Endpoint
 *
 * คืน status ของทุก module + i18n bundle + formula export
 */
import { NextResponse } from "next/server";
import { getBundleMeta, listCodes } from "@/lib/i18n-decode";
import engineStatus from "../../../../../data/i18n/engine-status.json";
import formulaData from "../../../../../data/i18n/formula.json";

export async function GET() {
  const i18nProd = getBundleMeta("decode", "production");
  const i18nStaging = getBundleMeta("decode", "staging");

  const modules = (engineStatus as any).modules ?? [];
  const formulas = (formulaData as any).formulas ?? {};

  return NextResponse.json({
    engine_version: "v2.0",
    audit_at: new Date().toISOString(),
    i18n: {
      production: {
        version: i18nProd.version,
        count: i18nProd.entries_count,
        checksum: i18nProd.checksum,
        codes_sample: listCodes("decode", "production").slice(0, 5)
      },
      staging: {
        version: i18nStaging.version,
        count: i18nStaging.entries_count,
        checksum: i18nStaging.checksum,
        codes_sample: listCodes("decode", "staging").slice(0, 5)
      }
    },
    modules: {
      total: modules.length,
      by_status: countBy(modules, "engine_status"),
      by_priority: countBy(modules, "priority"),
      list: modules.map((m: any) => ({
        module_id: m.module_id,
        scope: m.scope,
        status: m.engine_status,
        priority: m.priority,
        live_endpoint: m.live_endpoint,
        sheet_action: m.sheet_action
      }))
    },
    formulas: {
      total: Object.keys(formulas).length,
      list: Object.values(formulas).map((f: any) => ({
        formula_id: f.formula_id,
        module_id: f.module_id,
        weight: f.weight,
        status: f.status
      }))
    }
  });
}

function countBy(items: any[], key: string) {
  const out: Record<string, number> = {};
  for (const it of items) {
    const v = it[key] ?? "unknown";
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}
