/**
 * 神煞 dict v1.1 · ตำราอาเจ๊กฮ้ง (协纪辨方书)
 * Source: /var/www/hourkey/docs/จากอาเจ๊กฮ้งถึงสุดหล่อข้อมูลดาวนะ.md
 *
 * Compiled: 2026-05-18 · 110+ stars · 6 Tier · classical rule aware
 * Score scale: ±5 (微) → ±30 (大吉/大凶)
 */

export type StarSeverity = 'minor' | 'medium' | 'major' | 'fatal' | 'virtue' | 'conditional';
export type StarSystem   = 'huangdao' | 'jianchu' | 'ri_jia' | 'personal';

export type StarEntry = {
  han: string;
  han_trad?: string;
  name_th: string;
  weight: number;
  desc_th: string;
  severity: StarSeverity;
  system: StarSystem;
  do_th?: string[];
  avoid_th?: string[];
};

export const STAR_DICT_TH: Record<string, StarEntry> = {
  /* ═══════ 黄道吉星 (Yellow Path · 6 ดี) ═══════ */
  '青龍':    { han:'青龙', han_trad:'青龍', name_th:'ดาวมังกรเขียว',   weight:+25, severity:'major',   system:'huangdao', desc_th:'ดาวขุนนาง · กิจการสำเร็จทั้งหมด · เริ่มงานใหญ่ได้' },
  '明堂':    { han:'明堂', name_th:'ดาวพระโรง',                     weight:+20, severity:'medium',  system:'huangdao', desc_th:'ดาวขุนนางมงคล · พบผู้ใหญ่ดี · ส่งเสริมยศ' },
  '金匱':    { han:'金匮', han_trad:'金匱', name_th:'ดาวคลังทอง',     weight:+25, severity:'major',   system:'huangdao', desc_th:'ดาวการเงิน · เหมาะแต่งงาน·เก็บทรัพย์·ทำสัญญา' },
  '玉堂':    { han:'玉堂', name_th:'ดาวพระโรงหยก',                   weight:+20, severity:'medium',  system:'huangdao', desc_th:'ความสุข·เอกสาร·มงคล·ฝังศพ' },
  '司命':    { han:'司命', name_th:'ดาวผู้กำหนดชะตา',                weight:+15, severity:'conditional', system:'huangdao', desc_th:'寅-申吉 / 酉-丑凶 · กลางวันดี กลางคืนระวัง' },

  /* ═══════ 黑道凶星 (Black Path · 6 ร้าย) ═══════ */
  '天刑':    { han:'天刑', name_th:'ดาวอาญาฟ้า',                    weight:-20, severity:'major',   system:'huangdao', desc_th:'ใช้ได้แค่ออกรบ · ห้ามคดีความ·เริ่มงานเปิดเผย' },
  '朱雀':    { han:'朱雀', name_th:'ดาวนกแดง',                      weight:-20, severity:'major',   system:'huangdao', desc_th:'ปากเสียง · ห้ามฟ้องร้อง·เจรจาขัดแย้ง' },
  '白虎':    { han:'白虎', name_th:'ดาวเสือขาว',                    weight:-25, severity:'major',   system:'huangdao', desc_th:'ปากเสียง · ใช้ได้แค่ล่า·บูชา · เสี่ยงเลือด' },
  '天牢':    { han:'天牢', name_th:'ดาวคุกฟ้า',                     weight:-20, severity:'major',   system:'huangdao', desc_th:'ห้ามทำกิจกรรมเปิดเผย · เสี่ยงถูกจองจำ' },
  '玄武':    { han:'玄武', name_th:'ดาวเต่าดำ',                     weight:-25, severity:'major',   system:'huangdao', desc_th:'โจรเข้าบ้าน · ห้ามคดี·พนัน·ลงเอกสาร' },
  '元武':    { han:'元武', name_th:'ดาวเต่าดำ (元)',                weight:-25, severity:'major',   system:'huangdao', desc_th:'พลังเดียวกับ 玄武 · ระวังเล่ห์กลโจร' },
  '勾陳':    { han:'勾陈', han_trad:'勾陳', name_th:'ดาวขอเกี่ยว',   weight:-20, severity:'major',   system:'huangdao', desc_th:'ติดขัด · ห้ามเริ่มสำคัญ · ระวังเอกสารผูกพัน' },

  /* ═══════ 建除12神 (Day Officer) ═══════ */
  '建': { han:'建', name_th:'สร้าง·ก่อ',        weight:+10, severity:'minor',  system:'jianchu', desc_th:'พลังเริ่มต้น · เหมาะพิธีเปิด·ก่อตั้ง', do_th:['เริ่มต้น','พิธีเปิด'], avoid_th:['ทำลาย','เดินทาง'] },
  '除': { han:'除', name_th:'ขจัด',             weight:+15, severity:'medium', system:'jianchu', desc_th:'กำจัดสิ่งไม่ดี · รักษาโรค · ทำความสะอาด', do_th:['รักษาโรค','ทำความสะอาด'] },
  '滿': { han:'满', han_trad:'滿', name_th:'เต็ม', weight:+5,  severity:'minor',  system:'jianchu', desc_th:'พลังครบ · เหมาะงานเลี้ยง·เก็บเกี่ยว', do_th:['งานเลี้ยง','เก็บเกี่ยว'], avoid_th:['เริ่มงาน'] },
  '平': { han:'平', name_th:'เสมอ',             weight:+10, severity:'minor',  system:'jianchu', desc_th:'สมดุล · เหมาะงานทั่วไป·ทำสัญญา·ปลูกพืช', do_th:['งานทั่วไป','ทำสัญญา','ปลูกพืช'] },
  '定': { han:'定', name_th:'กำหนด',            weight:+15, severity:'medium', system:'jianchu', desc_th:'มั่นคง · เหมาะหมั้น·สัญญา·ลงทุน', do_th:['หมั้น','สัญญา','ลงทุน'], avoid_th:['ฟ้องร้อง'] },
  '執': { han:'执', han_trad:'執', name_th:'ยึด', weight:+5,  severity:'minor',  system:'jianchu', desc_th:'พลังยึดมั่น · เหมาะเก็บของ·จับคุม', do_th:['เก็บของ','จับคุม'], avoid_th:['เคลื่อนย้าย'] },
  '破': { han:'破', name_th:'ทำลาย',            weight:-25, severity:'fatal',  system:'jianchu', desc_th:'พลังพังทลาย · ห้ามมงคลทุกอย่าง ใช้ได้แค่รื้อถอน', do_th:['รื้อถอน'], avoid_th:['มงคลทุกชนิด'] },
  '危': { han:'危', name_th:'อันตราย',          weight:-20, severity:'major',  system:'jianchu', desc_th:'เสี่ยง · ห้ามเดินทาง·ขึ้นที่สูง·ขุดดิน', avoid_th:['เดินทาง','ขึ้นสูง','ขุดดิน'] },
  '成': { han:'成', name_th:'สำเร็จ',           weight:+20, severity:'major',  system:'jianchu', desc_th:'พลังสำเร็จ · ทำกิจกรรมมงคลได้ทุกชนิด', do_th:['มงคลทุกชนิด'] },
  '收': { han:'收', name_th:'เก็บ',             weight:+10, severity:'minor',  system:'jianchu', desc_th:'พลังเก็บกัก · เหมาะเก็บทรัพย์·ปิดบัญชี', do_th:['เก็บทรัพย์','ปิดบัญชี'], avoid_th:['เริ่มใหม่'] },
  '開': { han:'开', han_trad:'開', name_th:'เปิด', weight:+20, severity:'major',  system:'jianchu', desc_th:'พลังเปิด · เหมาะเปิดร้าน·เริ่มเรียน·พิธีเปิด', do_th:['เปิดร้าน','เริ่มเรียน'], avoid_th:['ฝังศพ'] },
  '閉': { han:'闭', han_trad:'閉', name_th:'ปิด', weight:-15, severity:'medium', system:'jianchu', desc_th:'พลังอุดตัน · เหมาะปิดธุรกิจ·ออม·อุดรู ห้ามเริ่มงานใหญ่', do_th:['ปิดธุรกิจ','ออมเงิน','อุดรู'], avoid_th:['เริ่มงานใหญ่','เปิดร้าน'] },

  /* ═══════ Tier S · Virtue (+25~+30 · override Tier-A negatives) ═══════ */
  '天德':    { han:'天德', name_th:'ดาวคุณธรรมฟ้า',         weight:+30, severity:'virtue', system:'ri_jia', desc_th:'มงคลสูงสุด · override ดาวร้ายได้ · เริ่มงานใหญ่ทุกชนิด' },
  '月德':    { han:'月德', name_th:'ดาวคุณธรรมเดือน',       weight:+25, severity:'virtue', system:'ri_jia', desc_th:'มงคลทุกเรื่อง · override ดาวร้ายปกติได้' },
  '天德合':  { han:'天德合', name_th:'คุณธรรมฟ้ารวม',       weight:+25, severity:'virtue', system:'ri_jia', desc_th:'เสริม 天德 · พลังคุณธรรมรวม' },
  '月德合':  { han:'月德合', name_th:'คุณธรรมเดือนรวม',     weight:+20, severity:'virtue', system:'ri_jia', desc_th:'เสริม 月德' },
  '天恩':    { han:'天恩', name_th:'ดาวพระคุณฟ้า',           weight:+25, severity:'virtue', system:'ri_jia', desc_th:'ขอพร·ปลดหนี้·รับความช่วยเหลือ' },
  '天赦':    { han:'天赦', name_th:'ดาวอภัยฟ้า',            weight:+30, severity:'virtue', system:'ri_jia', desc_th:'Override ทุกดาวร้าย · ฟ้าให้อภัย·สลายโทษ' },
  '天願':    { han:'天愿', han_trad:'天願', name_th:'ดาวสมปรารถนา', weight:+25, severity:'virtue', system:'ri_jia', desc_th:'ขอพร·บูชา·สาบาน·พิธีกรรม' },

  /* ═══════ Tier A · Major Auspicious (+15~+20) ═══════ */
  '月恩':    { han:'月恩', name_th:'ดาวพระคุณเดือน',         weight:+20, severity:'major', system:'ri_jia', desc_th:'รับความช่วยเหลือจากญาติ·เพื่อนสนิท' },
  '四相':    { han:'四相', name_th:'ดาวสี่ฤดู',             weight:+20, severity:'major', system:'ri_jia', desc_th:'พลังครบ 4 ฤดู · เหมาะเริ่มกิจการครอบคลุม' },
  '王日':    { han:'王日', name_th:'ดาววันราชา',            weight:+20, severity:'major', system:'ri_jia', desc_th:'พลังเด่น·มีอำนาจ · เหมาะตัดสินใจใหญ่' },
  '官日':    { han:'官日', name_th:'ดาววันขุนนาง',          weight:+20, severity:'major', system:'ri_jia', desc_th:'เหมาะรับตำแหน่ง·ขออนุญาต' },
  '天醫':    { han:'天医', han_trad:'天醫', name_th:'ดาวหมอเทพ', weight:+20, severity:'major', system:'ri_jia', desc_th:'มงคลสูงสุดสำหรับรักษา · เหมาะหาหมอ·ผ่าตัด', do_th:['รักษาโรค','หาหมอ'] },
  '福德':    { han:'福德', name_th:'ดาวบุญบารมี',            weight:+20, severity:'major', system:'ri_jia', desc_th:'เสริมบุญบารมี·เหมาะพิธีมงคล·การศึกษา' },
  '三合':    { han:'三合', name_th:'ดาวสามผสาน',            weight:+20, severity:'major', system:'ri_jia', desc_th:'พลังธาตุครบ · พันธมิตรช่วยเหลือ', do_th:['ร่วมหุ้น','แต่งงาน'] },
  '時德':    { han:'时德', han_trad:'時德', name_th:'ดาวคุณธรรมเวลา', weight:+15, severity:'medium', system:'ri_jia', desc_th:'พลังเวลาเป็นใจ · เหมาะตัดสินใจ·ลงนาม' },
  '陽德':    { han:'阳德', han_trad:'陽德', name_th:'ดาวคุณธรรมหยาง', weight:+15, severity:'medium', system:'ri_jia', desc_th:'พลังหยางเสริม · เหมาะกิจกรรมเปิดเผย·ออกหน้า' },
  '陰德':    { han:'阴德', han_trad:'陰德', name_th:'ดาวคุณธรรมหยิน', weight:+15, severity:'medium', system:'ri_jia', desc_th:'พลังหยินเสริม · เหมาะงานเงียบ·ปกป้องลับ' },
  '守日':    { han:'守日', name_th:'ดาววันรักษา',           weight:+15, severity:'medium', system:'ri_jia', desc_th:'รักษา·ป้องกัน · ไม่เริ่มใหม่' },
  '相日':    { han:'相日', name_th:'ดาววันเสนาบดี',         weight:+15, severity:'medium', system:'ri_jia', desc_th:'ช่วยเหลือผู้อื่น·ส่งเสริมงาน' },
  '民日':    { han:'民日', name_th:'ดาววันราษฎร์',          weight:+15, severity:'medium', system:'ri_jia', desc_th:'เหมาะกิจกรรมทั่วไป·ของชาวบ้าน' },
  '天巫':    { han:'天巫', name_th:'ดาวหมอผี',              weight:+15, severity:'medium', system:'ri_jia', desc_th:'เหมาะพิธีกรรม·ทำบุญ·สื่อทางวิญญาณ' },
  '福生':    { han:'福生', name_th:'ดาวก่อโชค',             weight:+15, severity:'medium', system:'ri_jia', desc_th:'เหมาะทำบุญ·อธิษฐาน·ปลุกเสกของมงคล', do_th:['ทำบุญ','อธิษฐาน'] },
  '福星':    { han:'福星', name_th:'ดาวความสุข',            weight:+15, severity:'medium', system:'ri_jia', desc_th:'เหมาะจัดงานเลี้ยง·เฉลิมฉลอง', do_th:['งานเลี้ยง'] },
  '聖心':    { han:'圣心', han_trad:'聖心', name_th:'ดาวใจศักดิ์สิทธิ์', weight:+15, severity:'medium', system:'ri_jia', desc_th:'จิตใจสงบ·เหมาะภาวนา·บวงสรวง' },
  '益後':    { han:'益后', han_trad:'益後', name_th:'ดาวเสริมลูกหลาน', weight:+15, severity:'medium', system:'ri_jia', desc_th:'เหมาะขอลูก·พิธีรับขวัญ·สร้างมรดก' },
  '續世':    { han:'续世', han_trad:'續世', name_th:'ดาวสืบสกุล', weight:+15, severity:'medium', system:'ri_jia', desc_th:'สืบเชื้อสาย·ส่งต่อมรดก' },
  '大紅砂':  { han:'大红砂', han_trad:'大紅砂', name_th:'ดาวมงคลใหญ่แดง', weight:+15, severity:'medium', system:'ri_jia', desc_th:'ส่งเสริมมงคลทุกชนิด · โดยเฉพาะแต่งงาน', do_th:['แต่งงาน'] },
  '六合':    { han:'六合', name_th:'ดาวหกผสาน',             weight:+15, severity:'medium', system:'ri_jia', desc_th:'คู่จับคู่ผสานพลัง · เหมาะคบคน·พบเพื่อน' },
  '母倉':    { han:'母仓', han_trad:'母倉', name_th:'ดาวคลังแม่', weight:+15, severity:'medium', system:'ri_jia', desc_th:'เก็บเกี่ยว·สะสมทรัพย์ · เหมาะปลูกพืช·เลี้ยงสัตว์' },
  '生氣':    { han:'生气', han_trad:'生氣', name_th:'ดาวพลังชีวิต', weight:+15, severity:'medium', system:'ri_jia', desc_th:'พลังเริ่มใหม่·เพาะปลูก·เปิดงาน' },
  '解神':    { han:'解神', name_th:'ดาวสลาย',              weight:+15, severity:'medium', system:'ri_jia', desc_th:'แก้คดี·ปลดทุกข์·คลี่คลายเรื่องร้าย' },
  '五富':    { han:'五富', name_th:'ดาวห้าทรัพย์',          weight:+15, severity:'medium', system:'ri_jia', desc_th:'พลังทรัพย์ครบ 5 ทิศ · เหมาะลงทุน·ทำสัญญา' },
  '要安':    { han:'要安', name_th:'ดาวต้องสงบ',           weight:+15, severity:'medium', system:'ri_jia', desc_th:'เหมาะเก็บความลับ·ปกป้องบ้าน' },
  '敬安':    { han:'敬安', name_th:'ดาวเคารพสงบ',         weight:+15, severity:'medium', system:'ri_jia', desc_th:'เหมาะไหว้บรรพบุรุษ·ทำสมาธิ' },
  '驛馬':    { han:'驿马', han_trad:'驛馬', name_th:'ดาวม้าส่งสาร', weight:+10, severity:'minor', system:'ri_jia', desc_th:'เหมาะเดินทาง·เปลี่ยนงาน·ย้ายบ้าน', do_th:['เดินทาง'] },
  '日馬':    { han:'日马', han_trad:'日馬', name_th:'ดาวม้าวัน', weight:+10, severity:'minor', system:'ri_jia', desc_th:'พลังเคลื่อนไหวประจำวัน' },
  '日祿':    { han:'日禄', han_trad:'日祿', name_th:'ดาวลาภวัน', weight:+12, severity:'medium', system:'ri_jia', desc_th:'ทรัพย์มาประจำวัน · เหมาะรับเงิน·ลงทุน' },
  '日合':    { han:'日合', name_th:'ดาวผสาน',              weight:+10, severity:'minor', system:'ri_jia', desc_th:'พลังกลมกลืน · เหมาะเจรจา·ทำสัญญา' },
  '陽貴':    { han:'阳贵', han_trad:'陽貴', name_th:'ดาวเทพขุนนางหยาง', weight:+15, severity:'medium', system:'ri_jia', desc_th:'ผู้ใหญ่ช่วยกลางวัน · พบคนใหญ่' },
  '陰貴':    { han:'阴贵', han_trad:'陰貴', name_th:'ดาวเทพขุนนางหยิน', weight:+15, severity:'medium', system:'ri_jia', desc_th:'ผู้ใหญ่ช่วยกลางคืน' },
  '天乙':    { han:'天乙', name_th:'ดาวเทพขุนนางสูงสุด',   weight:+18, severity:'major', system:'ri_jia', desc_th:'ดาวขุนนางใหญ่ที่สุด · ช่วยพ้นภัย·แก้คดี' },
  '陽貴登天':{ han:'阳贵登天', han_trad:'陽貴登天', name_th:'หยางขุนนางขึ้นสวรรค์', weight:+18, severity:'major', system:'ri_jia', desc_th:'พลังขุนนางหยางขึ้นสูงสุด' },
  '陰貴登天':{ han:'阴贵登天', han_trad:'陰貴登天', name_th:'หยินขุนนางขึ้นสวรรค์', weight:+18, severity:'major', system:'ri_jia', desc_th:'พลังขุนนางหยินขึ้นสูงสุด' },
  '喜神':    { han:'喜神', name_th:'เทพแห่งความสุข',       weight:+15, severity:'medium', system:'ri_jia', desc_th:'ทิศมงคลพิเศษ · เหมาะแต่งงาน·เริ่มความรัก' },
  '財神':    { han:'财神', han_trad:'財神', name_th:'เทพแห่งทรัพย์', weight:+15, severity:'medium', system:'ri_jia', desc_th:'ทิศทรัพย์ · เหมาะลงทุน·เปิดร้าน' },
  '福神':    { han:'福神', name_th:'เทพแห่งบุญ',           weight:+12, severity:'medium', system:'ri_jia', desc_th:'ทิศบุญ · เหมาะทำบุญ·พิธีกรรม' },
  '天喜':    { han:'天喜', name_th:'ดาวยินดี',              weight:+15, severity:'medium', system:'ri_jia', desc_th:'ความยินดีมาเยือน · เหมาะหมั้น·แต่งงาน' },
  '吉期':    { han:'吉期', name_th:'ดาวฤกษ์มงคล',          weight:+12, severity:'medium', system:'ri_jia', desc_th:'ฤกษ์ดี · เริ่มงานพิธีกรรม·มงคล' },

  /* ═══════ Tier B · Minor Auspicious (+5~+10) ═══════ */
  '玉宇':    { han:'玉宇', name_th:'ดาวพระตำหนัก',         weight:+10, severity:'minor', system:'ri_jia', desc_th:'เหมาะสร้างวัด·ตั้งศาล·พิธีกรรม' },
  '金堂':    { han:'金堂', name_th:'ดาวห้องทอง',           weight:+10, severity:'minor', system:'ri_jia', desc_th:'เหมาะตั้งบ้าน·ขึ้นบ้านใหม่' },
  '鳴吠':    { han:'鸣吠', han_trad:'鳴吠', name_th:'ดาวเสียงสุนัข', weight:+10, severity:'minor', system:'ri_jia', desc_th:'เหมาะฝังศพ·พิธีรำลึก' },
  '鳴吠對':  { han:'鸣吠对', han_trad:'鳴吠對', name_th:'ดาวเสียงสุนัขคู่', weight:+10, severity:'minor', system:'ri_jia', desc_th:'พลังคู่ของ 鳴吠 · เหมาะพิธีศพ' },
  '五合':    { han:'五合', name_th:'ดาวห้าผสาน',           weight:+10, severity:'minor', system:'ri_jia', desc_th:'พลังห้าธาตุครบ · เหมาะพบปะ·เจรจา' },
  '時陽':    { han:'时阳', han_trad:'時陽', name_th:'ดาวเวลาหยาง', weight:+10, severity:'minor', system:'ri_jia', desc_th:'พลังหยางในเวลา' },
  '時陰':    { han:'时阴', han_trad:'時陰', name_th:'ดาวเวลาหยิน', weight:+10, severity:'minor', system:'ri_jia', desc_th:'พลังหยินในเวลา' },
  '普護':    { han:'普护', han_trad:'普護', name_th:'ดาวคุ้มครองทั่ว', weight:+10, severity:'minor', system:'ri_jia', desc_th:'ปกป้องจากภัย·เหมาะออกเดินทาง' },
  '益氣':    { han:'益气', han_trad:'益氣', name_th:'ดาวเสริมพลัง', weight:+10, severity:'minor', system:'ri_jia', desc_th:'พลังเสริม · เหมาะออกกำลัง·ฝึกฝน' },
  '喝散':    { han:'喝散', name_th:'ดาวขับสลาย',           weight:+10, severity:'minor', system:'ri_jia', desc_th:'สลายสิ่งร้าย · เหมาะปลดเปลื้อง' },
  '兵寶':    { han:'兵宝', han_trad:'兵寶', name_th:'ดาวอาวุธมงคล', weight:+10, severity:'minor', system:'ri_jia', desc_th:'พลังป้องกัน · เหมาะออกรบ·ป้องกัน' },
  '除神':    { han:'除神', name_th:'ดาวขจัด',              weight:+10, severity:'minor', system:'ri_jia', desc_th:'กำจัดสิ่งร้าย · เหมาะทำความสะอาด' },
  '臨日':    { han:'临日', han_trad:'臨日', name_th:'ดาวมาเยือนวัน', weight:+10, severity:'minor', system:'ri_jia', desc_th:'พลังเสริมพิเศษ · เหมาะกิจกรรมสำคัญ' },
  '月空':    { han:'月空', name_th:'ดาวว่างเดือน',         weight:+10, severity:'minor', system:'ri_jia', desc_th:'ลบล้างพลังร้ายเดือน · เหมาะอุทิศบุญ' },
  '六儀':    { han:'六仪', han_trad:'六儀', name_th:'ดาวหกพิธี', weight:+10, severity:'minor', system:'ri_jia', desc_th:'พิธีกรรม 6 อย่างทำได้ครบ' },
  '不將':    { han:'不将', han_trad:'不將', name_th:'ดาวไร้พิษไร้ภัย', weight:+10, severity:'minor', system:'ri_jia', desc_th:'แต่งงานได้·ไม่มีอุปสรรค' },
  '寶光':    { han:'宝光', han_trad:'寶光', name_th:'แสงล้ำค่า', weight:+12, severity:'medium', system:'ri_jia', desc_th:'ดาวมงคล · เปิดงานใหม่·เผยแพร่ผลงาน' },

  /* ═══════ Tier S · Fatal (-25~-30 · cannot override) ═══════ */
  '月破':    { han:'月破', name_th:'ดาวเดือนแตก',          weight:-30, severity:'fatal', system:'ri_jia', desc_th:'พลังพังทลาย · auto-block มงคลทุกชนิด' },
  '大耗':    { han:'大耗', name_th:'ดาวสูญทรัพย์ใหญ่',     weight:-30, severity:'fatal', system:'ri_jia', desc_th:'เสียทรัพย์มาก · ห้ามลงทุน·ซื้อของใหญ่' },
  '死神':    { han:'死神', name_th:'ดาวมรณะ',              weight:-30, severity:'fatal', system:'ri_jia', desc_th:'พลังตายร้าย · auto-block มงคลทุกชนิด' },
  '荒蕪':    { han:'荒芜', han_trad:'荒蕪', name_th:'ดาวรกร้าง', weight:-30, severity:'fatal', system:'ri_jia', desc_th:'พลังว่างเปล่า·ทุกข์ยาก · ห้ามมงคลทุกชนิด' },
  '災煞':    { han:'灾煞', han_trad:'災煞', name_th:'ดาวภัยพิบัติ', weight:-25, severity:'major', system:'ri_jia', desc_th:'ภัยพิบัติ·อุบัติเหตุ · ระวังการเดินทาง·เริ่มงาน' },
  '月煞':    { han:'月煞', name_th:'ดาวเดือนร้าย',         weight:-25, severity:'major', system:'ri_jia', desc_th:'พลังเคราะห์เดือน · ห้ามแต่งงาน·เริ่มงาน' },
  '月刑':    { han:'月刑', name_th:'ดาวเดือนอาญา',         weight:-25, severity:'major', system:'ri_jia', desc_th:'พลังลงโทษ · ห้ามฟ้องร้อง·เริ่มคดี' },
  '月厭':    { han:'月厌', han_trad:'月厭', name_th:'ดาวเดือนเบื่อ', weight:-25, severity:'major', system:'ri_jia', desc_th:'พลังต่อต้าน · ห้ามแต่งงาน·เดินทาง' },
  '死氣':    { han:'死气', han_trad:'死氣', name_th:'ดาวลมหายใจสุดท้าย', weight:-25, severity:'major', system:'ri_jia', desc_th:'พลังตาย · ห้ามแต่งงาน·เริ่มงาน' },
  '四廢':    { han:'四废', han_trad:'四廢', name_th:'ดาวสี่สูญ', weight:-25, severity:'major', system:'ri_jia', desc_th:'ทำอะไรก็สูญเปล่า · ห้ามเปิดกิจการ·ซ่อมแซม' },
  '四絕':    { han:'四绝', han_trad:'四絕', name_th:'ดาวสี่ตัด', weight:-25, severity:'major', system:'ri_jia', desc_th:'พลังตัดขาด · ห้ามเดินทาง·เริ่มงานใหม่' },
  '五墓':    { han:'五墓', name_th:'ดาวห้าหลุม',           weight:-25, severity:'major', system:'ri_jia', desc_th:'พลังตาย · ห้ามแต่งงาน·เปิดกิจการ' },
  '受死':    { han:'受死', name_th:'ดาวรับตาย',            weight:-25, severity:'major', system:'ri_jia', desc_th:'พลังตายร้าย · ห้ามมงคลทุกชนิด' },
  '致死':    { han:'致死', name_th:'ดาวนำตาย',             weight:-25, severity:'major', system:'ri_jia', desc_th:'เสี่ยงตาย · ห้ามรักษาโรค·ผ่าตัด' },

  /* ═══════ Tier A · Major (-15~-20) ═══════ */
  '月害':    { han:'月害', name_th:'ดาวเดือนภัย',         weight:-20, severity:'major', system:'ri_jia', desc_th:'ทำร้ายแบบลึก · ระวังคำพูด·ความขัดแย้ง' },
  '厭對':    { han:'厌对', han_trad:'厭對', name_th:'ดาวเบื่อตรงข้าม', weight:-20, severity:'major', system:'ri_jia', desc_th:'พลังขัดแย้งคู่ · ระวังหย่าร้าง·เลิกหุ้น' },
  '招搖':    { han:'招摇', han_trad:'招搖', name_th:'ดาวคลอนแคลน', weight:-20, severity:'major', system:'ri_jia', desc_th:'ระวังคำพูดเย่อหยิ่ง·ทะเลาะ' },
  '四窮':    { han:'四穷', han_trad:'四窮', name_th:'ดาวสี่จน', weight:-20, severity:'major', system:'ri_jia', desc_th:'พลังจน · ห้ามเริ่มลงทุน' },
  '四忌':    { han:'四忌', name_th:'ดาวสี่ต้องห้าม',       weight:-20, severity:'major', system:'ri_jia', desc_th:'พลังต้องห้าม 4 ทิศ · ระวังทุกการเริ่มต้น' },
  '四離':    { han:'四离', han_trad:'四離', name_th:'ดาวสี่จาก', weight:-20, severity:'major', system:'ri_jia', desc_th:'พลังพราก·แยกจาก · ระวังหย่าร้าง·ลาออก' },
  '九空':    { han:'九空', name_th:'ดาวเก้าว่าง',         weight:-20, severity:'major', system:'ri_jia', desc_th:'พลังเก้าทิศว่าง · ห้ามขนของ·ย้ายของ' },
  '劫煞':    { han:'劫煞', name_th:'ดาวโจรปล้น',           weight:-20, severity:'major', system:'ri_jia', desc_th:'เสี่ยงถูกขโมย·โกง · ระวังเงินทอง' },
  '大煞':    { han:'大煞', name_th:'ดาวร้ายใหญ่',          weight:-20, severity:'major', system:'ri_jia', desc_th:'พลังเคราะห์ใหญ่ · ห้ามเริ่มงานสำคัญ' },
  '大時':    { han:'大时', han_trad:'大時', name_th:'ดาวเวลาใหญ่', weight:-20, severity:'major', system:'ri_jia', desc_th:'พลังเวลาใหญ่ขัดขวาง' },
  '游禍':    { han:'游祸', han_trad:'游禍', name_th:'ดาวภัยเคลื่อน', weight:-20, severity:'major', system:'ri_jia', desc_th:'ภัยที่เคลื่อนที่ · ระวังเดินทาง·พบคนแปลกหน้า' },
  '五鬼':    { han:'五鬼', name_th:'ดาวห้าผี',             weight:-20, severity:'major', system:'ri_jia', desc_th:'นินทา·ใส่ร้าย · ระวังคำพูด·เพื่อนหลอก' },
  '八專':    { han:'八专', han_trad:'八專', name_th:'ดาวแปดเจาะจง', weight:-15, severity:'major', system:'ri_jia', desc_th:'พลังเฉพาะหนึ่งเดียว · ห้ามรวมกลุ่ม' },
  '天吏':    { han:'天吏', name_th:'ดาวขุนนางฟ้า',         weight:-15, severity:'major', system:'ri_jia', desc_th:'อำนาจกดดัน · ระวังถูกฟ้อง·ผูกพันเอกสาร' },
  '五虛':    { han:'五虚', han_trad:'五虛', name_th:'ดาวห้าว่าง', weight:-15, severity:'major', system:'ri_jia', desc_th:'ห้าธาตุว่างเปล่า · ห้ามเริ่มงาน·ลงทุน' },
  '天罡':    { han:'天罡', name_th:'ดาวเหล็กฟ้า',          weight:-15, severity:'major', system:'ri_jia', desc_th:'พลังแข็ง · เสี่ยงปะทะ·ห้ามท้าทาย' },
  '河魁':    { han:'河魁', name_th:'ดาวหัวแม่น้ำ',         weight:-15, severity:'major', system:'ri_jia', desc_th:'พลังร้ายทางน้ำ · ห้ามลงเรือ·ข้ามแม่น้ำ' },
  '小耗':    { han:'小耗', name_th:'ดาวสูญทรัพย์เล็ก',     weight:-15, severity:'major', system:'ri_jia', desc_th:'เสียเล็ก · ระวังของหาย' },
  '歸忌':    { han:'归忌', han_trad:'歸忌', name_th:'ดาวห้ามกลับ', weight:-15, severity:'major', system:'ri_jia', desc_th:'ห้ามคืนถิ่น · ห้ามย้ายเข้าใหม่' },
  '血忌':    { han:'血忌', name_th:'ดาวต้องห้ามเลือด',     weight:-15, severity:'major', system:'ri_jia', desc_th:'พลังเลือด · ห้ามผ่าตัด·เจาะ·เย็บ' },
  '土符':    { han:'土符', name_th:'ดาวอักษรดิน',         weight:-15, severity:'major', system:'ri_jia', desc_th:'ห้ามขุดดิน·ก่อสร้าง·เคลื่อนดิน' },
  '土王用事':{ han:'土王用事', name_th:'ดาวราชาดิน',       weight:-15, severity:'major', system:'ri_jia', desc_th:'ห้ามเคลื่อนดิน·ตอกเสาเข็ม' },
  '地囊':    { han:'地囊', name_th:'ดาวถุงดิน',           weight:-15, severity:'major', system:'ri_jia', desc_th:'พลังกัก · ห้ามขุดดิน·ตอกเสาเข็ม' },
  '觸水龍':  { han:'触水龙', han_trad:'觸水龍', name_th:'ดาวมังกรน้ำ', weight:-15, severity:'major', system:'ri_jia', desc_th:'ห้ามลงเรือ·ทำงานในน้ำ' },
  '陰錯':    { han:'阴错', han_trad:'陰錯', name_th:'ดาวหยินผิด', weight:-15, severity:'major', system:'ri_jia', desc_th:'พลังหยินเบี้ยว · ระวังเพศหญิง·เรื่องลับ' },
  '陽錯':    { han:'阳错', han_trad:'陽錯', name_th:'ดาวหยางผิด', weight:-15, severity:'major', system:'ri_jia', desc_th:'พลังหยางเบี้ยว · ระวังเพศชาย·เรื่องเปิดเผย' },
  '五離':    { han:'五离', han_trad:'五離', name_th:'ดาวห้าแยก', weight:-15, severity:'major', system:'ri_jia', desc_th:'พลังพราก 5 ธาตุ · ห้ามรวมหุ้น·แต่งงาน' },
  '天賊':    { han:'天贼', han_trad:'天賊', name_th:'ดาวขโมยฟ้า', weight:-15, severity:'major', system:'ri_jia', desc_th:'ระวังของหาย·ถูกขโมย' },
  '豹尾':    { han:'豹尾', name_th:'ดาวหางเสือดาว',        weight:-15, severity:'major', system:'ri_jia', desc_th:'เสียทรัพย์·ปัญหาครอบครัว·ความเศร้าโศก' },
  '伏兵':    { han:'伏兵', name_th:'ดาวซุ่มโจมตี',         weight:-15, severity:'major', system:'ri_jia', desc_th:'ระวังกับดัก·เล่ห์เหลี่ยม · ห้ามเริ่มโปรเจกต์ใหม่' },
  '天狗':    { han:'天狗', name_th:'ดาวสุนัขฟ้า',          weight:-15, severity:'major', system:'ri_jia', desc_th:'พลังกินเด็ก · ห้ามเริ่มขอลูก·พิธีเด็ก' },

  /* ═══════ Tier B · Minor (-5~-10) ═══════ */
  '小煞':    { han:'小煞', name_th:'ดาวร้ายเล็ก',          weight:-10, severity:'minor', system:'ri_jia', desc_th:'พลังร้ายเล็ก · ระวังเรื่องเล็กๆ' },
  '八風':    { han:'八风', han_trad:'八風', name_th:'ดาวแปดลม', weight:-10, severity:'minor', system:'ri_jia', desc_th:'พลังลมแรง · ระวังเดินทาง·ลงเรือ' },
  '月建':    { han:'月建', name_th:'ดาวเดือนสร้าง',         weight:-10, severity:'minor', system:'ri_jia', desc_th:'พลังเดือนกระทบวัน · ห้ามขุดดิน·เคลื่อนของ' },
  '血支':    { han:'血支', name_th:'ดาวกิ่งเลือด',         weight:-10, severity:'minor', system:'ri_jia', desc_th:'เสี่ยงเลือดตกยางออก · ห้ามฝังเข็ม·ผ่าตัด' },
  '復日':    { han:'复日', han_trad:'復日', name_th:'ดาววันซ้ำ', weight:-10, severity:'minor', system:'ri_jia', desc_th:'พลังย้อนคืน · ห้ามฝังศพ·เก็บอัฐิ' },
  '重日':    { han:'重日', name_th:'ดาววันซ้ำซ้อน',        weight:-10, severity:'minor', system:'ri_jia', desc_th:'ไม่เหมาะแต่งงาน·งานศพ (เกิดร้ายซ้ำสอง)' },
  '傍廢':    { han:'傍废', han_trad:'傍廢', name_th:'ดาวใกล้สูญ', weight:-10, severity:'minor', system:'ri_jia', desc_th:'พลังอ่อนแอ · ใช้ได้เฉพาะเมื่อมีดาวมงคลช่วย' },
  '陰氣':    { han:'阴气', han_trad:'陰氣', name_th:'ดาวลมหยิน', weight:-10, severity:'minor', system:'ri_jia', desc_th:'พลังหยินเด่น · ระวังเรื่องลับ·สุขภาพ' },
  '陽氣':    { han:'阳气', han_trad:'陽氣', name_th:'ดาวลมหยาง', weight:-10, severity:'minor', system:'ri_jia', desc_th:'พลังหยางเด่น · ระวังอุบัติเหตุ' },

  /* ═══════ misc · เพิ่มที่ tyme4ts ส่งบ่อย ═══════ */
  '天火':    { han:'天火', name_th:'ดาวไฟฟ้า',             weight:-15, severity:'major', system:'ri_jia', desc_th:'เสี่ยงอัคคีภัย · ห้ามจุดไฟ·ก่อสร้าง' },
  '地火':    { han:'地火', name_th:'ดาวไฟดิน',             weight:-12, severity:'medium', system:'ri_jia', desc_th:'เสี่ยงไฟใต้ดิน · ห้ามขุดดินลึก' },
  '獨火':    { han:'独火', han_trad:'獨火', name_th:'ดาวไฟเดี่ยว', weight:-10, severity:'minor', system:'ri_jia', desc_th:'เสี่ยงไฟ · ระวังเครื่องไฟฟ้า' },
  '月虛':    { han:'月虚', han_trad:'月虛', name_th:'ดาวว่างเดือน', weight:-12, severity:'medium', system:'ri_jia', desc_th:'พลังกลวงเปล่า · เริ่มงานไม่สำเร็จ' },
  '往亡':    { han:'往亡', name_th:'ดาวเดินทางตาย',        weight:-15, severity:'major', system:'ri_jia', desc_th:'ห้ามเดินทางไกล·เริ่มทริปสำคัญ' },
  '滅門':    { han:'灭门', han_trad:'滅門', name_th:'ดาวล้มประตู', weight:-25, severity:'major', system:'ri_jia', desc_th:'พลังทำลายตระกูล · ห้ามแต่งงาน·สร้างบ้าน' },
  '咸池':    { han:'咸池', name_th:'ดาวสระว่ายน้ำ',         weight:-12, severity:'medium', system:'ri_jia', desc_th:'ดาวเสน่ห์ลับ · ระวังชู้สาว·ปัญหาความรัก' },
  '披麻':    { han:'披麻', name_th:'ดาวห่มผ้าไว้ทุกข์',     weight:-15, severity:'major', system:'ri_jia', desc_th:'พลังไว้อาลัย · ห้ามแต่งงาน·เริ่มความสัมพันธ์' },
  '小時':    { han:'小时', han_trad:'小時', name_th:'ดาวยามเล็ก', weight:-8, severity:'minor', system:'ri_jia', desc_th:'พลังเวลาเล็กน้อย · เริ่มงานช้า' },
  '大敗':    { han:'大败', han_trad:'大敗', name_th:'ดาวพ่ายแพ้ใหญ่', weight:-20, severity:'major', system:'ri_jia', desc_th:'พ่ายแพ้หนัก · ห้ามแข่งขัน' },
  '八敗':    { han:'八败', han_trad:'八敗', name_th:'ดาวพ่ายแปดทิศ', weight:-15, severity:'major', system:'ri_jia', desc_th:'พ่ายทุกทิศ · ห้ามเริ่มงานครอบคลุม' },
  '重喪':    { han:'重丧', han_trad:'重喪', name_th:'ดาวงานศพซ้ำ', weight:-15, severity:'major', system:'ri_jia', desc_th:'พลังตายซ้ำ · ห้ามฝังศพ' },
  '羅網':    { han:'罗网', han_trad:'羅網', name_th:'ดาวตาข่าย', weight:-12, severity:'medium', system:'ri_jia', desc_th:'พลังขังจำ · ระวังเอกสาร·สัญญาผูก' },
  '刀砧':    { han:'刀砧', name_th:'ดาวเขียงมีด',           weight:-12, severity:'medium', system:'ri_jia', desc_th:'เสี่ยงบาดเจ็บ · ห้ามใช้มีด·ผ่าตัด' },
  '天瘟':    { han:'天瘟', name_th:'ดาวโรคระบาดฟ้า',       weight:-15, severity:'major', system:'ri_jia', desc_th:'เสี่ยงโรคติดต่อ · ห้ามชุมนุม' },
  '地瘟':    { han:'地瘟', name_th:'ดาวโรคระบาดดิน',       weight:-12, severity:'medium', system:'ri_jia', desc_th:'เสี่ยงโรคจากดิน · ห้ามขุดดิน' },
  '四擊':    { han:'四击', han_trad:'四擊', name_th:'ดาวสี่ตีกระแทก', weight:-10, severity:'minor', system:'ri_jia', desc_th:'ปะทะ 4 ทิศ · ห้ามเริ่มสงคราม' },
  '八龍':    { han:'八龙', han_trad:'八龍', name_th:'ดาวแปดมังกร', weight:-8, severity:'minor', system:'ri_jia', desc_th:'พลังมังกร 8 ตัวขัดกัน · ห้ามขุดดิน' },
  '八座':    { han:'八座', name_th:'ดาวแปดบัลลังก์',       weight:-8, severity:'minor', system:'ri_jia', desc_th:'พลังบัลลังก์ขัดกัน · ห้ามแย่งตำแหน่ง' },
  '勾絞':    { han:'勾绞', han_trad:'勾絞', name_th:'ดาวบีบรัด', weight:-12, severity:'medium', system:'ri_jia', desc_th:'พลังบีบคั้น · ห้ามทำสัญญาผูกพัน' },
  '死別':    { han:'死别', han_trad:'死別', name_th:'ดาวพรากตาย', weight:-15, severity:'major', system:'ri_jia', desc_th:'พลังพราก · ห้ามแยกกัน·หย่าร้าง' },
};

