/**
 * POST /api/activity-classify · Smart Activity Picker
 * Body: { query: string }
 * คืน: { activity: 'work_start'|'decision'|..., han: string, source: 'keyword'|'ai', confidence, reason }
 *
 * Flow: keyword match (instant) → AI fallback (Claude Max CLI)
 * 17 พ.ค. 2026 · เจ้านาย idea
 */
import { NextRequest, NextResponse } from "next/server";

// Map 13 activities → 8 UI buttons ของ /datepick (เก่ายังใช้ engine)
const UI_BUTTON_MAP: Record<string, string> = {
  'break-ground':'break-ground', 'sign-contract':'sign-contract',
  'move-in':'move-in', 'open-shop':'open-shop', 'travel':'travel',
  'negotiate':'negotiate', 'invest':'invest', 'wedding':'wedding',
  // อันใหม่ map ลง 8 buttons เดิม:
  'authority':'sign-contract',  // ใบอนุญาต/permit ↔ เซ็นสัญญา
  'health':'sign-contract',     // ทำสัญญาก่อนผ่าตัด
  'study':'sign-contract',      // สมัครเรียน
  'ritual':'wedding',           // พิธีมงคล รวม wedding
  'haircut':'sign-contract',    // default
};

const ACTIVITY_KEYWORDS: Array<{ key: string; han: string; th: string; words: string[] }> = [
  { key:'break-ground', han:'動土', th:'ตอกเสาเข็ม/ก่อสร้าง',
    words:['ตอก','เสาเข็ม','ขุด','ก่อสร้าง','สร้างบ้าน','foundation','พื้น','รากฐาน','ground','dig'] },
  { key:'sign-contract', han:'立約', th:'เซ็นสัญญา',
    words:['เซ็น','สัญญา','contract','mou','ข้อตกลง','ผูกพัน','agreement','sign','deal'] },
  { key:'move-in', han:'入宅', th:'ย้ายเข้าบ้าน',
    words:['ย้ายบ้าน','ย้ายเข้า','เข้าบ้าน','move','ขึ้นบ้าน','relocate','moving','migrate'] },
  { key:'open-shop', han:'開市', th:'เปิดกิจการ',
    words:['เปิดร้าน','เปิดกิจการ','ขาย','grand opening','launch','เปิดบริษัท','startup','เริ่มธุรกิจ','open shop','โฆษณา','marketing'] },
  { key:'travel', han:'出行', th:'เดินทางไกล',
    words:['เดินทาง','travel','บิน','ไปต่างประเทศ','ทริป','trip','flight','journey','vacation','holiday','ขับรถ'] },
  { key:'negotiate', han:'會見', th:'เจรจา/พบ',
    words:['เจรจา','คุย','meeting','พบ','พูดคุย','interview','สัมภาษณ์','ประชุม','negotiation','discuss','present'] },
  { key:'invest', han:'財貨', th:'ลงทุน/ซื้อ',
    words:['ลงทุน','ซื้อ','หุ้น','crypto','ทอง','property','invest','buy','รถ','บ้าน','condo','asset','พอร์ต','stock'] },
  { key:'wedding', han:'嫁娶', th:'แต่งงาน/หมั้น',
    words:['แต่งงาน','หมั้น','รดน้ำ','wedding','propose','marriage','wed','sin sod','สินสอด','ขันหมาก'] },
  { key:'health', han:'求醫', th:'รักษา/ผ่าตัด',
    words:['ผ่าตัด','รักษา','หมอ','surgery','medical','โรค','ป่วย','operation','คลอด','give birth'] },
  { key:'study', han:'入學', th:'เริ่มเรียน/สอบ',
    words:['เรียน','สอบ','เริ่มเรียน','enroll','exam','study','school','university','course','คอร์ส'] },
  { key:'ritual', han:'祭祀', th:'พิธีกรรม/ไหว้',
    words:['ไหว้','บวงสรวง','ศาล','พระ','prayer','ritual','ceremony','พิธี','ทำบุญ','blessing','ทำขวัญ'] },
  { key:'haircut', han:'剃頭', th:'ตัดผม',
    words:['ตัดผม','โกน','haircut','barber','รักษาผม'] },
  { key:'authority', han:'求官', th:'ขออำนาจ/ตำแหน่ง',
    words:['ตำแหน่ง','โปรโมท','promotion','authority','รัฐ','ขออนุญาต','permit','license','ใบอนุญาต','ตำแหน่งงาน'] },
];

