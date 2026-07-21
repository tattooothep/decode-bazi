/* luopan-redesign-data.js — คัดลอกตรงจาก public/luopan.html (r515) บรรทัด 681-930 · ห้ามแก้ค่า (คัมภีร์=source of truth)
   ใช้เฉพาะหน้า _preview/luopan-d1..d4.html · สร้าง 14 ก.ค. 2026 */
// ─── Heavenly Stems · 十天干
const STEMS_10 = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];

// ─── Earthly Branches · 十二地支
const BRANCHES_12 = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

// Stem → element / yinyang
const STEM_META = {
  '甲':{el:'木',yy:'陽'}, '乙':{el:'木',yy:'陰'},
  '丙':{el:'火',yy:'陽'}, '丁':{el:'火',yy:'陰'},
  '戊':{el:'土',yy:'陽'}, '己':{el:'土',yy:'陰'},
  '庚':{el:'金',yy:'陽'}, '辛':{el:'金',yy:'陰'},
  '壬':{el:'水',yy:'陽'}, '癸':{el:'水',yy:'陰'},
};
const BRANCH_META = {
  '子':{el:'水',yy:'陽'},'丑':{el:'土',yy:'陰'},'寅':{el:'木',yy:'陽'},
  '卯':{el:'木',yy:'陰'},'辰':{el:'土',yy:'陽'},'巳':{el:'火',yy:'陰'},
  '午':{el:'火',yy:'陽'},'未':{el:'土',yy:'陰'},'申':{el:'金',yy:'陽'},
  '酉':{el:'金',yy:'陰'},'戌':{el:'土',yy:'陽'},'亥':{el:'水',yy:'陰'},
};

// ─── 24 Mountains · 二十四山
const MOUNTAINS_24 = [
  { c:'壬',t:'干',el:'水',grp:'坎' },{ c:'子',t:'支',el:'水',grp:'坎' },{ c:'癸',t:'干',el:'水',grp:'坎' },
  { c:'丑',t:'支',el:'土',grp:'艮' },{ c:'艮',t:'卦',el:'土',grp:'艮' },{ c:'寅',t:'支',el:'木',grp:'艮' },
  { c:'甲',t:'干',el:'木',grp:'震' },{ c:'卯',t:'支',el:'木',grp:'震' },{ c:'乙',t:'干',el:'木',grp:'震' },
  { c:'辰',t:'支',el:'土',grp:'巽' },{ c:'巽',t:'卦',el:'木',grp:'巽' },{ c:'巳',t:'支',el:'火',grp:'巽' },
  { c:'丙',t:'干',el:'火',grp:'離' },{ c:'午',t:'支',el:'火',grp:'離' },{ c:'丁',t:'干',el:'火',grp:'離' },
  { c:'未',t:'支',el:'土',grp:'坤' },{ c:'坤',t:'卦',el:'土',grp:'坤' },{ c:'申',t:'支',el:'金',grp:'坤' },
  { c:'庚',t:'干',el:'金',grp:'兌' },{ c:'酉',t:'支',el:'金',grp:'兌' },{ c:'辛',t:'干',el:'金',grp:'兌' },
  { c:'戌',t:'支',el:'土',grp:'乾' },{ c:'乾',t:'卦',el:'金',grp:'乾' },{ c:'亥',t:'支',el:'水',grp:'乾' },
];

// ─── 24 Solar Terms · 二十四節氣 (start 冬至 at N=0°)
const SOLAR_TERMS = [
  '冬至','小寒','大寒','立春','雨水','驚蟄',
  '春分','清明','穀雨','立夏','小滿','芒種',
  '夏至','小暑','大暑','立秋','處暑','白露',
  '秋分','寒露','霜降','立冬','小雪','大雪'
];

