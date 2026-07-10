/**
 * POST /api/today/actions
 *
 * รับ: { date: 'YYYY-MM-DD', userChart: { day:{stem,branch}, ... } }
 * คืน: { actions: [{goal, icon, title, signal, tips, tenGod, narrative}] }
 *
 * 4 หมวด: wealth · career · love · health (ทำตาม today.html รับ)
 */
import { NextResponse } from "next/server";

const STEM_ELEMENT: Record<string, "wood"|"fire"|"earth"|"metal"|"water"> = {
  甲:"wood",乙:"wood",丙:"fire",丁:"fire",戊:"earth",己:"earth",
  庚:"metal",辛:"metal",壬:"water",癸:"water",
};
const STEM_POLARITY: Record<string, "yang"|"yin"> = {
  甲:"yang",乙:"yin",丙:"yang",丁:"yin",戊:"yang",己:"yin",
  庚:"yang",辛:"yin",壬:"yang",癸:"yin",
};
const ELEMENT_CONTROLS: Record<string,string> = {wood:"earth",earth:"water",water:"fire",fire:"metal",metal:"wood"};
const ELEMENT_PRODUCES: Record<string,string> = {wood:"fire",fire:"earth",earth:"metal",metal:"water",water:"wood"};

function tenGod(dm: string, target: string): string {
  const dmEl = STEM_ELEMENT[dm];
  const tEl = STEM_ELEMENT[target];
  const same = STEM_POLARITY[dm] === STEM_POLARITY[target];
  if (dmEl === tEl) return same ? "比肩" : "劫財";
  if (ELEMENT_PRODUCES[dmEl] === tEl) return same ? "食神" : "傷官";
  if (ELEMENT_CONTROLS[dmEl] === tEl) return same ? "偏財" : "正財";
  if (ELEMENT_CONTROLS[tEl] === dmEl) return same ? "七殺" : "正官";
  if (ELEMENT_PRODUCES[tEl] === dmEl) return same ? "偏印" : "正印";
  return "—";
}

/* signal = HIGH | STEADY | LOW · ตาม goal ↔ ten god */
function signalFor(tg: string, goal: "wealth"|"career"|"love"|"health"): "HIGH"|"STEADY"|"LOW" {
  if (goal === "wealth") {
    if (tg === "正財" || tg === "偏財") return "HIGH";
    if (tg === "食神" || tg === "傷官") return "HIGH";
    if (tg === "比肩" || tg === "劫財") return "LOW";
    return "STEADY";
  }
  if (goal === "career") {
    if (tg === "正官" || tg === "七殺") return "HIGH";
    if (tg === "正印" || tg === "偏印") return "STEADY";
    if (tg === "傷官") return "LOW";
    return "STEADY";
  }
  if (goal === "love") {
    if (tg === "正財" || tg === "正官") return "HIGH";
    if (tg === "偏財" || tg === "七殺") return "STEADY";
    if (tg === "劫財" || tg === "比肩") return "LOW";
    return "STEADY";
  }
  /* health */
  if (tg === "正印" || tg === "偏印") return "HIGH";
  if (tg === "比肩" || tg === "食神") return "STEADY";
  if (tg === "七殺" || tg === "傷官") return "LOW";
  return "STEADY";
}

