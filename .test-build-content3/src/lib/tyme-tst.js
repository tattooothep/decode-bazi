"use strict";
/**
 * tyme-tst.ts · Layer 0 · True Solar Time correction
 *
 * input:  local birth datetime + longitude + GMT offset
 * output: corrected (h,m) for tyme4ts SolarTime.fromYmdHms
 *
 * NOAA-style EoT + longitude-vs-meridian correction
 * verified vs Voytek bazi-calculator.com
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyTST = applyTST;
function applyTST(input) {
    const { year, month, day, hour, minute, longitude } = input;
    const gmt = input.gmtOffsetHours ?? 7;
    const standardMeridian = gmt * 15; // 15° per hour
    // Local → UTC
    const dt = new Date(Date.UTC(year, month - 1, day, hour - gmt, minute, 0));
    const dayOfYear = Math.floor((dt.getTime() - Date.UTC(dt.getUTCFullYear(), 0, 0)) / 86400000);
    // Equation of Time (NOAA approximation, minutes)
    const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
    const eotMin = 229.18 *
        (0.000075
            + 0.001868 * Math.cos(gamma)
            - 0.032077 * Math.sin(gamma)
            - 0.014615 * Math.cos(2 * gamma)
            - 0.040849 * Math.sin(2 * gamma));
    // Longitude correction (4 minutes per degree from standard meridian)
    const longitudeShiftMin = (longitude - standardMeridian) * 4;
    const totalShiftMin = longitudeShiftMin + eotMin;
    // Apply shift
    const totalMin = hour * 60 + minute + totalShiftMin;
    let appliedHour = Math.floor(totalMin / 60);
    let appliedMinute = Math.floor(totalMin - appliedHour * 60);
    // Cross day boundary · track dayShift
    let appliedDayShift = 0;
    if (appliedHour < 0) {
        appliedHour += 24;
        appliedDayShift = -1;
    }
    else if (appliedHour >= 24) {
        appliedHour -= 24;
        appliedDayShift = 1;
    }
    if (appliedMinute < 0)
        appliedMinute += 60;
    return {
        appliedHour,
        appliedMinute,
        appliedDayShift,
        longitudeShiftMin: Math.round(longitudeShiftMin * 10) / 10,
        eotMin: Math.round(eotMin * 10) / 10,
        totalShiftMin: Math.round(totalShiftMin * 10) / 10,
        appliedTimeStr: `${String(appliedHour).padStart(2, "0")}:${String(appliedMinute).padStart(2, "0")}`,
        meta: {
            standardMeridian,
            longitude,
            gmtOffsetHours: gmt,
        },
    };
}