// ─── 8 Trigrams Post-Heaven · 後天八卦 (Lo Shu order around compass)
const TRIGRAMS_POST = [
  { c:'坎',el:'水',dir:'N', center:0,  color:'#3a2d5e', num:1 },
  { c:'艮',el:'土',dir:'NE',center:45, color:'#5e5530', num:8 },
  { c:'震',el:'木',dir:'E', center:90, color:'#2f4a2a', num:3 },
  { c:'巽',el:'木',dir:'SE',center:135,color:'#3a5e34', num:4 },
  { c:'離',el:'火',dir:'S', center:180,color:'#6e2820', num:9 },
  { c:'坤',el:'土',dir:'SW',center:225,color:'#5a4a25', num:2 },
  { c:'兌',el:'金',dir:'W', center:270,color:'#3a3a40', num:7 },
  { c:'乾',el:'金',dir:'NW',center:315,color:'#2a2a30', num:6 },
];

// ─── 8 Trigrams Pre-Heaven · 先天八卦 (Fu Xi order)
// Compass arrangement: 乾S 兌SE 離E 震NE 巽SW 坎W 艮NW 坤N
const TRIGRAMS_PRE = [
  { c:'坤',center:0,   lines:[0,0,0] },
  { c:'震',center:45,  lines:[1,0,0] },
  { c:'離',center:90,  lines:[1,0,1] },
  { c:'兌',center:135, lines:[1,1,0] },
  { c:'乾',center:180, lines:[1,1,1] },
  { c:'巽',center:225, lines:[0,1,1] },
  { c:'坎',center:270, lines:[0,1,0] },
  { c:'艮',center:315, lines:[0,0,1] },
];

const TRIGRAM_LINES = {
  '乾':[1,1,1], '兌':[1,1,0], '離':[1,0,1], '震':[1,0,0],
  '巽':[0,1,1], '坎':[0,1,0], '艮':[0,0,1], '坤':[0,0,0],
};

// ─── 28 Lunar Mansions · 二十八宿
const MANSIONS_28 = [
  // East · 青龍
  { c:'角',q:'E',ani:'蛟' },{ c:'亢',q:'E',ani:'龍' },{ c:'氐',q:'E',ani:'貉' },
  { c:'房',q:'E',ani:'兔' },{ c:'心',q:'E',ani:'狐' },{ c:'尾',q:'E',ani:'虎' },{ c:'箕',q:'E',ani:'豹' },
  // North · 玄武
  { c:'斗',q:'N',ani:'獬' },{ c:'牛',q:'N',ani:'牛' },{ c:'女',q:'N',ani:'蝠' },
  { c:'虛',q:'N',ani:'鼠' },{ c:'危',q:'N',ani:'燕' },{ c:'室',q:'N',ani:'豬' },{ c:'壁',q:'N',ani:'貐' },
  // West · 白虎
  { c:'奎',q:'W',ani:'狼' },{ c:'婁',q:'W',ani:'狗' },{ c:'胃',q:'W',ani:'雉' },
  { c:'昴',q:'W',ani:'雞' },{ c:'畢',q:'W',ani:'烏' },{ c:'觜',q:'W',ani:'猴' },{ c:'參',q:'W',ani:'猿' },
  // South · 朱雀
  { c:'井',q:'S',ani:'犴' },{ c:'鬼',q:'S',ani:'羊' },{ c:'柳',q:'S',ani:'獐' },
  { c:'星',q:'S',ani:'馬' },{ c:'張',q:'S',ani:'鹿' },{ c:'翼',q:'S',ani:'蛇' },{ c:'軫',q:'S',ani:'蚓' },
];

// ─── 60 Jiazi · 六十甲子 (sexagenary cycle)
const JIAZI_60 = [];
for (let i = 0; i < 60; i++) {
  JIAZI_60.push({ s: STEMS_10[i % 10], b: BRANCHES_12[i % 12] });
}

