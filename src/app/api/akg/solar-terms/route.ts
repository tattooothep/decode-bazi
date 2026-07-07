/**
 * GET /api/akg/solar-terms?year=YYYY[&lang=th|en|zh][&tz=7]
 *
 * ดึงตาราง 24 節氣 ของปีที่ระบุจากตำราอากง v3 (Purple Mountain Observatory)
 * - cycle = 立春→立春 (year ของอากง)
 * - คืน CST (UTC+8) + เวลาท้องถิ่น (default UTC+7 ไทย)
 * - แนบ concept + naming + ที่มา + dun_jia info
 */
import { NextRequest, NextResponse } from "next/server";
import { q1 } from "@/lib/db";

type Term = { no: number; name: string; date: string; branch_starts?: string };
type AnnualEntry = { year_stem_branch: string; li_chun: string; is_leap?: boolean; terms: Term[] };
type SolarLang = "th" | "en" | "zh" | "vi" | "ja" | "ru" | "ko" | "es";

function normalizeLang(raw: string | null): SolarLang {
  const x = String(raw || "th").toLowerCase().replace("_", "-");
  if (x === "cn" || x === "zh-cn" || x === "zh-hans" || x.startsWith("zh")) return "zh";
  if (x === "vi" || x === "ja" || x === "ru" || x === "ko" || x === "es" || x === "en" || x === "th") return x;
  return "th";
}