/* alias map · ตัวย่อ → key (key ของ dict ใช้ตัวเต็ม) */
const SIMP_TO_TRAD: Record<string, string> = {
  '时德':'時德','阳德':'陽德','月虚':'月虛','五虚':'五虛','陰德':'陰德','阴德':'陰德',
  '阳贵':'陽貴','阴贵':'陰貴','陽貴登天':'陽貴登天','阳贵登天':'陽貴登天',
  '陰貴登天':'陰貴登天','阴贵登天':'陰貴登天','驿马':'驛馬','日马':'日馬','日禄':'日祿',
  '青龙':'青龍','金匮':'金匱','宝光':'寶光','圣心':'聖心','益后':'益後','续世':'續世',
  '六仪':'六儀','不将':'不將','时阳':'時陽','时阴':'時陰','母仓':'母倉','临日':'臨日',
  '鸣吠':'鳴吠','鸣吠对':'鳴吠對','荒芜':'荒蕪','四废':'四廢','灾煞':'災煞','岁煞':'歲煞',
  '月厌':'月厭','复日':'復日','归忌':'歸忌','游祸':'游禍','天贼':'天賊','四击':'四擊',
  '四穷':'四窮','八龙':'八龍','八风':'八風','八专':'八專','灭门':'滅門','触水龙':'觸水龍',
  '死别':'死別','大时':'大時','小时':'小時','大败':'大敗','八败':'八敗','重丧':'重喪',
  '傍废':'傍廢','勾陈':'勾陳','勾绞':'勾絞','招摇':'招搖','厌对':'厭對','罗网':'羅網',
  '财神':'財神','开':'開','闭':'閉','执':'執','满':'滿','独火':'獨火',
  '阴错':'陰錯','阳错':'陽錯','五离':'五離','四离':'四離','四绝':'四絕',
  '天医':'天醫','天愿':'天願','阳气':'陽氣','阴气':'陰氣',
  '兵宝':'兵寶','普护':'普護','益气':'益氣',
};