// ─── 60 Jiazi 納音五行 · sound element (each pair shares element)
/* 六十甲子納音五行 — regenerate ให้ตรงตำรา (30 คู่ × 2) · verify เทียบ luopan_complete.json */
const NAYIN_ELEMENTS = [
  '金','金','火','火','木','木','土','土','金','金',  /* 甲子乙丑海中金 丙寅丁卯爐中火 戊辰己巳大林木 庚午辛未路旁土 壬申癸酉劍鋒金 */
  '火','火','水','水','土','土','金','金','木','木',  /* 甲戌乙亥山頭火 丙子丁丑澗下水 戊寅己卯城頭土 庚辰辛巳白蠟金 壬午癸未楊柳木 */
  '水','水','土','土','火','火','木','木','水','水',  /* 甲申乙酉泉中水 丙戌丁亥屋上土 戊子己丑霹靂火 庚寅辛卯松柏木 壬辰癸巳長流水 */
  '金','金','火','火','木','木','土','土','金','金',  /* 甲午乙未沙中金 丙申丁酉山下火 戊戌己亥平地木 庚子辛丑壁上土 壬寅癸卯金箔金 */
  '火','火','水','水','土','土','金','金','木','木',  /* 甲辰乙巳覆燈火 丙午丁未天河水 戊申己酉大驛土 庚戌辛亥釵釧金 壬子癸丑桑柘木 */
  '水','水','土','土','火','火','木','木','水','水',  /* 甲寅乙卯大溪水 丙辰丁巳沙中土 戊午己未天上火 庚申辛酉石榴木 壬戌癸亥大海水 */
];

// ─── 64 Hexagrams · 六十四卦 (圓圖 Shao Yong, starts 復 at N)
const HEXAGRAMS_64 = [
  '復','頤','屯','益','震','噬嗑','隨','无妄',
  '明夷','賁','既濟','家人','豐','離','革','同人',
  '臨','損','節','中孚','歸妹','睽','兌','履',
  '泰','大畜','需','小畜','大壯','大有','夬','乾',
  /* ครึ่งหลัง idx32-63 = 錯卦ตรงข้าม (復↔姤) · แก้จากเดิมที่ใส่แบบวน順ผิด圓圖 */
  '姤','大過','鼎','恆','巽','井','蠱','升',
  '訟','困','未濟','解','渙','坎','蒙','師',
  '遯','咸','旅','小過','漸','蹇','艮','謙',
  '否','萃','晉','豫','觀','比','剝','坤'
];

// Hexagram lower/upper trigrams (for line drawing + element derivation)
// 64卦 composition: ชื่อกว้า → {lower下卦, upper上卦} (ตาราง 8×8 มาตรฐาน King Wen)
const HEX_COMPOSE = {
  '乾':['乾','乾'],'夬':['乾','兌'],'大有':['乾','離'],'大壯':['乾','震'],'小畜':['乾','巽'],'需':['乾','坎'],'大畜':['乾','艮'],'泰':['乾','坤'],
  '履':['兌','乾'],'兌':['兌','兌'],'睽':['兌','離'],'歸妹':['兌','震'],'中孚':['兌','巽'],'節':['兌','坎'],'損':['兌','艮'],'臨':['兌','坤'],
  '同人':['離','乾'],'革':['離','兌'],'離':['離','離'],'豐':['離','震'],'家人':['離','巽'],'既濟':['離','坎'],'賁':['離','艮'],'明夷':['離','坤'],
  '无妄':['震','乾'],'隨':['震','兌'],'噬嗑':['震','離'],'震':['震','震'],'益':['震','巽'],'屯':['震','坎'],'頤':['震','艮'],'復':['震','坤'],
  '姤':['巽','乾'],'大過':['巽','兌'],'鼎':['巽','離'],'恆':['巽','震'],'巽':['巽','巽'],'井':['巽','坎'],'蠱':['巽','艮'],'升':['巽','坤'],
  '訟':['坎','乾'],'困':['坎','兌'],'未濟':['坎','離'],'解':['坎','震'],'渙':['坎','巽'],'坎':['坎','坎'],'蒙':['坎','艮'],'師':['坎','坤'],
  '遯':['艮','乾'],'咸':['艮','兌'],'旅':['艮','離'],'小過':['艮','震'],'漸':['艮','巽'],'蹇':['艮','坎'],'艮':['艮','艮'],'謙':['艮','坤'],
  '否':['坤','乾'],'萃':['坤','兌'],'晉':['坤','離'],'豫':['坤','震'],'觀':['坤','巽'],'比':['坤','坎'],'剝':['坤','艮'],'坤':['坤','坤'],
};
function hexTrigrams(i) {
  const name = HEXAGRAMS_64[i];
  const c = HEX_COMPOSE[name] || ['坤','坤'];
  return { lower: c[0], upper: c[1] };
}
function hexLines6(i) {
  const { lower, upper } = hexTrigrams(i);
  return [...TRIGRAM_LINES[lower], ...TRIGRAM_LINES[upper]]; // 6 lines bottom→top
}
function hexElement(i) {
  // ธาตุจาก上卦 (upper trigram) ตามตำรา
  const u = hexTrigrams(i).upper;
  return ({ '乾':'金','兌':'金','離':'火','震':'木','巽':'木','坎':'水','艮':'土','坤':'土' })[u];
}
// 64 Hexagram XKDG Period (卦運) — using 三元九運 derivation
// Each hexagram maps to a period 1-9 based on its Xuan Kong cycle.
// Standard table (簡化版 deterministic mapping for visual fidelity)
function hexPeriod(i) {
  // 24 พ.ค. · ใช้ guaYun จริงจากตาราง玄空大卦 (xkdg-64-gua.json · 3 agent verify) ที่โหลดเข้า window.XKDG
  // map: ตำแหน่งวง i → ชื่อกว้าสั้น HEXAGRAMS_64[i] → guaYun · ถ้า XKDG ยังไม่โหลด แสดง '—' (จะ re-render เมื่อโหลดเสร็จ)
  var XK = (typeof window !== 'undefined') ? window.XKDG : null;
  if (!XK || !XK.guaYunByName) return '—';
  var v = XK.guaYunByName[HEXAGRAMS_64[i]];
  return (v == null) ? '—' : v;
}

