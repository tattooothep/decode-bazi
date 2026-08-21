"use strict";

const { parentPort, workerData } = require("node:worker_threads");

if (!parentPort || typeof workerData?.enginePath !== "string") {
  throw new Error("qimen_engine_worker_invalid");
}

const { calculateQimenNotificationChart } = require(workerData.enginePath);
if (typeof calculateQimenNotificationChart !== "function") {
  throw new Error("qimen_engine_worker_contract_invalid");
}

const PALACE_FIELDS = Object.freeze([
  "palace_id", "direction", "display_score",
  "earth_stem_zh", "heaven_stem_zh",
  "deity_code", "deity_zh", "deity_name_th", "deity_name_en", "deity_quality",
  "door_code", "door_zh", "door_name_th", "door_name_en", "door_quality",
  "door_action_advice_th", "door_action_advice_en", "door_action_advice_zh",
  "star_code", "star_zh", "star_name_th", "star_name_en", "star_quality",
  "beginner_reading", "classical_flags", "ui_flags", "is_void_any", "is_traveling_horse",
]);

function projectResult(result) {
  return {
    chart: {
      dun_type: result?.chart?.dun_type,
      ju_number: result?.chart?.ju_number,
      wang_xiang_status: result?.chart?.wang_xiang_status,
    },
    calculation: {
      input_datetime: result?.calculation?.input_datetime,
      input_timezone: result?.calculation?.input_timezone,
      corrected_datetime: result?.calculation?.corrected_datetime,
      apparent_solar_coordinate: result?.calculation?.apparent_solar_coordinate,
      correction_minutes: result?.calculation?.correction_minutes,
      time_mode: result?.calculation?.time_mode,
      ju_method: result?.calculation?.ju_method,
      pillars: result?.calculation?.pillars,
      engine_contract: result?.calculation?.engine_contract,
    },
    palaces: (result?.palaces || []).map((palace) => Object.fromEntries(
      PALACE_FIELDS.filter((field) => palace[field] !== undefined).map((field) => [field, palace[field]]),
    )),
    warnings: result?.warnings || [],
  };
}

parentPort.on("message", async (task) => {
  try {
    const result = await calculateQimenNotificationChart(task.params);
    parentPort.postMessage({ id: task.id, ok: true, result: projectResult(result) });
  } catch (error) {
    parentPort.postMessage({
      id: task.id,
      ok: false,
      error: {
        name: String(error?.name || "Error").slice(0, 80),
        code: String(error?.code || "").slice(0, 120),
        message: String(error?.message || "qimen_engine_worker_failed").slice(0, 300),
      },
    });
  }
});
