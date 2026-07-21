import { categoryForPinType } from "@/lib/luopan/najia-basha";

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

export class MobileLuopanEvidenceError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

function rec(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function mobileJson(fetcher: FetchLike, url: string, bearer: string, init?: RequestInit) {
  const response = await fetcher(url, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bearer}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({})) as JsonRecord;
  return { response, data };
}

function publicSnapshot(data: JsonRecord | null) {
  return data ? {
    datetime:data.datetime,
    layers:data.layers,
    warnings:data.warnings,
    recommendations:data.recommendations,
    entitlement:data.entitlement,
  } : null;
}

export async function rebuildMobileLuopanExportEvidence(args: {
  bearer: string;
  fetcher?: FetchLike;
  inputs: unknown;
  origin: string;
}) {
  const fetcher = args.fetcher || fetch;
  const inputs = rec(args.inputs) || {};
  const supplied = rec(inputs.luopan);
  const houseInput = rec(supplied?.house);
  if (!supplied || supplied.version !== "luopan_evidence_v2" || !houseInput) {
    throw new MobileLuopanEvidenceError(400, "invalid_luopan_evidence");
  }
  const degree = finite(houseInput.facingDegree);
  const period = finite(houseInput.period);
  if (degree === null || period === null || !Number.isInteger(period) || period < 1 || period > 9) {
    throw new MobileLuopanEvidenceError(400, "invalid_luopan_measurement");
  }
  const suppliedPins = Array.isArray(supplied.pins) ? supplied.pins.slice(0,100) : [];
  const pinTypes = new Set(["door","bed","stove","water","incoming_water","outgoing_water","water_mouth","drain","tall_form","sharp_form","road_rush"]);
  const pins = suppliedPins.flatMap((value) => {
    const pin = rec(value), pinDegree = finite(pin?.degree);
    const type = String(pin?.type || "").slice(0,40);
    const featureCategory=categoryForPinType(type);
    return pin && pinDegree !== null && pinTypes.has(type) && featureCategory ? [{type,degree:pinDegree,featureCategory}] : [];
  });
  const analysisResult = await mobileJson(fetcher, `${args.origin}/api/mobile/v1/luopan/analysis`, args.bearer, {
    body:JSON.stringify({
      client_measurement_id:`export_${Date.now()}`, method:"manual", north_reference:"manual",
      heading_deg:degree, period, pins, tigua_school:"full_24",
    }),
    method:"POST",
  });
  if (!analysisResult.response.ok || !rec(analysisResult.data.core) || !rec(analysisResult.data.measurement)) {
    console.warn("[mobile-luopan-export] recalculation failed", {
      status:analysisResult.response.status,
      code:analysisResult.data.code,
      error:analysisResult.data.error,
      reasons:rec(analysisResult.data.measurement)?.reasons,
      heading:rec(analysisResult.data.measurement)?.headingDeg,
      boundary:rec(analysisResult.data.measurement)?.boundaryDistanceDeg,
      uncertainty:rec(analysisResult.data.measurement)?.uncertaintyDeg,
    });
    throw new MobileLuopanEvidenceError(analysisResult.response.status || 422, "luopan_recalculation_failed");
  }
  const analysis = analysisResult.data;
  const measurement = rec(analysis.measurement) || {};
  const core = rec(analysis.core) || {};
  const heading = finite(measurement.headingDeg);
  if (heading === null) throw new MobileLuopanEvidenceError(422, "luopan_recalculation_failed");

  const ringsResult = await mobileJson(fetcher, `${args.origin}/api/mobile/v1/luopan/rings?degree=${encodeURIComponent(String(heading))}`, args.bearer);
  if (!ringsResult.response.ok) throw new MobileLuopanEvidenceError(ringsResult.response.status || 502, "luopan_rings_unavailable");

  const houseId = String(houseInput.id || "").trim();
  let ownedHouse: JsonRecord | null = null;
  let snapshot: JsonRecord | null = null;
  if (houseId) {
    if (!/^\d{1,20}$/.test(houseId)) throw new MobileLuopanEvidenceError(400, "invalid_house_id");
    const houseResult = await mobileJson(fetcher, `${args.origin}/api/mobile/v1/houses/${houseId}`, args.bearer);
    if (!houseResult.response.ok || !rec(houseResult.data.house)) {
      throw new MobileLuopanEvidenceError(houseResult.response.status || 404, "house_not_owned");
    }
    ownedHouse = rec(houseResult.data.house);
    const snapshotResult = await mobileJson(fetcher, `${args.origin}/api/mobile/v1/luopan/snapshot?house_id=${houseId}&datetime=${encodeURIComponent(new Date().toISOString())}`, args.bearer);
    if (!snapshotResult.response.ok) throw new MobileLuopanEvidenceError(snapshotResult.response.status || 502, "house_snapshot_unavailable");
    snapshot = snapshotResult.data;
  }

  const profileId = String(houseInput.profileId || "").replace(/^hk_/, "").trim();
  let profile: JsonRecord | null = null;
  if (profileId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)) {
      throw new MobileLuopanEvidenceError(400, "invalid_profile_id");
    }
    const profileResult = await mobileJson(fetcher, `${args.origin}/api/mobile/v1/profiles/${profileId}`, args.bearer);
    if (!profileResult.response.ok) throw new MobileLuopanEvidenceError(profileResult.response.status || 404, "profile_not_owned");
    profile = rec(profileResult.data.profile) || profileResult.data;
  }

  const facing = rec(core.facing) || {};
  const sitting = rec(core.sitting) || {};
  const pinWarnings = Array.isArray(core.pin_warnings) ? core.pin_warnings : [];
  const acceptedPins = pins.slice(0,pinWarnings.length);
  const verifiedPins = acceptedPins.map((pin,index) => {
    const checked = rec(pinWarnings[index]);
    const hits = Array.isArray(checked?.hits) ? checked.hits.flatMap((value) => {
      const hit = rec(value);
      return hit ? [{code:String(hit.code || ""),severity:String(hit.severity || ""),pass:hit.pass === true}] : [];
    }) : [];
    return {type:pin.type,degree:pin.degree,plate:String(checked?.plate || ""),mountain:String(checked?.mountain || ""),score:null,evidence:hits};
  });
  const actualHouseName = String(ownedHouse?.name || houseInput.name || "").slice(0,120);
  const ownerName = String(profile?.nickname || profile?.name || "").slice(0,120);
  const waterPinCount = acceptedPins.filter((pin) => pin.type.includes("water")).length;
  const rebuilt = {
    version:"luopan_evidence_v2",
    house:{
      id:houseId || null, profileId:profileId || null, name:actualHouseName,
      facingDegree:heading, facingMountain:String(facing.name || ""),
      sittingDegree:(heading+180)%360, sittingMountain:String(sitting.name || ""),
      year:null, period:Number(core.period), ownerName, timing:"era", qimenSchool:String(core.school || ""),
    },
    focus:{
      degree:heading, mountain:String(facing.name || ""), direction:String(facing.name || ""), score:null,
      evidence:[
        `measurement_pass=${String(measurement.pass === true)}`,
        `boundary_distance_deg=${String(measurement.boundaryDistanceDeg ?? "unknown")}`,
        `uncertainty_deg=${String(measurement.uncertaintyDeg ?? "unknown")}`,
        `near_boundary=${String(measurement.nearBoundary ?? "unknown")}`,
      ],
    },
    summary:{schemaVersion:String(analysis.formula_version || ""),topGood:[],topBad:[],profileElements:""},
    pins:verifiedPins,
    completeness:{
      houseLocked:measurement.pass === true, hasPlan:acceptedPins.length > 0, hasProfile:Boolean(profile),
      pinCount:acceptedPins.length, waterPinCount,
      waterComplete:["incoming_water","outgoing_water","water_mouth"].every((type) => acceptedPins.some((pin) => pin.type === type)),
    },
    sciences:JSON.stringify({
      formula_version:analysis.formula_version, verdict_scope:analysis.verdict_scope, measurement,
      core, focused_rings:ringsResult.data, house_snapshot:publicSnapshot(snapshot),
      excluded_unverified_layers:analysis.excluded_unverified_layers,
    }),
  };
  return {...inputs,luopan:rebuilt};
}