// ─── Period 9 Flying Stars · 山·水·運 per direction (子山午向 下卦)
// Each direction shows three numbers: 山星 (Mountain), 水星 (Water), 運星 (Earth/Base)
// 子山午向 運9 下卦 = 旺山旺向 (到山到向) · verify ซินแส: 坐N得山星9旺, 向首S得向星9旺
// mt=山星 wt=向星 er=運星 (ของเดิมผิดเกือบทุกวัง · แก้ตาม Reviewer#2)
const FLYING_STARS_P9 = {
  'N':  { mt:9, wt:8, er:5 },  // 坐山 — 山星9旺到坐
  'NE': { mt:2, wt:1, er:3 },
  'E':  { mt:7, wt:6, er:7 },
  'SE': { mt:6, wt:5, er:8 },
  'S':  { mt:1, wt:9, er:4 },  // 向首 — 向星9旺到向
  'SW': { mt:8, wt:7, er:6 },
  'W':  { mt:3, wt:2, er:2 },
  'NW': { mt:4, wt:3, er:1 },
  'C':  { mt:5, wt:4, er:9 },  // 中宮
};

// ─── 5 Elements colors
const ELEMENT_COLOR = {
  '金':'#cdb87a', '木':'#7fa867', '水':'#5b7fb0',
  '火':'#c0584a', '土':'#b88a4a',
};

// ─── 120 Fenjin · 120分金 (60 jiazi cycled twice; 5 per mountain)
// Each mountain has 5 fenjin entries marked 孤虛旺敗龜甲 (or similar)
const FENJIN_LABELS = ['孤','旺','敗','虛','龜'];

