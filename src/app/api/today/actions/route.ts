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
    signal: dm ? signalFor(tg, g.goal) : "STEADY",
    tips: TIPS[g.goal],
    tenGod: tg,
    narrative: dm ? (NARRATIVE_BY_GOAL[g.goal]?.[tg] || `${tg} · ช่วงปกติของหมวดนี้`) : "วันที่ลงทะเบียนเพื่อดูส่วนตัว",
  }));

  return NextResponse.json({ date, dayStem, tenGod: tg, actions });
}