/**
 * จำแนก + คะแนนรวม + apply classical rules v1.1
 * Rule 1: pos > neg + !stacked → 吉
 * Rule 2: pos == neg + virtue > 0 → 吉
 * Rule 3: pos == neg + no virtue → 中和
 * Rule 4: pos < neg + !stacked + virtue covers gap → 中和 (virtue saves)
 * Rule 5: pos < neg + stacked + virtue > 0 → 凶 (virtue can't fully save)
 * Rule 6: 2+ fatal → 大凶 (unrecoverable)
 */
export function summarizeStars(arr: string[]): {
  good: Array<StarEntry & { key: string }>;
  bad:  Array<StarEntry & { key: string }>;
  unknown: string[];
  total: number;
  verdict: '大吉' | '吉' | '中和' | '凶' | '大凶';
  applied_rule: 1 | 2 | 3 | 4 | 5 | 6;
  pos_sum: number;
  neg_sum: number;
  virtue_bonus: number;
} {
  const good: Array<StarEntry & { key: string }> = [];
  const bad:  Array<StarEntry & { key: string }> = [];
  const unknown: string[] = [];
  arr.forEach(name => {
    const trad = SIMP_TO_TRAD[name];
    const entry = STAR_DICT_TH[name] || (trad ? STAR_DICT_TH[trad] : undefined);
    if (!entry) { unknown.push(name); return; }
    const withKey = { ...entry, key: name };
    if (entry.weight >= 0) good.push(withKey);
    else bad.push(withKey);
  });
  good.sort((a, b) => b.weight - a.weight);
  bad.sort((a, b) => a.weight - b.weight);

  const pos_sum = good.reduce((s, x) => s + x.weight, 0);
  const neg_sum = Math.abs(bad.reduce((s, x) => s + x.weight, 0));
  const virtue_bonus = good.filter(x => x.severity === 'virtue').reduce((s, x) => s + x.weight, 0);
  const majorNegs = bad.filter(x => x.severity === 'major' || x.severity === 'fatal');
  const fatalNegs = bad.filter(x => x.severity === 'fatal');
  const hasStacked = majorNegs.length >= 2;
  const hasFatal   = fatalNegs.length > 0;

  let verdict: '大吉' | '吉' | '中和' | '凶' | '大凶';
  let applied_rule: 1 | 2 | 3 | 4 | 5 | 6;

  if (fatalNegs.length >= 2) {
    verdict = '大凶'; applied_rule = 6;
  } else if (pos_sum > neg_sum && !hasStacked) {
    verdict = pos_sum >= neg_sum + 30 ? '大吉' : '吉'; applied_rule = 1;
  } else if (pos_sum === neg_sum) {
    if (virtue_bonus > 0) { verdict = '吉'; applied_rule = 2; }
    else { verdict = '中和'; applied_rule = 3; }
  } else { /* pos < neg */
    if (hasStacked && virtue_bonus > 0) { verdict = '凶'; applied_rule = 5; }
    else if (!hasStacked && virtue_bonus >= (neg_sum - pos_sum)) { verdict = '中和'; applied_rule = 4; }
    else if (hasFatal) { verdict = '大凶'; applied_rule = 6; }
    else { verdict = '凶'; applied_rule = 5; }
  }

  const total = pos_sum - neg_sum + (virtue_bonus > 0 ? Math.min(virtue_bonus, 15) : 0);
  return { good, bad, unknown, total, verdict, applied_rule, pos_sum, neg_sum, virtue_bonus };
}
