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
  'authority':'sign-contract',  // 求官 fallback ลงฐานเอกสาร/อำนาจ
  'health':'sign-contract',     // ทำสัญญาก่อนผ่าตัด
  'study':'sign-contract',      // สมัครเรียน
  'ritual':'wedding',           // พิธีมงคล รวม wedding
  'haircut':'sign-contract',    // default
  'open-project':'open-shop',
  'interview':'negotiate',
  'client-sales':'invest',
  'surgery':'sign-contract',
  'take-position':'open-shop',
  'close-deal':'sign-contract',
  'permit-license':'sign-contract',
  'loan-credit':'invest',
  'meet-senior':'negotiate',
  'ask-favor':'negotiate',
  'partner-meeting':'negotiate',
  'pitch-present':'open-shop',
  'collect-money':'invest',
  'debt-followup':'invest',
  'pay-transfer':'invest',
  'ship-goods':'travel',
  'hire-onboard':'sign-contract',
  'office-move':'move-in',
  'board-meeting':'negotiate',
  'renovate':'break-ground',
  'medical-visit':'sign-contract',
  'exam-study':'sign-contract',
  'long-travel':'travel',
};

const PROFILE_KEY_MAP: Record<string, string> = {
  'break-ground':'break_ground',
  'sign-contract':'sign_contract',
  'move-in':'move_home',
  'open-shop':'open_business',
  'travel':'long_travel',
  'negotiate':'negotiation',
  'invest':'invest_buy',
  'wedding':'wedding',
  'authority':'take_position',
  'health':'medical_visit',
  'study':'exam_study',
  'ritual':'launch_ritual',
  'haircut':'sign_contract',
  'open-project':'open_project',
  'interview':'interview',
  'client-sales':'client_sales',
  'surgery':'surgery',
  'take-position':'take_position',
  'close-deal':'close_deal',
  'permit-license':'permit_license',
  'loan-credit':'loan_credit',
  'meet-senior':'meet_senior',
  'ask-favor':'ask_favor',
  'partner-meeting':'partner_meeting',
  'pitch-present':'pitch_present',
  'collect-money':'collect_money',
  'debt-followup':'debt_followup',
  'pay-transfer':'pay_transfer',
  'ship-goods':'ship_goods',
  'hire-onboard':'hire_onboard',
  'office-move':'office_move',
  'board-meeting':'board_meeting',
  'renovate':'renovate',
  'medical-visit':'medical_visit',
  'exam-study':'exam_study',
  'long-travel':'long_travel',
};