function shiftCstToLocal(cst: string, tzOffsetH: number): string {
  // cst format "YYYY-MM-DD HH:MM" (CST = UTC+8)
  const m = cst.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return cst;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5]));
  d.setUTCHours(d.getUTCHours() + tzOffsetH);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") || `${new Date().getFullYear()}`, 10);
    const lang = normalizeLang(searchParams.get("lang"));
    const tzOff = parseInt(searchParams.get("tz") || "7", 10);

    if (!year || year < 2020 || year > 2035) {
      return NextResponse.json({ ok: false, error: "year must be 2020-2035" }, { status: 400 });
    }

    // 1) annual table
    const precise = await q1<{ data: { annual_tables: Record<string, AnnualEntry> } }>(
      `SELECT data FROM ref_akg_data WHERE key='v3_solar_precise_2020_2035'`
    );
    if (!precise) return NextResponse.json({ ok: false, error: "precise table missing" }, { status: 500 });
    const annual = precise.data.annual_tables?.[String(year)];
    if (!annual) return NextResponse.json({ ok: false, error: `year ${year} not in table` }, { status: 404 });

    // 2) basic concept + 3-lang names
    const basic = await q1<{ data: Record<string, unknown> }>(
      `SELECT data FROM ref_akg_data WHERE key='v3_24_terms_basic'`
    );
    const conceptObj = basic?.data?.concept_explanation as Record<string, string> | undefined;
    // DB (ref_akg_data key=v3_24_terms_basic) มีแค่ concept_explanation.thai กับ .zh — ไม่มี .en
    // เดิม fallback ไปที่ .thai ตรง ๆ เมื่อขอ en → ไทยหลุดโผล่ตอนเลือก EN บน /solar-terms
    // เติม fallback ภาษาอังกฤษ (แปลตรงจาก .thai/.zh) กันไทยหลุด โดยไม่แตะข้อมูลใน DB (ref_ ตาราง)
    const CONCEPT_FALLBACK: Record<SolarLang, string> = {
      th: "24 節氣 คือ 24 ช่วงฤดูกาลจากตำแหน่งดวงอาทิตย์บนวงโคจร · ไม่ใช่ปฏิทินจันทรคติ",
      en: "24 Solar Terms = 24 periods of the year defined by the sun's position along its orbit · not a lunar calendar",
      zh: "二十四節氣是依太陽在黃道上的位置劃分的一年24段 · 不是農曆月份",
      vi: "24 Tiết Khí là 24 giai đoạn trong năm theo vị trí của Mặt Trời trên quỹ đạo · không phải lịch âm",
      ja: "二十四節気は太陽の軌道上の位置で一年を24区分した季節暦です · 旧暦そのものではありません",
      ru: "24 солнечных термина делят год по положению Солнца на орбите · это не лунный календарь",
      ko: "24절기는 태양의 궤도상 위치로 한 해를 24구간으로 나눈 절기 체계입니다 · 음력 달력이 아닙니다",
      es: "Los 24 términos solares dividen el año según la posición del sol en su órbita · no son un calendario lunar",
    };
    const concept =
      conceptObj?.[lang] ||
      (lang === "th" ? conceptObj?.thai : undefined) ||
      (lang === "zh" ? conceptObj?.zh : undefined) ||
      CONCEPT_FALLBACK[lang] ||
      conceptObj?.thai ||
      conceptObj?.zh ||
      "";
    const the24 = (basic?.data?.the_24_terms as Array<Record<string, unknown>>) || [];

    // 3) 3-lang names from ref_qimen_solar_terms_dict (DB)
    const dictRows = await q1<{ rows: Array<{ zh: string; name_th: string; name_en: string; dun_type?: string; note_th?: string; note_en?: string; note_zh?: string }> }>(
      `SELECT json_agg(t) AS rows FROM (SELECT zh, name_th, name_en, dun_type, note_th, note_en, note_zh FROM ref_qimen_solar_terms_dict ORDER BY order_no) t`
    );
    const dictArr = dictRows?.rows || [];
    const dictMap = new Map(dictArr.map(d => [d.zh, d]));

    // 4) merge → terms array with 3 lang + local time + dun_jia info
    const terms = annual.terms.map((t: Term) => {
      const d = dictMap.get(t.name) || {} as Record<string, string>;
      const tInfo = the24.find(x => x.chinese === t.name) || {};
      return {
        no: t.no,
        zh: t.name,
        pinyin: (tInfo.pinyin as string) || "",
        name_th: d.name_th || (tInfo.thai as string) || "",
        name_en: d.name_en || (tInfo.english as string) || "",
        date_cst: t.date,                              // CST UTC+8
        date_local: shiftCstToLocal(t.date, tzOff),    // user tz (default Thailand UTC+7)
        branch_starts: t.branch_starts || null,
        is_major: t.no % 2 === 1,                      // 節 (odd) vs 氣 (even)
        type_zh: t.no % 2 === 1 ? "節" : "氣",
        type_meaning: t.no % 2 === 1 ? "เริ่มเดือน BaZi" : "กลางเดือน BaZi",
        dun_type: d.dun_type || null,                  // 陽遁/陰遁 for 奇門
        // ภาษาใหม่ (vi/ja/ko/ru/es) ยังไม่มีคอลัมน์ note_<lang> ใน DB → ถอยไป EN ไม่ใช่ TH (6 ก.ค. 2569)
        note:
          lang === "th" || lang === "en" || lang === "zh"
            ? d[`note_${lang}`] || d.note_th || ""
            : d.note_en || d.note_th || "",
      };
    });

    return NextResponse.json({
      ok: true,
      year,
      lang,
      tz_offset: tzOff,
      year_stem_branch: annual.year_stem_branch,
      li_chun_cst: annual.li_chun,
      li_chun_local: shiftCstToLocal(annual.li_chun, tzOff),
      is_leap: !!annual.is_leap,
      concept,
      terms,
      meta: {
        total_terms: terms.length,
        source: "周易 + 紫金山天文臺 + อากง v3 (อาม่าอากงให้หลานรักสุดหล่อ3)",
        timezone_note: `เวลาท้องถิ่นใช้ UTC+${tzOff} (ไทย=7) · เวลาดิบ CST=UTC+8`,
        bazi_note: "เดือน BaZi เริ่มที่ 節 (節=major terms · ตำแหน่งคี่ #1,3,5..) ไม่ใช่วันที่ 1 จันทรคติ",
        year_note: "ปีจีนเริ่มที่ 立春 ไม่ใช่ Lunar New Year",
      },
    });
  } catch (e: unknown) {
    console.error("[akg/solar-terms]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