/* matrix · narrative เฉพาะ goal × ten god · 17 พ.ค. แก้บั๊ก 4 การ์ดข้อความซ้ำ */
const NARRATIVE_BY_GOAL: Record<string, Record<string, string>> = {
  wealth: {
    正財:"ทรัพย์ตรง · เซ็นสัญญาเงิน · ปิดดีลถาวร",
    偏財:"ทรัพย์ลื่น · เก็งกำไร · ลงทุนสั้น",
    食神:"ทำเงินจากงานสร้างสรรค์ · ขายไอเดีย",
    傷官:"แปลงพรสวรรค์เป็นเงิน · ระวังคำพูดเรื่องเงิน",
    比肩:"เพื่อนช่วยหาเงิน · ระวังแบ่งทรัพย์",
    劫財:"คู่แข่งแย่งทรัพย์ · ระมัดระวังการเงิน",
    正官:"เงินจากระบบ·เงินเดือนราชการ",
    七殺:"ค่าตอบแทนชั่วคราว · งานกดดัน",
    正印:"พึ่งครอบครัว·ทุนการศึกษา",
    偏印:"เงินจากงานเฉพาะทาง·พิเศษ",
  },
  career: {
    正官:"อำนาจ/ราชการ · เซ็นเอกสาร · นัดหัวหน้า",
    七殺:"งานเฉียบขาด · ระวังขัดแย้งกับเจ้านาย",
    正財:"งานประจำ · เงินเดือนมั่นคง",
    偏財:"งานพิเศษ · freelance · commission",
    正印:"เรียน·อบรม · งานสอน·ที่ปรึกษา",
    偏印:"งานวิจัย·วิเคราะห์ · งานเฉพาะทาง",
    食神:"งานสร้างสรรค์ · ออกแบบ·เนื้อหา",
    傷官:"แสดงผลงาน·พรีเซนต์ · ระวังคำพูด",
    比肩:"งานทีม·ร่วมมือ · พี่น้อง",
    劫財:"งานแข่งขัน · ระวังเสียพาร์ทเนอร์",
  },
  love: {
    正財:"คู่ครองมั่นคง · มอบความใส่ใจให้คู่",
    正官:"คู่ที่เป็นทางการ · ความผูกพันลึก",
    偏財:"ความรักลื่น · romance ใหม่",
    七殺:"ความรักรุนแรง · ระวังขัดแย้ง",
    食神:"วันโรแมนติก · กิจกรรมสร้างสุข",
    傷官:"เสน่ห์เด่น · ระวังคำพูดเจ็บคู่",
    比肩:"เพื่อนแย่งคู่ · ระวังคนที่สาม",
    劫財:"คู่แข่งในความรัก · พึ่งตัวเอง",
    正印:"ใส่ใจครอบครัว·พ่อแม่คู่",
    偏印:"ความรักลึกซึ้ง·เฉพาะตัว",
  },
  health: {
    正印:"พักฟื้น·ดูแลตัว · อบอุ่นจากครอบครัว",
    偏印:"ระวังเครียด·วิตก · สมาธิ·พักผ่อน",
    比肩:"ออกกำลังกับเพื่อน·ทีม",
    食神:"กินดี·ดื่มน้ำพอ · นอนเต็มอิ่ม",
    傷官:"ระวังระบบประสาท·พูดเยอะ · พักเสียง",
    正官:"ระวังเครียดงาน · อย่าฝืน",
    七殺:"ระวังอุบัติเหตุ · ไม่ฝืนแรง",
    正財:"หาหมอ·ตรวจสุขภาพประจำ",
    偏財:"ระวังกิน·เครื่องดื่ม",
    劫財:"ระวังเสียทรัพย์รักษาตัว",
  },
};

const TIPS: Record<string, string[]> = {
  wealth: ["เซ็นเอกสารเงิน","เจรจาราคา","ทบทวนงบ"],
  career: ["นัดหัวหน้า","ส่งงานสำคัญ","สรุปผลงาน"],
  love:   ["นัดคู่/คุยลึก","ตกแต่งบ้าน","ทบทวนความรัก"],
  health: ["พักผ่อน","ออกกำลังเบา","ดื่มน้ำให้พอ"],
};

