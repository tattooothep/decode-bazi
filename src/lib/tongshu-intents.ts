/**
 * tongshu-intents.ts · 19 พ.ค. 2026 · spec #2 อากง·อาม่า·อาเจ๊กฮ้ง
 *
 * 15 หมวดจุดประสงค์ใน /calendar
 * Map zh ↔ th/en · 3 ภาษา · 5 กลุ่ม
 *
 * สูตร tier:
 *   ถ้าหมวดอยู่ใน ji หรือ Day Officer ห้าม → 'bad'
 *   ถ้าหมวดอยู่ใน yi และไม่มี hard block → 'good'
 *   อย่างอื่น → 'neutral'
 *
 * Hard block (cap tier):
 *   月破·歲破·日破·四離·四絕 · 日支沖
 *   กิจกรรมมงคล → cap 'neutral'
 *   กิจกรรมรื้อ/เคลียร์ → ยังคง 'good' ได้
 */

export type Tier = 'good' | 'neutral' | 'bad';

export interface IntentMeta {
  id: string;
  group: 'work' | 'wealth' | 'love' | 'home' | 'travel';
  icon: string;
  label_th: string;
  label_en: string;
  label_zh: string;
  label_cn: string;
  label_vi: string;
  label_ja: string;
  label_ko: string;
  label_ru: string;
  label_es: string;
  /* คำจีนของ tyme4ts ที่ map → tier nice */
  zh_keys: string[];
  /* true = กิจกรรมรื้อ/เคลียร์ · ไม่ต้อง block ด้วย日破·月破 */
  is_destruction?: boolean;
}

export const INTENTS: IntentMeta[] = [
  /* กลุ่ม 1 · งาน · 4 หมวด */
  { id:'start_work', group:'work', icon:'🎯', label_th:'เริ่มงานใหม่', label_en:'Start work', label_zh:'就職', label_cn:'就职', label_vi:'Bắt đầu công việc', label_ja:'仕事を始める', label_ko:'새 일 시작', label_ru:'Начать работу', label_es:'Empezar trabajo', zh_keys:['赴任','就職','就职','開工','开工','上任'] },
  { id:'sign_contract', group:'work', icon:'📝', label_th:'เซ็นสัญญา', label_en:'Sign contract', label_zh:'立券', label_cn:'立券', label_vi:'Ký hợp đồng', label_ja:'契約', label_ko:'계약', label_ru:'Подписать договор', label_es:'Firmar contrato', zh_keys:['立券','立卷','訂盟','订盟'] },
  { id:'open_business', group:'work', icon:'🏪', label_th:'เปิดกิจการ', label_en:'Open business', label_zh:'開市', label_cn:'开市', label_vi:'Khai trương', label_ja:'開業', label_ko:'개업', label_ru:'Открыть дело', label_es:'Abrir negocio', zh_keys:['開市','开市','開業','开业','開張','开张'] },
  { id:'negotiate', group:'work', icon:'🤝', label_th:'เจรจาธุรกิจ', label_en:'Negotiate', label_zh:'交易', label_cn:'交易', label_vi:'Đàm phán', label_ja:'交渉', label_ko:'협상', label_ru:'Переговоры', label_es:'Negociar', zh_keys:['交易','會親友','会亲友','立卷','立券'] },

  /* กลุ่ม 2 · เงิน · 2 หมวด */
  { id:'invest', group:'wealth', icon:'💵', label_th:'รับทรัพย์/ลงทุน', label_en:'Wealth/Invest', label_zh:'納財', label_cn:'纳财', label_vi:'Tài lộc/Đầu tư', label_ja:'財運・投資', label_ko:'재물·투자', label_ru:'Доход/Инвестиции', label_es:'Riqueza/Inversión', zh_keys:['納財','纳财','求財','求财'] },
  { id:'loan', group:'wealth', icon:'🏦', label_th:'กู้ยืม/ธุรกรรม', label_en:'Loan/Transaction', label_zh:'立券', label_cn:'立券', label_vi:'Vay/Giao dịch', label_ja:'融資・取引', label_ko:'대출·거래', label_ru:'Заём/Сделка', label_es:'Préstamo/Transacción', zh_keys:['立券','立卷','交易'] },

  /* กลุ่ม 3 · รัก · 3 หมวด */
  { id:'marriage', group:'love', icon:'💒', label_th:'แต่งงาน', label_en:'Marriage', label_zh:'嫁娶', label_cn:'嫁娶', label_vi:'Kết hôn', label_ja:'結婚', label_ko:'결혼', label_ru:'Брак', label_es:'Matrimonio', zh_keys:['嫁娶','結婚','结婚','成親','成亲'] },
  { id:'engagement', group:'love', icon:'💍', label_th:'หมั้น/สู่ขอ', label_en:'Engagement', label_zh:'納采', label_cn:'纳采', label_vi:'Đính hôn', label_ja:'婚約', label_ko:'약혼', label_ru:'Помолвка', label_es:'Compromiso', zh_keys:['納采','纳采','訂盟','订盟','合婚'] },
  { id:'gathering', group:'love', icon:'🎉', label_th:'พบผู้ใหญ่/งานเลี้ยง', label_en:'Gathering', label_zh:'會親友', label_cn:'会亲友', label_vi:'Gặp gỡ/Tiệc', label_ja:'会合・宴会', label_ko:'모임·연회', label_ru:'Встреча/Приём', label_es:'Reunión/Fiesta', zh_keys:['會親友','会亲友','宴會','宴会'] },

  /* กลุ่ม 4 · บ้าน · 4 หมวด */
  { id:'move_house', group:'home', icon:'🏠', label_th:'ขึ้นบ้าน/ย้ายบ้าน', label_en:'Move house', label_zh:'入宅', label_cn:'入宅', label_vi:'Dọn nhà', label_ja:'引越し', label_ko:'이사', label_ru:'Переезд', label_es:'Mudanza', zh_keys:['入宅','移徙'] },
  { id:'construct', group:'home', icon:'🧱', label_th:'ก่อสร้าง/ลงเสา', label_en:'Construction', label_zh:'動土', label_cn:'动土', label_vi:'Khởi công', label_ja:'着工', label_ko:'착공', label_ru:'Строительство', label_es:'Construcción', zh_keys:['動土','动土','起基','上樑','上梁','豎柱','竖柱'] },
  { id:'renovate', group:'home', icon:'🔧', label_th:'ซ่อมแซม/ตกแต่ง', label_en:'Renovate', label_zh:'修造', label_cn:'修造', label_vi:'Sửa chữa', label_ja:'改修', label_ko:'수리', label_ru:'Ремонт', label_es:'Renovar', zh_keys:['修造','修飾垣牆','修饰垣墙','修屋'] },
  { id:'install_bed', group:'home', icon:'🛏️', label_th:'ตั้งเตียง', label_en:'Install bed', label_zh:'安床', label_cn:'安床', label_vi:'Kê giường', label_ja:'安床', label_ko:'침대 설치', label_ru:'Установка кровати', label_es:'Instalar cama', zh_keys:['安床'] },

  /* กลุ่ม 5 · เดินทาง/สุขภาพ · 2 หมวด */
  { id:'travel', group:'travel', icon:'🚗', label_th:'เดินทาง/ออกรถ', label_en:'Travel', label_zh:'出行', label_cn:'出行', label_vi:'Đi xa', label_ja:'外出', label_ko:'여행', label_ru:'Поездка', label_es:'Viajar', zh_keys:['出行','遠行','远行','納畜','纳畜'] },
  { id:'pray_heal', group:'travel', icon:'🙏', label_th:'ไหว้พระ/หาหมอ/เคลียร์', label_en:'Pray/Heal/Cleanse', label_zh:'祈福', label_cn:'祈福', label_vi:'Cầu phúc/Chữa lành', label_ja:'祈願・治療', label_ko:'기도·치유', label_ru:'Молитва/Исцеление', label_es:'Orar/Sanar', zh_keys:['祈福','祭祀','求醫','求医','治病','解除','破屋'], is_destruction: true },
  /* 1 มิ.ย. · เพิ่มสัญญาณสุขภาพให้เป้า 健 ไม่ bias จาก tag เดียว (พ่อ/Codex สั่ง) · คำที่ pray_heal ยังไม่ครอบ · is_destruction (วันร้ายยังรักษาได้) */
  { id:'medical', group:'travel', icon:'🩺', label_th:'รักษา/พบแพทย์/พักฟื้น', label_en:'Medical/Recover', label_zh:'療病', label_cn:'疗病', label_vi:'Điều trị/Phục hồi', label_ja:'治療・回復', label_ko:'치료·회복', label_ru:'Лечение/Восстановление', label_es:'Tratamiento/Recuperación', zh_keys:['探病','針灸','针灸','服藥','服药','療目','疗目','整手足甲'], is_destruction: true },
];

