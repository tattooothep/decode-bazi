/**
 * Map ของ 14 type → DB table + ฟิลด์ที่แก้ได้
 * ใช้โดย /api/admin/paraphrase/[type]/...
 */
export type FieldKind = "varchar" | "text" | "jsonb";

export type ParaphraseField = {
  key: string;
  label: string;
  kind: FieldKind;
  trilingual?: boolean;        // ถ้า true จะถูกขยายเป็น _en, _th, _zh
  classical?: boolean;          // [KEEP] ห้ามแปล
  rows?: number;
};

export type ParaphraseType = {
  type: string;                 // url slug
  table: string;
  section: string;              // เช่น "§15 Archetype 25"
  pkColumn: string;             // โดยปกติ id
  listColumns: string[];        // ฟิลด์ที่โชว์ใน list
  searchColumns?: string[];
  fields: ParaphraseField[];
  fixedColumns?: { key: string; label: string }[];   // คอลัมน์ที่ไม่ใช่ paraphrase
};

export const TYPES: Record<string, ParaphraseType> = {
  archetype: {
    type: "archetype",
    table: "ref_archetypes_25",
    section: "§15 Archetype · 25 บุคลิก",
    pkColumn: "id",
    listColumns: ["id", "archetype_base", "element", "title_th", "title_en"],
    fields: [
      { key: "title", label: "Title · ชื่อบุคลิก", kind: "varchar", trilingual: true },
      { key: "style_label", label: "Style · สไตล์การเชื่อมโยง", kind: "varchar", trilingual: true },
      { key: "deep_dive", label: "Deep Dive · คำอธิบายเชิงลึก", kind: "text", trilingual: true, rows: 6 },
      { key: "key_talents", label: "Key Talents · พรสวรรค์ (jsonb array)", kind: "jsonb", trilingual: true },
      { key: "mindset_shift_quote", label: "Mindset Shift Quote", kind: "text", trilingual: true, rows: 2 },
      { key: "awakening_question", label: "Awakening Question · คำถามปลุก", kind: "text", trilingual: true, rows: 2 },
    ],
    fixedColumns: [
      { key: "archetype_base", label: "Base (Connector/Leader/Thinker/Creator/Achiever)" },
      { key: "element", label: "Element" },
    ],
  },
  structure: {
    type: "structure",
    table: "ref_structures_18",
    section: "§16 Structure · 18 โครงดวง",
    pkColumn: "id",
    listColumns: ["id", "code", "title_th", "title_en"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "subtitle", label: "Subtitle", kind: "text", trilingual: true, rows: 2 },
      { key: "meaning", label: "Meaning · ความหมาย", kind: "text", trilingual: true, rows: 5 },
      { key: "core_strategy", label: "Core Strategy", kind: "text", trilingual: true, rows: 3 },
      { key: "dos", label: "Dos (jsonb array)", kind: "jsonb", trilingual: true },
      { key: "donts", label: "Donts (jsonb array)", kind: "jsonb", trilingual: true },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "title_chinese", label: "Chinese Title (classical)" },
      { key: "category", label: "Category" },
    ],
  },
  strength: {
    type: "strength",
    table: "ref_strengths",
    section: "§1 DM Strength · 7 ระดับ",
    pkColumn: "id",
    listColumns: ["id", "code", "label_th", "label_en"],
    fields: [
      { key: "label", label: "Label", kind: "varchar", trilingual: true },
      { key: "metaphor", label: "Metaphor · คำเปรียบ", kind: "text", trilingual: true, rows: 4 },
      { key: "meaning", label: "Meaning", kind: "text", trilingual: true, rows: 4 },
      { key: "core_strategy", label: "Core Strategy", kind: "varchar", trilingual: true },
      { key: "dos", label: "Dos (jsonb)", kind: "jsonb", trilingual: true },
      { key: "donts", label: "Donts (jsonb)", kind: "jsonb", trilingual: true },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "strength_percentage_min", label: "Pct Min" },
      { key: "strength_percentage_max", label: "Pct Max" },
    ],
  },
  star: {
    type: "star",
    table: "ref_personal_stars",
    section: "§37 Personal Stars · 14 ดวง",
    pkColumn: "id",
    listColumns: ["id", "name_chinese", "name_th", "name_en"],
    fields: [
      { key: "favorable_reading", label: "Favorable · เมื่อเอื้อ", kind: "text", trilingual: true, rows: 4 },
      { key: "unfavorable_reading", label: "Unfavorable · เมื่อขัด", kind: "text", trilingual: true, rows: 4 },
      { key: "mixed_reading", label: "Mixed · ก้ำกึ่ง", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "name_en", label: "Name EN" },
      { key: "name_chinese", label: "Name ZH (classical)" },
      { key: "name_th", label: "Name TH" },
      { key: "star_type", label: "Star Type" },
    ],
  },
  star_reading: {
    type: "star_reading",
    table: "ref_star_pillar_readings",
    section: "§37 Star × Pillar Readings",
    pkColumn: "star_id",
    listColumns: ["star_id", "pillar_position", "label_th", "label_en"],
    fields: [
      { key: "label", label: "Label", kind: "varchar", trilingual: true },
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 5 },
    ],
    fixedColumns: [
      { key: "star_id", label: "Star ID" },
      { key: "pillar_position", label: "Pillar (Year/Month/Day/Hour)" },
    ],
  },
  yongshen: {
    type: "yongshen",
    table: "ref_yongshen_ranks",
    section: "§3 Yongshen Ranks (10 DM × 5)",
    pkColumn: "id",
    listColumns: ["id", "day_master", "rank", "element", "polarity"],
    fields: [
      { key: "meaning", label: "Meaning · ความหมาย", kind: "text", trilingual: true, rows: 4 },
      { key: "strategy", label: "Strategy", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "day_master", label: "DM (天干)" },
      { key: "rank", label: "Rank 1-5" },
      { key: "element", label: "Element" },
      { key: "polarity", label: "Polarity" },
    ],
  },
  interaction: {
    type: "interaction",
    table: "ref_interactions_9",
    section: "§7 Pillar Interactions · 9 ปฏิกิริยา",
    pkColumn: "id",
    listColumns: ["id", "code", "zh", "title_en"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
      { key: "effect", label: "Effect · ผลที่เกิด", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "zh", label: "ZH (classical)" },
      { key: "polarity", label: "Polarity" },
    ],
  },
  ten_god: {
    type: "ten_god",
    table: "ref_ten_gods",
    section: "§9 Ten Gods · 十神",
    pkColumn: "id",
    listColumns: ["id", "code", "zh", "decode_name_en"],
    fields: [
      { key: "decode_name", label: "Decode Name", kind: "varchar", trilingual: true },
      { key: "archetype", label: "Archetype · ภาพประจำตัว", kind: "text", trilingual: true, rows: 4 },
      { key: "positive", label: "Positive · ด้านสว่าง", kind: "text", trilingual: true, rows: 4 },
      { key: "shadow", label: "Shadow · ด้านมืด", kind: "text", trilingual: true, rows: 4 },
      { key: "strategy", label: "Strategy · กลยุทธ์", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "zh", label: "ZH (classical)" },
      { key: "abbr", label: "Abbr" },
    ],
  },
  qi_phase: {
    type: "qi_phase",
    table: "ref_qi_phases",
    section: "§18 12 Qi Phases · 十二長生",
    pkColumn: "id",
    listColumns: ["id", "code", "zh", "title_en", "strength_level"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "meaning", label: "Meaning", kind: "text", trilingual: true, rows: 4 },
      { key: "effect_on_dm", label: "Effect on DM", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "zh", label: "ZH (classical)" },
      { key: "strength_level", label: "Level 1-12" },
    ],
  },
  symbolic_star: {
    type: "symbolic_star",
    table: "ref_symbolic_stars_62",
    section: "§20 Symbolic Stars · 神煞 62 (25 seeded · ขาดอีก 37)",
    pkColumn: "id",
    listColumns: ["id", "zh", "title_en", "polarity", "category"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "meaning", label: "Meaning", kind: "text", trilingual: true, rows: 4 },
      { key: "effect", label: "Effect", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "zh", label: "ZH (classical)" },
      { key: "polarity", label: "Polarity" },
      { key: "category", label: "Category" },
      { key: "activation_rule", label: "Activation Rule" },
    ],
  },
  five_structure: {
    type: "five_structure",
    table: "ref_five_structure_types",
    section: "§28 5 Structure Types · 五型格",
    pkColumn: "id",
    listColumns: ["id", "code", "zh", "title_en"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
      { key: "strategy", label: "Strategy", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "zh", label: "ZH" },
    ],
  },
  ten_profile: {
    type: "ten_profile",
    table: "ref_ten_profiles",
    section: "§29 Ten Profiles · Joey Yap-style",
    pkColumn: "id",
    listColumns: ["id", "code", "ten_god_code", "title_en"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
      { key: "career", label: "Career · อาชีพเหมาะ", kind: "text", trilingual: true, rows: 4 },
      { key: "growth", label: "Growth · จุดพัฒนา", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "ten_god_code", label: "Linked Ten God" },
      { key: "zh", label: "ZH" },
    ],
  },
  stem_combo: {
    type: "stem_combo",
    table: "ref_stem_combos",
    section: "§36 Stem Combos · 五合",
    pkColumn: "id",
    listColumns: ["id", "pair", "transformed_element", "allowed_branches"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "meaning", label: "Meaning", kind: "text", trilingual: true, rows: 4 },
      { key: "trigger", label: "Trigger · เงื่อนไขรวม", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "pair", label: "Pair (e.g. 甲己)" },
      { key: "transformed_element", label: "Transformed Element" },
      { key: "allowed_branches", label: "Allowed Branches" },
    ],
  },
  chart_overview: {
    type: "chart_overview",
    table: "ref_chart_overview_39",
    section: "§39 Chart Overview · ภาพรวมดวงชะตา (natal + daily)",
    pkColumn: "id",
    listColumns: ["id", "scope", "axis", "code", "title_th", "title_en"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "summary", label: "Summary · สรุปสั้น", kind: "text", trilingual: true, rows: 3 },
      { key: "detail", label: "Detail · อธิบายเต็ม", kind: "text", trilingual: true, rows: 6 },
      { key: "advice", label: "Advice · คำแนะนำ", kind: "text", trilingual: true, rows: 4 },
      { key: "metaphor", label: "Metaphor · คำเปรียบ", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "scope", label: "Scope (natal/daily)" },
      { key: "axis", label: "Axis (yin_yang/strength/element/...)" },
      { key: "code", label: "Code" },
    ],
  },
  /* ─────────── Group B (13 หมวดเพิ่ม) ─────────── */
  tongshu: {
    type: "tongshu",
    table: "ref_tongshu_terms",
    section: "§14 Tongshu · 黃曆 · yi/ji/PengZu",
    pkColumn: "id",
    listColumns: ["id", "category", "code", "zh", "title_th", "title_en"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "meaning", label: "Meaning · ความหมาย", kind: "text", trilingual: true, rows: 4 },
      { key: "example", label: "Example · ตัวอย่าง", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "category", label: "Category (yi/ji/pengzu_*)" },
      { key: "code", label: "Code (祭祀 etc)" },
      { key: "zh", label: "ZH" },
    ],
  },
  na_yin: {
    type: "na_yin",
    table: "ref_jia_zi_60",
    section: "§17 Na Yin · 納音 60 เสียง",
    pkColumn: "id",
    listColumns: ["id", "pillar", "na_yin_chinese", "na_yin_english"],
    fields: [
      { key: "meaning", label: "Meaning · ความหมาย", kind: "text", trilingual: true, rows: 4 },
      { key: "personality", label: "Personality · บุคลิกประจำเสา", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "pillar", label: "Pillar (甲子 etc)" },
      { key: "na_yin_chinese", label: "Na Yin ZH (classical)" },
      { key: "na_yin_english", label: "Na Yin EN" },
      { key: "na_yin_element", label: "Element" },
    ],
  },
  root_tou_gan: {
    type: "root_tou_gan",
    table: "ref_root_tou_gan",
    section: "§21 Root & Tou Gan · 根透",
    pkColumn: "id",
    listColumns: ["id", "stem", "rule_type", "strength_level", "title_th"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
      { key: "effect", label: "Effect", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "stem", label: "Stem (天干)" },
      { key: "rule_type", label: "Rule (root/tou_gan)" },
      { key: "strength_level", label: "Level 1-5" },
    ],
  },
  storage_tomb: {
    type: "storage_tomb",
    table: "ref_storage_tomb",
    section: "§22 Storage & Tomb · 庫墓 (辰戌丑未)",
    pkColumn: "id",
    listColumns: ["id", "branch", "main_element", "title_th", "title_en"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
      { key: "unlock_condition", label: "Unlock Condition · เงื่อนไขปลด", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "branch", label: "Branch" },
      { key: "main_element", label: "Main Element" },
      { key: "primary_stored", label: "Primary" },
      { key: "secondary_stored", label: "Secondary" },
      { key: "san_he_pattern", label: "San He" },
    ],
  },
  palace: {
    type: "palace",
    table: "ref_palace_readings",
    section: "§23 Palace Reading · 宮位 (4 พระราชวัง)",
    pkColumn: "id",
    listColumns: ["id", "pillar_position", "zh", "age_range", "title_th"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
      { key: "stem_meaning", label: "Stem Meaning · ก้านสื่ออะไร", kind: "text", trilingual: true, rows: 3 },
      { key: "branch_meaning", label: "Branch Meaning · กิ่งสื่ออะไร", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "pillar_position", label: "Pillar (year/month/day/hour)" },
      { key: "zh", label: "ZH" },
      { key: "age_range", label: "Age Range" },
      { key: "domains", label: "Domains" },
    ],
  },
  life_palace: {
    type: "life_palace",
    table: "ref_life_palace_branches",
    section: "§24 Life Palace · 命宮 (12 branches)",
    pkColumn: "id",
    listColumns: ["id", "branch", "element", "title_th", "title_en"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "meaning", label: "Meaning · ความหมาย", kind: "text", trilingual: true, rows: 4 },
      { key: "destiny", label: "Destiny · ทิศทางชะตา", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "branch", label: "Branch (地支)" },
      { key: "element", label: "Element" },
      { key: "hidden_stems", label: "Hidden Stems" },
    ],
  },
  conception: {
    type: "conception",
    table: "ref_conception_pillars",
    section: "§25 Conception · 胎元 (60 pillars)",
    pkColumn: "id",
    listColumns: ["id", "pillar", "element", "title_th", "title_en"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "meaning", label: "Meaning · ความหมาย", kind: "text", trilingual: true, rows: 4 },
      { key: "origin", label: "Origin · ที่มา", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "pillar", label: "Pillar" },
      { key: "element", label: "Element" },
    ],
  },
  life_star_gua: {
    type: "life_star_gua",
    table: "ref_life_star_gua",
    section: "§26 Life Star Gua · 風水命卦 (9 guas)",
    pkColumn: "id",
    listColumns: ["id", "gua_number", "gua_zh", "gua_en", "title_th"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "meaning", label: "Meaning · ความหมาย", kind: "text", trilingual: true, rows: 4 },
      { key: "feng_shui", label: "Feng Shui · ฮวงจุ้ย", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "gua_number", label: "Gua Number" },
      { key: "gua_zh", label: "Gua ZH" },
      { key: "gua_en", label: "Gua EN" },
      { key: "element", label: "Element" },
      { key: "house_group", label: "House (east/west)" },
      { key: "primary_direction", label: "Direction" },
    ],
  },
  qimen_natal: {
    type: "qimen_natal",
    table: "ref_qimen_natal_palaces",
    section: "§30 QiMen Natal · 奇門命宮 deities",
    pkColumn: "id",
    listColumns: ["id", "palace_position", "deity_type", "deity_zh", "title_th"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
      { key: "fortune", label: "Fortune · โชคชะตา", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "palace_position", label: "Palace 1-9" },
      { key: "deity_type", label: "Deity Type" },
      { key: "deity_zh", label: "Deity ZH" },
    ],
  },
  qimen_palace: {
    type: "qimen_palace",
    table: "ref_qimen_palace_cells",
    section: "§31 QiMen 9 Palaces · 九宮",
    pkColumn: "id",
    listColumns: ["id", "palace_number", "palace_zh", "direction", "title_th"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "meaning", label: "Meaning", kind: "text", trilingual: true, rows: 4 },
      { key: "symbolism", label: "Symbolism · สัญลักษณ์", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "palace_number", label: "Palace 1-9" },
      { key: "palace_zh", label: "ZH" },
      { key: "direction", label: "Direction" },
      { key: "element", label: "Element" },
      { key: "trigram", label: "Trigram" },
    ],
  },
  qimen_direction: {
    type: "qimen_direction",
    table: "ref_qimen_directions",
    section: "§32 QiMen Direction · 奇門出行方 (8 ทิศ)",
    pkColumn: "id",
    listColumns: ["id", "direction_code", "direction_zh", "title_th"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "positive", label: "Positive · ด้านสว่าง", kind: "text", trilingual: true, rows: 3 },
      { key: "negative", label: "Negative · ด้านมืด", kind: "text", trilingual: true, rows: 3 },
      { key: "best_for", label: "Best For · ใช้เพื่อ", kind: "text", trilingual: true, rows: 3 },
      { key: "avoid_for", label: "Avoid For · เลี่ยง", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "direction_code", label: "Direction" },
      { key: "direction_zh", label: "ZH" },
    ],
  },
  annual_star: {
    type: "annual_star",
    table: "ref_annual_star_messages",
    section: "§33 Annual Stars · 流年神煞 messages",
    pkColumn: "id",
    listColumns: ["id", "star_code", "transit_layer", "activation_type", "title_th"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "message", label: "Message · ข้อความเตือน", kind: "text", trilingual: true, rows: 4 },
      { key: "action", label: "Action · ทำอะไร", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "star_code", label: "Star Code" },
      { key: "transit_layer", label: "Layer (daYun/liuNian/...)" },
      { key: "activation_type", label: "Type" },
    ],
  },
  border_case: {
    type: "border_case",
    table: "ref_border_case_templates",
    section: "§38 Border Case · ตรวจดวงก้ำกึ่ง",
    pkColumn: "id",
    listColumns: ["id", "case_type", "severity", "title_th", "title_en"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "warning", label: "Warning · คำเตือน", kind: "text", trilingual: true, rows: 4 },
      { key: "recommendation", label: "Recommendation · ข้อแนะนำ", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "case_type", label: "Case Type" },
      { key: "severity", label: "Severity" },
    ],
  },
  /* ─────────── Phase 18A · BaZi from qimen.sqlite (5 หมวด) ─────────── */
  ten_gods_matrix: {
    type: "ten_gods_matrix",
    table: "ref_ten_gods_matrix",
    section: "§9 Ten Gods Matrix · 十神 10×10 lookup",
    pkColumn: "id",
    listColumns: ["id", "day_master", "target_stem", "ten_god_code", "category"],
    fields: [
      { key: "note", label: "Note · บันทึก/ความเห็นซินแส", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "day_master", label: "Day Master (日主)" },
      { key: "target_stem", label: "Target Stem" },
      { key: "ten_god_code", label: "10 God Code (BJ/JC/SS/...)" },
      { key: "category", label: "Category" },
    ],
  },
  bazi_special_stars: {
    type: "bazi_special_stars",
    table: "ref_bazi_special_stars",
    section: "§20 BaZi Special Stars · 54 ดาว (rule lookup)",
    pkColumn: "id",
    listColumns: ["id", "star_code", "trigger_type", "trigger_value", "target_branch"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "meaning", label: "Meaning", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "star_code", label: "Star Code" },
      { key: "trigger_type", label: "Trigger Type" },
      { key: "trigger_value", label: "Trigger Value" },
      { key: "target_branch", label: "Target Branch" },
      { key: "polarity", label: "Polarity" },
    ],
  },
  bazi_calendar_days: {
    type: "bazi_calendar_days",
    table: "ref_bazi_calendar_days",
    section: "§14 BaZi Calendar Days · ปฏิทินวัน",
    pkColumn: "date",
    listColumns: ["date", "day_pillar", "day_stem", "day_branch", "solar_term"],
    fields: [
      { key: "note", label: "Note · บันทึก/ความเห็นซินแส", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "date", label: "Date" },
      { key: "year_pillar", label: "Year" },
      { key: "month_pillar", label: "Month" },
      { key: "day_pillar", label: "Day" },
      { key: "day_stem_element", label: "Day Stem El" },
      { key: "day_branch_element", label: "Day Branch El" },
      { key: "solar_term", label: "Solar Term" },
    ],
  },
  bazi_calendar_hours: {
    type: "bazi_calendar_hours",
    table: "ref_bazi_calendar_hours",
    section: "§13 BaZi Calendar Hours · ปฏิทินชั่วยาม",
    pkColumn: "id",
    listColumns: ["id", "date", "hour_index", "hour_pillar", "hour_start"],
    fields: [
      { key: "note", label: "Note · บันทึก/ความเห็นซินแส", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "date", label: "Date" },
      { key: "hour_index", label: "Hour Index (0-11)" },
      { key: "hour_start", label: "Start" },
      { key: "hour_end", label: "End" },
      { key: "hour_pillar", label: "Pillar" },
      { key: "hour_stem_element", label: "Stem El" },
      { key: "hour_branch_element", label: "Branch El" },
    ],
  },
  bazi_score_profiles: {
    type: "bazi_score_profiles",
    table: "ref_bazi_score_profiles",
    section: "Scoring Profile Templates · ตามวัตถุประสงค์",
    pkColumn: "id",
    listColumns: ["id", "purpose", "version", "active"],
    fields: [
      { key: "weights_json", label: "Weights (jsonb)", kind: "jsonb" },
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "purpose", label: "Purpose (general/business/love/...)" },
      { key: "version", label: "Version" },
      { key: "active", label: "Active" },
    ],
  },
  /* ─────────── Phase 18B · QiMen from qimen.sqlite (13 หมวด) ─────────── */
  qm_stars: {
    type: "qm_stars",
    table: "ref_qimen_stars_dict",
    section: "§31 QiMen Stars Dict · 九星 (9)",
    pkColumn: "code",
    listColumns: ["code", "zh", "pinyin", "name_th", "base_quality"],
    fields: [
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "zh", label: "ZH" },
      { key: "pinyin", label: "Pinyin" },
      { key: "element_code", label: "Element" },
      { key: "base_quality", label: "Quality" },
      { key: "home_palace", label: "Home Palace" },
    ],
  },
  qm_doors: {
    type: "qm_doors",
    table: "ref_qimen_doors_dict",
    section: "§31 QiMen Doors Dict · 八門 (8)",
    pkColumn: "code",
    listColumns: ["code", "zh", "pinyin", "name_th", "base_quality"],
    fields: [
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "zh", label: "ZH" },
      { key: "element_code", label: "Element" },
      { key: "base_quality", label: "Quality" },
    ],
  },
  qm_deities: {
    type: "qm_deities",
    table: "ref_qimen_deities_dict",
    section: "§31 QiMen Deities Dict · 八神 (10)",
    pkColumn: "code",
    listColumns: ["code", "zh", "pinyin", "name_th", "is_auspicious_trio"],
    fields: [
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "zh", label: "ZH" },
      { key: "base_quality", label: "Quality" },
      { key: "is_auspicious_trio", label: "Auspicious Trio" },
    ],
  },
  qm_formations: {
    type: "qm_formations",
    table: "ref_qimen_formations_dict",
    section: "§30 QiMen Formations · 格局 (11)",
    pkColumn: "formation_code",
    listColumns: ["formation_code", "name_zh", "name_th", "scope", "base_quality"],
    fields: [
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "formation_code", label: "Code" },
      { key: "name_zh", label: "ZH" },
      { key: "name_en", label: "EN" },
      { key: "scope", label: "Scope" },
      { key: "base_quality", label: "Quality" },
    ],
  },
  qm_trigrams: {
    type: "qm_trigrams",
    table: "ref_qimen_trigrams_dict",
    section: "§31 QiMen Trigrams · 八卦 (9)",
    pkColumn: "code",
    listColumns: ["code", "zh", "name_th", "direction", "element_code"],
    fields: [
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "zh", label: "ZH" },
      { key: "direction", label: "Direction" },
      { key: "element_code", label: "Element" },
      { key: "palace_id", label: "Palace" },
    ],
  },
  qm_stems: {
    type: "qm_stems",
    table: "ref_qimen_stems_dict",
    section: "QiMen Stems · 天干 (10)",
    pkColumn: "code",
    listColumns: ["code", "zh", "pinyin", "yin_yang", "element_code"],
    fields: [
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "zh", label: "ZH" },
      { key: "yin_yang", label: "Yin/Yang" },
      { key: "element_code", label: "Element" },
      { key: "is_three_qi", label: "Three Qi" },
    ],
  },
  qm_solar_terms: {
    type: "qm_solar_terms",
    table: "ref_qimen_solar_terms_dict",
    section: "QiMen Solar Terms · 24 節氣",
    pkColumn: "code",
    listColumns: ["code", "zh", "pinyin", "name_th", "order_no", "dun_type"],
    fields: [
      { key: "note", label: "Note · บันทึก/ความเห็นซินแส", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "code", label: "Code" },
      { key: "zh", label: "ZH" },
      { key: "pinyin", label: "Pinyin" },
      { key: "name_th", label: "TH" },
      { key: "order_no", label: "Order" },
      { key: "dun_type", label: "Dun (yang/yin)" },
    ],
  },
  qm_stem_combos: {
    type: "qm_stem_combos",
    table: "ref_qimen_stem_combo_dict",
    section: "QiMen Stem Combos · 100 combinations",
    pkColumn: "combo_code",
    listColumns: ["combo_code", "name_zh", "name_th", "base_quality"],
    fields: [
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [
      { key: "combo_code", label: "Code" },
      { key: "heaven_stem_code", label: "Heaven" },
      { key: "earth_stem_code", label: "Earth" },
      { key: "name_zh", label: "ZH" },
      { key: "base_quality", label: "Quality" },
    ],
  },
  qm_ju_mapping: {
    type: "qm_ju_mapping",
    table: "ref_qimen_ju_mapping",
    section: "QiMen 局 Mapping · 24×3 = 72",
    pkColumn: "id",
    listColumns: ["id", "solar_term_code", "yuan_cycle", "dun_type", "ju_number"],
    fields: [
      { key: "note", label: "Note · บันทึก/ความเห็นซินแส", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "solar_term_code", label: "Solar Term" },
      { key: "yuan_cycle", label: "Yuan (upper/middle/lower)" },
      { key: "dun_type", label: "Dun" },
      { key: "ju_number", label: "Ju 1-9" },
    ],
  },
  qm_charts: {
    type: "qm_charts",
    table: "ref_qimen_charts",
    section: "QiMen Charts · 1,080 ผังตำราคลาสสิก",
    pkColumn: "id",
    listColumns: ["id", "pillar_zh", "dun_type", "ju_number", "chief_star_code"],
    fields: [
      { key: "note", label: "Note · บันทึก/ความเห็นซินแส", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "id", label: "Chart ID" },
      { key: "pillar_zh", label: "Pillar" },
      { key: "dun_type", label: "Dun" },
      { key: "ju_number", label: "Ju" },
      { key: "chief_star_code", label: "Chief Star" },
      { key: "chief_deity_code", label: "Chief Deity" },
      { key: "zhi_shi_door_code", label: "Zhi Shi Door" },
      { key: "traveling_horse_zh", label: "Horse" },
      { key: "tian_yi_star_zh", label: "Tian Yi" },
    ],
  },
  /* ─────────── Phase 18C · Hourkey JSON 12 หมวด ─────────── */
  jiazi_year: {
    type: "jiazi_year",
    table: "ref_jiazi_year_table",
    section: "甲子年表 · JiaZi Year Table (181 ปี)",
    pkColumn: "year",
    listColumns: ["year", "year_pillar"],
    fields: [
      { key: "note", label: "Note · บันทึก/ความเห็นซินแส", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [
      { key: "year", label: "Year" },
      { key: "year_pillar", label: "Year Pillar" },
    ],
  },
  kongwang_60: {
    type: "kongwang_60",
    table: "ref_kongwang_60_table",
    section: "空亡 · Kong Wang 60-table",
    pkColumn: "pillar",
    listColumns: ["pillar"],
    fields: [
      { key: "note", label: "Note · บันทึก/ความเห็นซินแส", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [{ key: "pillar", label: "Pillar" }],
  },
  key_talents: {
    type: "key_talents",
    table: "ref_key_talents",
    section: "Key Talents · พรสวรรค์หลัก (23)",
    pkColumn: "id",
    listColumns: ["id", "archetype", "title_th", "title_en"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "items", label: "Items (jsonb array)", kind: "jsonb", trilingual: true },
    ],
    fixedColumns: [{ key: "archetype", label: "Archetype" }],
  },
  mindset_shifts: {
    type: "mindset_shifts",
    table: "ref_mindset_shifts",
    section: "Mindset Shifts · เปลี่ยน mindset (24)",
    pkColumn: "id",
    listColumns: ["id", "quote_th", "quote_en"],
    fields: [
      { key: "quote", label: "Quote", kind: "text", trilingual: true, rows: 2 },
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [],
  },
  strategic_shifts: {
    type: "strategic_shifts",
    table: "ref_strategic_shifts",
    section: "15 Strategic Shifts · กลยุทธ์",
    pkColumn: "id",
    listColumns: ["id", "archetype", "title_th", "title_en"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "stop", label: "หยุดทำ · Stop doing", kind: "text", trilingual: true, rows: 3 },
      { key: "start", label: "เริ่มทำ · Start doing", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [{ key: "archetype", label: "Archetype" }],
  },
  breakthrough_strategies: {
    type: "breakthrough_strategies",
    table: "ref_breakthrough_strategies",
    section: "Breakthrough Strategies (5)",
    pkColumn: "id",
    listColumns: ["id", "archetype"],
    fields: [
      { key: "points", label: "Points (jsonb)", kind: "jsonb", trilingual: true },
    ],
    fixedColumns: [{ key: "archetype", label: "Archetype" }],
  },
  zone_of_genius: {
    type: "zone_of_genius",
    table: "ref_zone_of_genius",
    section: "Zone of Genius · เขตอัจฉริยะ (5)",
    pkColumn: "id",
    listColumns: ["id", "archetype_th", "title_th"],
    fields: [
      { key: "title", label: "Title", kind: "varchar", trilingual: true },
      { key: "items", label: "Items (jsonb)", kind: "jsonb", trilingual: true },
    ],
    fixedColumns: [
      { key: "archetype_context", label: "Context" },
      { key: "archetype_th", label: "Archetype TH" },
    ],
  },
  pillar_echo: {
    type: "pillar_echo",
    table: "ref_pillar_echo",
    section: "Pillar Echo · เสาเดินผ่านเสาเกิด (4)",
    pkColumn: "pillar_position",
    listColumns: ["pillar_position"],
    fields: [
      { key: "note", label: "Note · บันทึก/ความเห็นซินแส", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [{ key: "pillar_position", label: "Position" }],
  },
  element_cycles_dict: {
    type: "element_cycles_dict",
    table: "ref_element_cycles",
    section: "Element Cycles · 相生 相剋 ฯลฯ (4)",
    pkColumn: "cycle_name",
    listColumns: ["cycle_name"],
    fields: [
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [{ key: "cycle_name", label: "Cycle" }],
  },
  bazi_lookup_tables: {
    type: "bazi_lookup_tables",
    table: "ref_bazi_lookup_tables",
    section: "BaZi Lookup Tables · 12 ตำรา",
    pkColumn: "lookup_name",
    listColumns: ["lookup_name"],
    fields: [
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 3 },
    ],
    fixedColumns: [{ key: "lookup_name", label: "Lookup Name" }],
  },
  crisis_detection: {
    type: "crisis_detection",
    table: "ref_crisis_detection",
    section: "Crisis Detection · ตัวตรวจวิกฤต (11)",
    pkColumn: "tier_name",
    listColumns: ["tier_name"],
    fields: [
      { key: "description", label: "Description", kind: "text", trilingual: true, rows: 4 },
    ],
    fixedColumns: [{ key: "tier_name", label: "Tier" }],
  },
};

export function expandFields(fields: ParaphraseField[]): string[] {
  const cols: string[] = [];
  for (const f of fields) {
    if (f.trilingual) {
      cols.push(`${f.key}_en`, `${f.key}_th`, `${f.key}_zh`);
    } else {
      cols.push(f.key);
    }
  }
  return cols;
}