function keywordMatch(query: string): { key: string; han: string; th: string; matched: string[] } | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  let best: { key: string; han: string; th: string; matched: string[]; score: number } | null = null;
  for (const act of ACTIVITY_KEYWORDS) {
    const matched = act.words.filter(w => q.includes(w.toLowerCase()));
    if (matched.length > 0) {
      const score = matched.reduce((s, w) => s + w.length, 0); // longer match = stronger
      if (!best || score > best.score) {
        best = { key: act.key, han: act.han, th: act.th, matched, score };
      }
    }
  }
  if (best) { const { score, ...rest } = best; return rest; }
  return null;
}

const _cache = new Map<string, { activity: string; han: string; th: string; reason: string; expires: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const query: string = (body.query || '').trim();
    if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 });
    if (query.length > 200) return NextResponse.json({ error: 'query too long (max 200)' }, { status: 400 });

    // Cache check
    const cached = _cache.get(query.toLowerCase());
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json({ ...cached, ui_act: UI_BUTTON_MAP[cached.activity] || cached.activity, source: 'cache', confidence: 0.95 });
    }

    // Layer 1 · keyword match (instant)
    const kw = keywordMatch(query);
    if (kw) {
      return NextResponse.json({
        activity: kw.key, ui_act: UI_BUTTON_MAP[kw.key] || kw.key,
        han: kw.han, th: kw.th,
        source: 'keyword', confidence: 0.85,
        reason: `จับคีย์เวิร์ด: ${kw.matched.join(', ')} → ${kw.han}`,
      });
    }

    // Layer 2 · AI fallback (Claude Max CLI · best-effort · timeout 8s)
    try {
      const { spawn } = await import('child_process');
      const prompt = `Activity classifier for Chinese date selection. User said: "${query}"
Pick ONE activity from this list (return JSON only):
- break-ground (動土 ก่อสร้าง)
- sign-contract (立約 เซ็นสัญญา)
- move-in (入宅 ย้ายบ้าน)
- open-shop (開市 เปิดกิจการ)
- travel (出行 เดินทาง)
- negotiate (會見 เจรจา/พบ)
- invest (財貨 ลงทุน/ซื้อ)
- wedding (嫁娶 แต่งงาน)
- health (求醫 รักษา)
- study (入學 เรียน)
- ritual (祭祀 พิธี)
- haircut (剃頭 ตัดผม)
- authority (求官 ขออำนาจ/ตำแหน่ง)
Return JSON: {"activity":"key","reason":"why in Thai 1 line"}`;
      const result = await new Promise<string>((resolve, reject) => {
        const p = spawn('sudo', ['-u', 'jarvis', 'claude', '--print', '--output-format', 'text'], { timeout: 8000 });
        let out = '', err = '';
        p.stdout.on('data', d => out += d.toString());
        p.stderr.on('data', d => err += d.toString());
        p.on('error', reject);
        p.on('close', code => { if (code !== 0) reject(new Error(err || 'cli exit ' + code)); else resolve(out); });
        p.stdin.write(prompt); p.stdin.end();
      });
      const m = result.match(/\{[\s\S]*?"activity"\s*:\s*"([^"]+)"[\s\S]*?(?:"reason"\s*:\s*"([^"]+)")?[\s\S]*?\}/);
      if (m) {
        const aiKey = m[1].toLowerCase();
        const aiReason = m[2] || '';
        const match = ACTIVITY_KEYWORDS.find(a => a.key === aiKey);
        if (match) {
          const resp = { activity: match.key, han: match.han, th: match.th, reason: aiReason || `AI: ${match.han}` };
          _cache.set(query.toLowerCase(), { ...resp, expires: Date.now() + CACHE_TTL });
          return NextResponse.json({ ...resp, ui_act: UI_BUTTON_MAP[match.key] || match.key, source: 'ai', confidence: 0.75 });
        }
      }
    } catch (e) {
      console.warn('[activity-classify AI]', (e as Error).message);
    }

    // Layer 3 · default fallback
    return NextResponse.json({
      activity: 'sign-contract', ui_act: 'sign-contract',
      han: '立約', th: 'เซ็นสัญญา (default)',
      source: 'default', confidence: 0.3,
      reason: 'ไม่จับคีย์เวิร์ด · AI ไม่ตอบ · ใช้ default · กรุณาเลือกจากปุ่ม',
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
