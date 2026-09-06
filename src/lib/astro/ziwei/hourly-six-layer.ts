import { createRequire } from "node:module";
import { SolarTime } from "tyme4ts";
import { parseTz, zoneOffsetMinutes } from "../../birth-timezone";
import { ziweiChart } from "./engine";
import { buildZiweiHourlyNotificationFacts, type ZiweiHourlyPreviewInput } from "./hourly-preview";

const require = createRequire(import.meta.url);
const runtime = require("../../ziwei-hourly-notification.cjs");
const context = require("../../ziwei-hourly-six-layer.cjs");

function lunarYear(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return SolarTime.fromYmdHms(year, month, day, 12, 0, 0).getLunarHour().getLunarDay().getLunarMonth().getLunarYear().getYear();
}

/** New occurrence projection only. Never regenerate an already stored history row. */
export function buildZiweiHourlySixLayerSnapshot(input: ZiweiHourlyPreviewInput, owner: {
  accountId: string; profile: { id: string; name: string; isSelf: boolean };
}) {
  // Retain every validation and the byte-locked legacy adapter. One bounded
  // second engine call recovers omitted natal data; equality of all four flow
  // layers is mandatory, so there is no second interpretation of the hour.
  const facts = buildZiweiHourlyNotificationFacts(input);
  const birthZone = parseTz(input.birthTimezone)!;
  const birthOffset = birthZone.kind === "zone" ? zoneOffsetMinutes(input.birthInstant.getTime(), birthZone.label) : birthZone.offsetMin;
  const referenceOffset = zoneOffsetMinutes(input.referenceInstant.getTime(), facts.reference.timezone);
  if (birthOffset == null || referenceOffset == null) throw new TypeError("ziwei_six_layer_timezone_invalid");
  const chart = ziweiChart(input.birthInstant, input.birthLocation?.lat ?? 0, input.birthLocation?.lng ?? 0, input.gender, true, {
    gmtOffsetHours: birthOffset / 60, refDate: input.referenceInstant, refGmtOffsetHours: referenceOffset / 60, refBoundaryPolicy: "forward_zi",
  });
  for (const key of ["liuNian", "liuYue", "liuRi", "liuShi"] as const) {
    if (JSON.stringify(chart[key]) !== JSON.stringify(facts.layers[key])) throw new TypeError("ziwei_six_layer_reference_mismatch");
  }
  if (!chart.mingGong || !chart.shenGong || !chart.wuxingJu) throw new TypeError("ziwei_six_layer_natal_unavailable");
  const birthDate = new Date(input.birthInstant.getTime() + birthOffset * 60_000).toISOString().slice(0, 10);
  const nominalAge = lunarYear(facts.reference.calculationDate) - lunarYear(birthDate) + 1;
  const selected = chart.daXianSiHua.find((entry) => nominalAge >= entry.ageStart && nominalAge <= entry.ageEnd) ?? null;
  const sixLayers = {
    schema: 1, version: context.VERSION,
    natal: { yearGanzhi: chart.lunar.year, mingBranch: chart.mingGong.branch, shenBranch: chart.shenGong.branch,
      wuxingJu: chart.wuxingJu, siHua: chart.siHua, palaces: chart.palaces },
    decade: { agePolicy: "lunar-year-nominal-v1", nominalAge, selected,
      unavailableReason: selected ? null : nominalAge < Math.min(...chart.daXianSiHua.map((entry) => entry.ageStart))
        ? "before_first_decade" : "outside_recorded_decades" },
    palaceLayers: Object.fromEntries(Object.entries({ natal: chart.mingGong.branch, decade: selected?.branch ?? null,
      year: facts.layers.liuNian.mingBranch, month: facts.layers.liuYue.mingBranch,
      day: facts.layers.liuRi.mingBranch, hour: facts.layers.liuShi.mingBranch,
    }).map(([key, branch]) => [key, branch === null ? null : context.palaceLayer(chart.palaces, branch)])),
  };
  return runtime.buildZiweiHourlyNotificationSnapshot({ ...owner, facts, sixLayers });
}