const HARD_BLOCK_GODS = new Set(['月破','岁破','歲破','日破','四離','四绝','四絕','四离']);

/**
 * computeIntentStatus · ต่อ 1 วัน · คืนค่า map id → tier
 *
 * @param yi  รายการ宜 จาก tyme4ts (string[])
 * @param ji  รายการ忌 จาก tyme4ts
 * @param godsBad  รายการดาวร้ายของวัน (มี月破·四離·...)
 * @param dayBranchClashUserBranch  วันชง user (boolean · ถ้า user known) — optional
 */
export function computeIntentStatus(
  yi: string[],
  ji: string[],
  godsBad: string[] = [],
  dayBranchClashUserBranch = false,
): Record<string, Tier> {
  const yiSet = new Set(yi);
  const jiSet = new Set(ji);
  const hasHardBlock = godsBad.some(g => HARD_BLOCK_GODS.has(g));
  const hasUserClash = dayBranchClashUserBranch;

  const out: Record<string, Tier> = {};
  for (const intent of INTENTS) {
    const inYi = intent.zh_keys.some(k => yiSet.has(k));
    const inJi = intent.zh_keys.some(k => jiSet.has(k));

    let tier: Tier;
    if (inJi) tier = 'bad';
    else if (inYi) tier = 'good';
    else tier = 'neutral';

    /* hard block cap · กิจกรรมมงคล → cap neutral · ยกเว้นกิจกรรมรื้อ */
    if ((hasHardBlock || hasUserClash) && tier === 'good' && !intent.is_destruction) {
      tier = 'neutral';
    }

    out[intent.id] = tier;
  }
  return out;
}

/**
 * pickTopWorst · เลือก top 2-3 + worst 1 สำหรับการ์ดวัน
 */
export function pickTopWorst(
  status: Record<string, Tier>,
): { top: Array<{id:string, tier:Tier, icon:string}>, worst: Array<{id:string, tier:Tier, icon:string}> } {
  const good: typeof INTENTS = [];
  const bad: typeof INTENTS = [];
  for (const intent of INTENTS) {
    if (status[intent.id] === 'good') good.push(intent);
    else if (status[intent.id] === 'bad') bad.push(intent);
  }
  return {
    top: good.slice(0, 3).map(i => ({ id:i.id, tier:'good', icon:i.icon })),
    worst: bad.slice(0, 1).map(i => ({ id:i.id, tier:'bad', icon:i.icon })),
  };
}