// ─── 72 Dragons 透地龍 · 60 jiazi + 12 空亡 boundaries
// At each of 12 inter-branch boundaries (every 30°) sits a 空亡
// Otherwise jiazi cycles through.
function build72Dragons() {
  /* 穿山七十二龍 · 5干同支ต่อ地支 + 大空亡 1 ใต้แต่ละ支 (12) · ช่อง[0]=甲子 เริ่มที่ 壬末/子初 (352.5°) center 355°
   * 五子分布: กิ่งหยาง(子寅辰午申戌)→ก้านหยาง甲丙戊庚壬 · กิ่งอิน(丑卯巳未酉亥)→ก้านอิน乙丁己辛癸 · เริ่มเลื่อนทีละ1 ตามรอบ甲子 */
  const G = [
    { b:'子', st:['甲','丙','戊','庚','壬'], e:'癸' },
    { b:'丑', st:['乙','丁','己','辛','癸'], e:'艮' },
    { b:'寅', st:['丙','戊','庚','壬','甲'], e:'甲' },
    { b:'卯', st:['丁','己','辛','癸','乙'], e:'乙' },
    { b:'辰', st:['戊','庚','壬','甲','丙'], e:'巽' },
    { b:'巳', st:['己','辛','癸','乙','丁'], e:'丙' },
    { b:'午', st:['庚','壬','甲','丙','戊'], e:'丁' },
    { b:'未', st:['辛','癸','乙','丁','己'], e:'坤' },
    { b:'申', st:['壬','甲','丙','戊','庚'], e:'庚' },
    { b:'酉', st:['癸','乙','丁','己','辛'], e:'辛' },
    { b:'戌', st:['甲','丙','戊','庚','壬'], e:'乾' },
    { b:'亥', st:['乙','丁','己','辛','癸'], e:'壬' },
  ];
  const out = [];
  for (const g of G) {
    for (const s of g.st) out.push({ type:'jiazi', s, b:g.b });
    out.push({ type:'kong', label:'空', under:g.e });
  }
  return out; /* 72 ช่อง · ช่อง k center = 352.5 + k*5 + 2.5 */
}

// ─── 60 Chuanshan Dragons · 透地60龍 (60 jiazi with 納音五行)
// Each spans 6°, offset 3° from 60甲子 ring
function buildChuanshan() {
  /* 透地六十龍 · 5干同支 (เหมือน穿山72 แต่ไม่มี空亡) · 60 ช่อง × 6° · ช่อง[0]=甲子 เริ่ม壬初 337.5° center 340.5° */
  const G = [
    { b:'子', st:['甲','丙','戊','庚','壬'] }, { b:'丑', st:['乙','丁','己','辛','癸'] },
    { b:'寅', st:['丙','戊','庚','壬','甲'] }, { b:'卯', st:['丁','己','辛','癸','乙'] },
    { b:'辰', st:['戊','庚','壬','甲','丙'] }, { b:'巳', st:['己','辛','癸','乙','丁'] },
    { b:'午', st:['庚','壬','甲','丙','戊'] }, { b:'未', st:['辛','癸','乙','丁','己'] },
    { b:'申', st:['壬','甲','丙','戊','庚'] }, { b:'酉', st:['癸','乙','丁','己','辛'] },
    { b:'戌', st:['甲','丙','戊','庚','壬'] }, { b:'亥', st:['乙','丁','己','辛','癸'] },
  ];
  const out = [];
  for (const g of G) for (const s of g.st) {
    const idx = JIAZI_60.findIndex(j => j.s===s && j.b===g.b);
    out.push({ s, b:g.b, el: NAYIN_ELEMENTS[idx>=0?idx:0] });
  }
  return out; /* 60 ช่อง · ช่อง k center = 337.5 + k*6 + 3 */
}

// ─── 384 Yao · 384爻 (64 hex × 6 lines, labeled 初/二/三/四/五/上 + 九/六)
const YAO_POS = ['初','二','三','四','五','上'];

// ─── 9 Palaces · period 9 base chart
const LO_SHU_P9 = [
  [8, 4, 6],
  [7, 9, 2],
  [3, 5, 1],
];

// Export
window.LUOPAN = {
  STEMS_10, BRANCHES_12, STEM_META, BRANCH_META,
  MOUNTAINS_24, SOLAR_TERMS,
  TRIGRAMS_POST, TRIGRAMS_PRE, TRIGRAM_LINES,
  MANSIONS_28, JIAZI_60, NAYIN_ELEMENTS,
  HEXAGRAMS_64, hexTrigrams, hexLines6, hexElement, hexPeriod,
  FLYING_STARS_P9, ELEMENT_COLOR,
  FENJIN_LABELS, build72Dragons, buildChuanshan, YAO_POS,
  LO_SHU_P9,
};