/* r420 · i18n additive · EN/ZH ของข้อความ engine (title/tips/narrative) — ไม่แตะ logic/signal */
const TIPS_EN: Record<string, string[]> = {
  wealth: ["Sign financial documents","Negotiate prices","Review the budget"],
  career: ["Meet your boss","Deliver key work","Summarize results"],
  love:   ["Date / deep talk with partner","Decorate the home","Reflect on the relationship"],
  health: ["Rest well","Light exercise","Drink enough water"],
};
const TIPS_ZH: Record<string, string[]> = {
  wealth: ["簽署財務文件","議價談判","檢視預算"],
  career: ["約見上司","交付要務","總結成果"],
  love:   ["約會／深談","佈置居家","檢視感情"],
  health: ["充分休息","輕度運動","足量飲水"],
};
const NARRATIVE_BY_GOAL_EN: Record<string, Record<string, string>> = {
  wealth: {
    正財:"Direct wealth · sign money contracts · close lasting deals",
    偏財:"Fluid wealth · speculation · short-term investing",
    食神:"Earn from creative work · sell your ideas",
    傷官:"Turn talent into income · watch your words about money",
    比肩:"Friends help earn · beware splitting assets",
    劫財:"Rivals contest your wealth · handle finances carefully",
    正官:"Income from the system · salary / government pay",
    七殺:"Temporary compensation · high-pressure work",
    正印:"Family support · scholarships",
    偏印:"Income from specialized · niche work",
  },
  career: {
    正官:"Authority / officialdom · sign documents · meet superiors",
    七殺:"Decisive work · beware conflict with the boss",
    正財:"Steady job · stable salary",
    偏財:"Side jobs · freelance · commission",
    正印:"Study / training · teaching or advisory work",
    偏印:"Research / analysis · specialized work",
    食神:"Creative work · design and content",
    傷官:"Showcase / present work · watch your words",
    比肩:"Teamwork · collaboration · peers",
    劫財:"Competitive work · beware losing a partner",
  },
  love: {
    正財:"Stable partner · give your partner attention",
    正官:"Formal partner · deep commitment",
    偏財:"Flowing romance · new sparks",
    七殺:"Intense love · beware conflicts",
    食神:"Romantic day · joyful activities",
    傷官:"Charm shines · words can hurt your partner",
    比肩:"A friend may rival for your partner · beware a third party",
    劫財:"Rivals in love · rely on yourself",
    正印:"Care for family · partner's parents",
    偏印:"Deep, private affection",
  },
  health: {
    正印:"Recover and self-care · family warmth",
    偏印:"Watch stress and worry · meditation and rest",
    比肩:"Exercise with friends or a team",
    食神:"Eat well · hydrate · sleep fully",
    傷官:"Mind the nervous system · rest your voice",
    正官:"Watch work stress · do not push through",
    七殺:"Beware accidents · do not overexert",
    正財:"See a doctor · routine health checks",
    偏財:"Watch food and drink",
    劫財:"Beware losing money on treatment",
  },
};
const NARRATIVE_BY_GOAL_ZH: Record<string, Record<string, string>> = {
  wealth: {
    正財:"正財穩得 · 宜簽財務契約 · 成交長久之局",
    偏財:"偏財流動 · 投機求利 · 短線布局",
    食神:"以創作生財 · 售出點子",
    傷官:"才華變現 · 言談涉財宜慎",
    比肩:"友朋助財 · 防分財",
    劫財:"劫財爭奪 · 理財宜慎",
    正官:"體制之財 · 俸祿薪資",
    七殺:"短期酬勞 · 高壓之務",
    正印:"倚靠家庭 · 學業之資",
    偏印:"專門技藝之財",
  },
  career: {
    正官:"權貴官方 · 宜簽文書 · 面見上司",
    七殺:"行事果決 · 防與上司相衝",
    正財:"正職安穩 · 薪俸可靠",
    偏財:"兼職外快 · 自由接案 · 佣金",
    正印:"進修受訓 · 授業顧問",
    偏印:"研究分析 · 專門之務",
    食神:"創意之工 · 設計內容",
    傷官:"展才簡報 · 言辭宜慎",
    比肩:"團隊協作 · 同儕相助",
    劫財:"競爭之務 · 防失夥伴",
  },
  love: {
    正財:"正緣安穩 · 用心待伴",
    正官:"名分之緣 · 情深意重",
    偏財:"桃花流動 · 新戀萌動",
    七殺:"情烈如火 · 防生齟齬",
    食神:"浪漫之日 · 同樂之事",
    傷官:"魅力外露 · 言語勿傷伴",
    比肩:"友奪其愛 · 防第三者",
    劫財:"情場逢敵 · 自立自持",
    正印:"顧念家庭 · 侍奉雙親",
    偏印:"情深內斂 · 獨鍾一人",
  },
  health: {
    正印:"靜養調息 · 家庭溫暖",
    偏印:"防思慮過度 · 靜坐休養",
    比肩:"與友同練 · 團體運動",
    食神:"飲食得宜 · 睡眠充足",
    傷官:"防神經耗損 · 少言養聲",
    正官:"防公務勞心 · 勿強撐",
    七殺:"防意外 · 勿逞強",
    正財:"就醫檢查 · 例行體檢",
    偏財:"飲食宜節制",
    劫財:"防破財於醫藥",
  },
};
const NARRATIVE_FALLBACK = {
  th: (tg: string) => `${tg} · ช่วงปกติของหมวดนี้`,
  en: (tg: string) => `${tg} · a normal period for this area`,
  zh: (tg: string) => `${tg} · 此域平常之期`,
};
const NARRATIVE_GUEST = {
  th: "วันที่ลงทะเบียนเพื่อดูส่วนตัว",
  en: "Register to see your personal reading",
  zh: "註冊後可看個人解讀",
};
const GOAL_TITLE_EN: Record<string, string> = {
  wealth: "Wealth · 財", career: "Career · 業", love: "Love · 情", health: "Health · 健",
};
const GOAL_TITLE_ZH: Record<string, string> = {
  wealth: "財運 · 財", career: "事業 · 業", love: "感情 · 情", health: "健康 · 健",
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const date: string = body.date || new Date().toISOString().slice(0, 10);
  const userChart = body.userChart;
  const dm: string | null = userChart?.day?.stem || null;

  const [yy, mm, dd] = date.split("-").map(Number);
  if (!yy || !mm || !dd) return NextResponse.json({ error: "invalid date" }, { status: 400 });

  /* day stem ของวันนั้น */
  const tyme = await import("tyme4ts");
  const st = tyme.SolarTime.fromYmdHms(yy, mm, dd, 12, 0, 0);
  const dayPillar = st.getLunarHour().getEightChar().getDay().getName();
  const dayStem = dayPillar[0];

  /* ถ้าไม่มี userChart · ใช้ day stem เองเป็น DM (ตอบทั่วไป) */
  const tg = dm ? tenGod(dm, dayStem) : "—";

  const goals: Array<{goal:"wealth"|"career"|"love"|"health"; icon:string; title:string}> = [
    { goal:"wealth", icon:"💰", title:"การเงิน · 財" },
    { goal:"career", icon:"💼", title:"การงาน · 業" },
    { goal:"love",   icon:"❤", title:"ความรัก · 情" },
    { goal:"health", icon:"🌿", title:"สุขภาพ · 健" },
  ];

  const actions = goals.map(g => ({
    goal: g.goal,
    icon: g.icon,
    title: g.title,
    title_en: GOAL_TITLE_EN[g.goal] || g.title,
    title_zh: GOAL_TITLE_ZH[g.goal] || g.title,
    signal: dm ? signalFor(tg, g.goal) : "STEADY",
    tips: TIPS[g.goal],
    tips_en: TIPS_EN[g.goal] || TIPS[g.goal],
    tips_zh: TIPS_ZH[g.goal] || TIPS[g.goal],
    tenGod: tg,
    narrative: dm ? (NARRATIVE_BY_GOAL[g.goal]?.[tg] || NARRATIVE_FALLBACK.th(tg)) : NARRATIVE_GUEST.th,
    narrative_en: dm ? (NARRATIVE_BY_GOAL_EN[g.goal]?.[tg] || NARRATIVE_FALLBACK.en(tg)) : NARRATIVE_GUEST.en,
    narrative_zh: dm ? (NARRATIVE_BY_GOAL_ZH[g.goal]?.[tg] || NARRATIVE_FALLBACK.zh(tg)) : NARRATIVE_GUEST.zh,
  }));

  return NextResponse.json({ date, dayStem, tenGod: tg, actions });
}
