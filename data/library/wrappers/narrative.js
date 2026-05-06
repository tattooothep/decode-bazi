/**
 * Narrative generator · 3 ภาษา (TH/EN/ZH)
 * Generate จาก structured data · ห้าม hardcode ดวงเฉพาะ
 */

const TEN_GOD_NAME = {
  '比肩': { en:'Friend',           th:'เพื่อน',         zh:'比肩' },
  '劫財': { en:'Rob Wealth',       th:'ขัดทรัพย์',     zh:'劫財' },
  '食神': { en:'Eating God',       th:'พรสวรรค์อ่อน', zh:'食神' },
  '傷官': { en:'Hurting Officer',  th:'พรสวรรค์แรง', zh:'傷官' },
  '偏財': { en:'Indirect Wealth',  th:'ทรัพย์รอง',    zh:'偏財' },
  '正財': { en:'Direct Wealth',    th:'ทรัพย์ตรง',    zh:'正財' },
  '七殺': { en:'Seven Killings',   th:'ผู้คุมเข้ม',    zh:'七殺' },
  '正官': { en:'Direct Officer',   th:'ผู้คุมปกติ',    zh:'正官' },
  '偏印': { en:'Indirect Resource',th:'ครูสายลับ',    zh:'偏印' },
  '正印': { en:'Direct Resource',  th:'ครูสายตรง',   zh:'正印' },
};

const ELEMENT_NAME = {
  wood:  { en:'Wood',  th:'ไม้',  zh:'木' },
  fire:  { en:'Fire',  th:'ไฟ',   zh:'火' },
  earth: { en:'Earth', th:'ดิน',  zh:'土' },
  metal: { en:'Metal', th:'ทอง',  zh:'金' },
  water: { en:'Water', th:'น้ำ',  zh:'水' },
};

const STRUCTURE_NAME = {
  '正印格': { en:'Direct Resource',     th:'ครูสายตรง',     gist:{en:'Nurtured · accumulates wisdom',th:'บ่มเพาะ · สะสมปัญญา',zh:'培育智慧'} },
  '偏印格': { en:'Indirect Resource',   th:'ครูสายลับ',     gist:{en:'Crystallized · sharp insight', th:'ตกผลึก · เข้าใจคม', zh:'結晶洞察'} },
  '正官格': { en:'Direct Officer',      th:'ระเบียบ',       gist:{en:'Rule-based · structured path', th:'ระเบียบ · มีกรอบ',  zh:'規矩路徑'} },
  '七殺格': { en:'Seven Killings',      th:'เด็ดขาด',       gist:{en:'Decisive · authority through challenge', th:'เด็ดขาด · ผ่านศึก', zh:'果斷威權'} },
  '正財格': { en:'Direct Wealth',       th:'สะสม',          gist:{en:'Steady · wealth through discipline', th:'มั่นคง · สร้างผ่านวินัย', zh:'穩定積累'} },
  '偏財格': { en:'Indirect Wealth',     th:'แสวงหา',        gist:{en:'Seeking · wealth through opportunity', th:'แสวง · จับโอกาส', zh:'機遇求財'} },
  '食神格': { en:'Eating God',          th:'เรียบเรียง',    gist:{en:'Refined output · gentle creation', th:'เรียบเรียง · สร้างนุ่ม', zh:'柔和輸出'} },
  '傷官格': { en:'Hurting Officer',     th:'ปลดปล่อย',      gist:{en:'Bold output · creation breaks rules', th:'ปลดปล่อย · ฉีกกฎ', zh:'突破創造'} },
  '比肩格': { en:'Friend',              th:'เสมอภาค',       gist:{en:'Equal stance · cooperative', th:'เสมอ · ร่วมมือ', zh:'平等合作'} },
  '劫財格': { en:'Rob Wealth',          th:'แข่งขัน',       gist:{en:'Competitive · dynamic peers', th:'แข่งขัน · พลวัต',  zh:'競爭活力'} },
  '化木格': { en:'Transformation Wood', th:'แปรเป็นไม้',    gist:{en:'Reborn into wood frame', th:'เกิดใหม่เป็นไม้', zh:'化木重生'} },
  '化火格': { en:'Transformation Fire', th:'แปรเป็นไฟ',     gist:{en:'Reborn into fire frame', th:'เกิดใหม่เป็นไฟ', zh:'化火重生'} },
  '化土格': { en:'Transformation Earth',th:'แปรเป็นดิน',    gist:{en:'Reborn into earth frame', th:'เกิดใหม่เป็นดิน', zh:'化土重生'} },
  '化金格': { en:'Transformation Metal',th:'แปรเป็นทอง',    gist:{en:'Reborn into metal frame', th:'เกิดใหม่เป็นทอง', zh:'化金重生'} },
  '化水格': { en:'Transformation Water',th:'แปรเป็นน้ำ',    gist:{en:'Reborn into water frame', th:'เกิดใหม่เป็นน้ำ', zh:'化水重生'} },
  '從兒格': { en:'Follow Output',       th:'ตามพรสวรรค์',   gist:{en:'Follow what you create', th:'ตามสิ่งที่สร้าง', zh:'從兒'} },
  '從財格': { en:'Follow Wealth',       th:'ตามทรัพย์',     gist:{en:'Follow opportunity flow', th:'ตามกระแสทรัพย์', zh:'從財'} },
  '從殺格': { en:'Follow Influence',    th:'ตามอำนาจ',      gist:{en:'Follow authority current', th:'ตามอำนาจ', zh:'從殺'} },
};

const CRISIS_NAME = {
  cold:     { en:'Cold (Frozen Chart)',     th:'หนาว (ดวงแช่แข็ง)',  zh:'寒冷格' },
  damp:     { en:'Damp (Wet Chart)',        th:'ชื้น (ดวงเปียก)',    zh:'潮濕格' },
  scorched: { en:'Scorched (Hot Chart)',    th:'ร้อน (ดวงไหม้)',     zh:'燥熱格' },
  dry:      { en:'Dry (Arid Chart)',        th:'แห้ง (ดวงแห้งแล้ง)', zh:'乾旱格' },
};

const STRENGTH_LABEL = {
  extremely_weak:   { en:'Extremely Weak',   th:'อ่อนสุดขั้ว',  zh:'極弱' },
  very_weak:        { en:'Very Weak',        th:'อ่อนมาก',     zh:'很弱' },
  weak:             { en:'Weak',             th:'อ่อน',        zh:'弱'   },
  slightly_weak:    { en:'Slightly Weak',    th:'อ่อนน้อย',    zh:'稍弱' },
  balanced:         { en:'Balanced',         th:'สมดุล',       zh:'中和' },
  slightly_strong:  { en:'Slightly Strong',  th:'แกร่งน้อย',   zh:'稍強' },
  strong:           { en:'Strong',           th:'แกร่ง',       zh:'強'   },
  very_strong:      { en:'Very Strong',      th:'แกร่งมาก',    zh:'很強' },
  extremely_strong: { en:'Extremely Strong', th:'แกร่งสุดขั้ว', zh:'極強' },
  transformed:      { en:'Transformed',      th:'แปรเปลี่ยน',  zh:'化氣' },
};

function trans(key, dict) {
  return dict[key] || { en: key, th: key, zh: key };
}

module.exports = {
  TEN_GOD_NAME, ELEMENT_NAME, STRUCTURE_NAME, CRISIS_NAME, STRENGTH_LABEL,
  trans,
};
