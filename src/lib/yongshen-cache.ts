/**
 * yongshen-cache · 18 พ.ค. 2026 · Codex flag #4
 * 19 พ.ค. 2026 · Option α · เพิ่ม birthTimeKnown + dayBoundary ใน key
 * shared in-memory TTL cache สำหรับ wrapper-7 synthesizeYongshen result
 * ใช้โดย /api/today และ /api/today/hours · กัน double-call ต่อ page load
 *
 * Key = `${birthDate}|${birthTime||'-'}|${birthLng}|${mode}|${dayBoundary}`
 * TTL = 10 min (ผังเกิดไม่เปลี่ยน · cache ยาวได้)
 */

type Synth = any;

interface YongshenOpts {
  birthTimeKnown?: boolean;
  dayBoundary?: "23:00" | "00:00";
}

const CACHE = new Map<string, { value: Synth; exp: number }>();
const TTL_MS = 10 * 60 * 1000; /* 10 นาที */
const MAX_ENTRIES = 1000;       /* กัน leak ใต้ 5,000 user load */

function key(birthDate?: string, birthTime?: string, birthLng?: number, opts?: YongshenOpts): string {
  const known = opts?.birthTimeKnown !== false;      /* default true · backward compat */
  const mode = known ? '4p' : '3p';
  const db = opts?.dayBoundary || '23:00';
  const t = known ? (birthTime || '12:00') : '-';    /* 3p ไม่ใช้ birthTime ใน key */
  return `${birthDate || ''}|${t}|${birthLng ?? 100.5018}|${mode}|${db}`;
}

function evictIfFull(): void {
  if (CACHE.size < MAX_ENTRIES) return;
  /* FIFO drop oldest 10% */
  const drop = Math.ceil(MAX_ENTRIES * 0.1);
  let i = 0;
  for (const k of CACHE.keys()) {
    if (i++ >= drop) break;
    CACHE.delete(k);
  }
}

export async function getYongshenSynth(
  birthDate?: string,
  birthTime?: string,
  birthLng?: number,
  opts?: YongshenOpts,
): Promise<Synth | null> {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const known = opts?.birthTimeKnown !== false;     /* default true · backward compat */
  const k = key(birthDate, birthTime, birthLng, opts);
  const cached = CACHE.get(k);
  const now = Date.now();
  if (cached && cached.exp > now) return cached.value;
  try {
    const { calcBazi } = await import("@/lib/bazi-calc");
    const calc = known
      ? await calcBazi({
          date: birthDate,
          time: birthTime || '12:00',
          longitude: birthLng ?? 100.5018,
          gmtOffsetHours: 7,
          dayBoundary: opts?.dayBoundary,
          birthTimeKnown: true,
        })
      : await calcBazi({
          date: birthDate,
          longitude: birthLng ?? 100.5018,
          gmtOffsetHours: 7,
          birthTimeKnown: false,
        });
    // @ts-ignore — runtime CJS
    const w7 = await import("../../data/library/wrappers/7-yongshen-v2.js");
    const synthFn = (w7 as any).synthesizeYongshen || (w7 as any).default?.synthesizeYongshen;
    if (!synthFn) return null;
    /* 3p: ห้าม fallback hour → day · ปล่อย null ให้ activePositions filter ทิ้ง */
    const natal: any = {
      year:  calc.pillars.year  || calc.pillars.day,
      month: calc.pillars.month || calc.pillars.day,
      day:   calc.pillars.day,
      hour:  known ? (calc.pillars.hour || calc.pillars.day) : null,
    };
    const synth = synthFn(natal);
    const wrapped = { synth, calc };
    evictIfFull();
    CACHE.set(k, { value: wrapped, exp: now + TTL_MS });
    return wrapped;
  } catch {
    return null;
  }
}

/** helper · ดึง yongshen + jishen + dominantJishen + bridges จาก synth */
export function extractFromSynth(synth: any): {
  yongshen: string[];
  jishen: string[];
  dominantJishen: string | null;
  bridgeElements: string[];
} {
  const toList = (v: any): string[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map((x: any) => typeof x === 'string' ? x : x?.element).filter(Boolean);
    if (typeof v === 'object' && Array.isArray(v.elements)) return v.elements;
    return [];
  };
  const primary = toList(synth?.primary_yongshen);
  const xishen  = toList(synth?.xishen);
  const jishen  = toList(synth?.jishen);
  const yongshen = Array.from(new Set([...primary, ...xishen]));
  const dom = synth?._details?.geju?.detail?.dominantElement;
  const dominantJishen = (dom && jishen.includes(dom)) ? dom : null;
  /* bridge_element list · จริงจาก _details.tongguan.bridges */
  const bridges = synth?._details?.tongguan?.bridges || [];
  const bridgeElements: string[] = [];
  for (const b of bridges) {
    if (b?.bridge_element) bridgeElements.push(b.bridge_element);
  }
  return { yongshen, jishen, dominantJishen, bridgeElements: Array.from(new Set(bridgeElements)) };
}