const ACTIVITY_KEYWORDS: Array<{ key: string; han: string; th: string; words: string[] }> = [
  { key:'break-ground', han:'動土', th:'ตอกเสาเข็ม/ก่อสร้าง',
    words:['ตอก','เสาเข็ม','ขุด','ก่อสร้าง','สร้างบ้าน','foundation','พื้น','รากฐาน','ground','dig'] },
  { key:'renovate', han:'修造', th:'รีโนเวท/ปรับปรุง',
    words:['รีโนเวท','renovate','ซ่อมบ้าน','ซ่อมแซม','ปรับปรุงบ้าน','ตกแต่งบ้าน','ต่อเติม'] },
  { key:'close-deal', han:'立券交易', th:'ปิดดีล/ปิดการขาย',
    words:['ปิดดีล','close deal','closing deal','ปิดการขาย','จบดีล','ตกลงราคา','ดีลนี้'] },
  { key:'permit-license', han:'上書', th:'ขอใบอนุญาต',
    words:['ขอใบอนุญาต','ใบอนุญาต','ขออนุญาต','permit','license','licence','ยื่นเอกสารราชการ'] },
  { key:'loan-credit', han:'求財', th:'ขอกู้/ขอเครดิต',
    words:['ขอกู้','กู้เงิน','ขอเครดิต','ขอวงเงิน','วงเงินธนาคาร','loan','credit line','สินเชื่อ'] },
  { key:'sign-contract', han:'立約', th:'เซ็นสัญญา',
    words:['เซ็น','สัญญา','contract','mou','ข้อตกลง','ผูกพัน','agreement','sign','deal'] },
  { key:'move-in', han:'入宅', th:'ย้ายเข้าบ้าน',
    words:['ย้ายบ้าน','ย้ายเข้า','เข้าบ้าน','move','ขึ้นบ้าน','relocate','moving','migrate'] },
  { key:'office-move', han:'移徙', th:'ย้ายออฟฟิศ',
    words:['ย้ายออฟฟิศ','ย้ายสำนักงาน','ย้าย office','ย้ายที่ทำงาน','office move'] },
  { key:'open-project', han:'開業', th:'เปิดโปรเจกต์/เปิดตัว',
    words:['เปิดโปรเจกต์','เริ่มโปรเจกต์','เปิดเว็บ','เปิดเพจ','เปิดช่อง','youtube','ai product','saas','product launch','launch product','เปิดตัวสินค้า','เปิดตัวผลิตภัณฑ์'] },
  { key:'open-shop', han:'開市', th:'เปิดกิจการ',
    words:['เปิดร้าน','เปิดกิจการ','ขาย','grand opening','launch','เปิดบริษัท','startup','เริ่มธุรกิจ','open shop','โฆษณา','marketing'] },
  { key:'long-travel', han:'出行', th:'เดินทางไกล',
    words:['เดินทางไกล','บินไป','ไฟลท์','flight','ต่างประเทศ','ต่างจังหวัด','road trip','business trip'] },
  { key:'travel', han:'出行', th:'เดินทางไกล',
    words:['เดินทาง','travel','บิน','ไปต่างประเทศ','ทริป','trip','flight','journey','vacation','holiday','ขับรถ'] },
  { key:'meet-senior', han:'見貴', th:'พบผู้ใหญ่/ที่ปรึกษา',
    words:['พบผู้ใหญ่','พบ senior','คุยผู้ใหญ่','พบที่ปรึกษา','mentor','ผู้มีอำนาจ','เจอผู้ใหญ่'] },
  { key:'ask-favor', han:'求人', th:'ขอความช่วยเหลือ',
    words:['ขอความช่วยเหลือ','ขอ favor','ขอให้ช่วย','ขอแรงสนับสนุน','ขอ intro','ขอคำแนะนำ'] },
  { key:'partner-meeting', han:'結交', th:'พบพันธมิตร',
    words:['พบพันธมิตร','คุยพาร์ทเนอร์','partner meeting','พันธมิตรใหม่','ความร่วมมือ','collaboration'] },
  { key:'pitch-present', han:'上陳', th:'Pitch / นำเสนอ',
    words:['pitch','นำเสนอ','พรีเซนต์','present','นำเสนอบอร์ด','นำเสนอนักลงทุน','เสนอ deck'] },
  { key:'negotiate', han:'會見', th:'เจรจา/พบ',
    words:['เจรจา','คุย','meeting','พบ','พูดคุย','ประชุม','negotiation','discuss','present'] },
  { key:'interview', han:'面試', th:'สมัครงาน/สัมภาษณ์',
    words:['สมัครงาน','สัมภาษณ์งาน','job interview','interview','offer งาน','คุยงานใหม่','resume','cv'] },
  { key:'client-sales', han:'求財', th:'พบลูกค้า/ขายของ',
    words:['พบลูกค้า','คุยลูกค้า','เสนอราคา','ปิดการขาย','ขายของ','sales','lead','ลูกค้าใหม่','เสนอขาย','quotation'] },
  { key:'collect-money', han:'納財', th:'รับเงิน/เก็บเงิน',
    words:['รับเงิน','เก็บเงิน','รับชำระ','รับยอด','เก็บยอด','cash collection','รับโอน'] },
  { key:'debt-followup', han:'索債', th:'ทวงหนี้/ตามเงิน',
    words:['ทวงหนี้','ตามเงิน','ตามยอด','ลูกหนี้','เร่งจ่าย','debt collection','follow up payment'] },
  { key:'pay-transfer', han:'出財', th:'จ่ายเงิน/โอน',
    words:['จ่ายเงิน','โอนเงิน','จ่าย supplier','จ่ายซัพพลายเออร์','ปิดยอด','pay supplier','transfer money'] },
  { key:'invest', han:'財貨', th:'ลงทุน/ซื้อ',
    words:['ลงทุน','ซื้อ','หุ้น','crypto','ทอง','property','invest','buy','รถ','บ้าน','condo','asset','พอร์ต','stock'] },
  { key:'hire-onboard', han:'受聘', th:'จ้าง/รับพนักงาน',
    words:['จ้างพนักงาน','รับพนักงาน','เซ็นสัญญาจ้าง','onboard','onboarding','hire','employment contract'] },
  { key:'take-position', han:'上任', th:'รับตำแหน่ง/เริ่มงานวันแรก',
    words:['รับตำแหน่ง','เริ่มงานวันแรก','ขึ้นตำแหน่ง','รับบทบาทใหม่','ceo','cfo','manager','director','上任','赴任'] },
  { key:'board-meeting', han:'會親友', th:'ประชุมใหญ่/Board',
    words:['ประชุมใหญ่','board meeting','ประชุมบอร์ด','agm','town hall','คณะกรรมการ'] },
  { key:'ship-goods', han:'出貨', th:'ออกของ/ส่งของ',
    words:['ส่งของ','ออกของ','ส่งสินค้า','shipment','ship goods','dispatch','กระจายของ'] },
  { key:'wedding', han:'嫁娶', th:'แต่งงาน/หมั้น',
    words:['แต่งงาน','หมั้น','รดน้ำ','wedding','propose','marriage','wed','sin sod','สินสอด','ขันหมาก'] },
  { key:'surgery', han:'手術', th:'ผ่าตัดแบบเลือกเวลาได้',
    words:['ผ่าตัด','surgery','operation','elective','เข้าห้องผ่าตัด'] },
  { key:'medical-visit', han:'求醫', th:'พบแพทย์/รักษา',
    words:['พบแพทย์','นัดหมอ','ตรวจสุขภาพ','ตรวจโรค','หาหมอ','พบหมอ','medical appointment'] },
  { key:'health', han:'求醫', th:'รักษา/ผ่าตัด',
    words:['ผ่าตัด','รักษา','หมอ','surgery','medical','โรค','ป่วย','operation','คลอด','give birth'] },
  { key:'exam-study', han:'考試', th:'สอบ/สมัครเรียน',
    words:['สอบ','สมัครเรียน','สมัครสอบ','exam','entrance exam','test','เริ่มคอร์ส','ลงคอร์ส','เข้าเรียน'] },
  { key:'study', han:'入學', th:'เริ่มเรียน/สอบ',
    words:['เรียน','สอบ','เริ่มเรียน','enroll','exam','study','school','university','course','คอร์ส'] },
  { key:'ritual', han:'祭祀', th:'พิธีกรรม/ไหว้',
    words:['ไหว้','บวงสรวง','ศาล','พระ','prayer','ritual','ceremony','พิธี','ทำบุญ','blessing','ทำขวัญ'] },
  { key:'haircut', han:'剃頭', th:'ตัดผม',
    words:['ตัดผม','โกน','haircut','barber','รักษาผม'] },
  { key:'authority', han:'求官', th:'ขออำนาจ/ตำแหน่ง',
    words:['โปรโมท','promotion','authority','รัฐ','ขออำนาจ','ตำแหน่งงาน'] },
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

const _cache = new Map<string, { activity: string; han: string; th: string; reason: string; profile_key?: string; expires: number }>();
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
      return NextResponse.json({ ...cached, profile_key: cached.profile_key || PROFILE_KEY_MAP[cached.activity] || null, ui_act: UI_BUTTON_MAP[cached.activity] || cached.activity, source: 'cache', confidence: 0.95 });
    }

    // Layer 1 · keyword match (instant)
    const kw = keywordMatch(query);
    if (kw) {
      return NextResponse.json({
        activity: kw.key, ui_act: UI_BUTTON_MAP[kw.key] || kw.key,
        profile_key: PROFILE_KEY_MAP[kw.key] || null,
        han: kw.han, th: kw.th,
        source: 'keyword', confidence: 0.85,
        reason: `จับคีย์เวิร์ด: ${kw.matched.join(', ')} → ${kw.han}`,
      });
    }

    // Layer 2 · AI fallback (Claude Max CLI · best-effort · timeout 8s)
    // 1 มิ.ย. · AI fallback ต้อง login (กัน guest spawn Claude ฟรี · keyword Layer1 + default Layer3 ยังเปิด guest)
    const _aiSes = await (await import("@/lib/auth")).getSession();
    if (_aiSes) try {
      const { spawn } = await import('child_process');
      const { loadPromptMd } = await import('@/lib/prompt-md');
      /* 25 พ.ค. · prompt ย้ายไป prompts/activity-classify.md (แก้ผ่าน /admin/sifu-prompts) · {{QUERY}}=dynamic · fallback กันพัง */
      const ACTIVITY_FALLBACK = `Activity classifier for Chinese date selection. User said: "{{QUERY}}"\nPick ONE activity from this list (return JSON only):\n- break-ground (動土 ก่อสร้าง)\n- renovate (修造 รีโนเวท)\n- sign-contract (立約 เซ็นสัญญา)\n- close-deal (立券交易 ปิดดีล)\n- permit-license (上書 ขอใบอนุญาต)\n- loan-credit (求財 ขอกู้/เครดิต)\n- move-in (入宅 ย้ายบ้าน)\n- office-move (移徙 ย้ายออฟฟิศ)\n- open-shop (開市 เปิดกิจการ)\n- open-project (開業 เปิดโปรเจกต์/เปิดตัว)\n- travel (出行 เดินทาง)\n- long-travel (出行 เดินทางไกล)\n- negotiate (會見 เจรจา/พบ)\n- meet-senior (見貴 พบผู้ใหญ่)\n- ask-favor (求人 ขอความช่วยเหลือ)\n- partner-meeting (結交 พบพันธมิตร)\n- pitch-present (上陳 pitch/นำเสนอ)\n- interview (面試 สมัครงาน/สัมภาษณ์)\n- client-sales (求財 พบลูกค้า/ขายของ)\n- collect-money (納財 รับเงิน)\n- debt-followup (索債 ทวงหนี้/ตามเงิน)\n- pay-transfer (出財 จ่ายเงิน/โอน)\n- invest (財貨 ลงทุน/ซื้อ)\n- ship-goods (出貨 ส่งของ)\n- hire-onboard (受聘 จ้าง/รับพนักงาน)\n- take-position (上任 รับตำแหน่ง/เริ่มงานวันแรก)\n- board-meeting (會親友 ประชุมใหญ่/board)\n- wedding (嫁娶 แต่งงาน)\n- health (求醫 รักษา)\n- medical-visit (求醫 พบแพทย์)\n- surgery (手術 ผ่าตัดแบบเลือกเวลาได้)\n- study (入學 เรียน)\n- exam-study (考試 สอบ/สมัครเรียน)\n- ritual (祭祀 พิธี)\n- haircut (剃頭 ตัดผม)\n- authority (求官 ขออำนาจ/ตำแหน่ง)\nReturn JSON: {"activity":"key","reason":"why in Thai 1 line"}`;
      const prompt = loadPromptMd("prompts/activity-classify.md", ACTIVITY_FALLBACK).replace("{{QUERY}}", () => query);
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
          const resp = { activity: match.key, profile_key: PROFILE_KEY_MAP[match.key] || undefined, han: match.han, th: match.th, reason: aiReason || `AI: ${match.han}` };
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
      profile_key: 'sign_contract',
      han: '立約', th: 'เซ็นสัญญา (default)',
      source: 'default', confidence: 0.3,
      reason: 'ไม่จับคีย์เวิร์ด · AI ไม่ตอบ · ใช้ default · กรุณาเลือกจากปุ่ม',
    });
  } catch (e: unknown) {
    console.error("[activity-classify]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
