/**
 * /api/sifu/fusion5 · ดูดวง 5 ศาสตร์ · panel แยกศาสตร์ + judge หลอมรวม + ดูคู่ 2 ดวง
 * แต่ละ panel = 1 ศาสตร์ · engine คำนวณ→packet→คัมภีร์→AI (ตาม registry · กันมั่ว)
 * bazi → /api/sifu เดิม (profileId) · qizheng/western/vedic → externalPrompt (ผัง render มาแล้ว)
 * ⚠️ ยังไม่แตะ /api/sifu/fusion เดิม (route แยก · /master-fusion ปัจจุบันไม่กระทบ)
 */
import { NextResponse } from "next/server";
import { getSession, signSession, type Session } from "@/lib/auth";
import { q1, q } from "@/lib/db";
import { spendHoursForUser, refundHoursForUser } from "@/lib/spend-hours";
import { createHash } from "crypto";
import { DISCIPLINES, computeYam, JUDGE_MODEL, JUDGE_YAM, type ScienceId } from "@/lib/fusion5/disciplines";
import { buildSciencePrompt, buildJudgePrompt, type BirthData } from "@/lib/fusion5/build-prompt";

export const runtime = "nodejs";
export const maxDuration = 800;

const INTERNAL_BASE = process.env.SIFU_INTERNAL_BASE_URL || "http://127.0.0.1:3349";
// panel ขนาน(parallel) + judge(sequential หลัง) ต้อง < maxDuration 800s → ตั้ง 360s ต่อ call (360+360=720<800)
const CHILD_TIMEOUT_MS = Number(process.env.SIFU_FUSION5_CHILD_TIMEOUT_MS || 360_000);
const FEATURE = "sifu_fusion5";

function internalToken(): string {
  const secret = process.env.SIFU_FUSION_INTERNAL_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("fusion_internal_secret_missing");
  return createHash("sha256").update(`hourkey:sifu-fusion:${secret}`).digest("hex");
}
async function authCookie(session: Session): Promise<string> {
  const token = await signSession({ userId: session.userId, email: session.email, orgId: session.orgId || null });
  return `decode_auth=${encodeURIComponent(token)}`;
}

type PanelOut = { science: ScienceId; label: string; model: string; ok: boolean; reply?: string; error?: string };

/** เรียก /api/sifu (fusion-internal) ด้วย payload ที่กำหนด */
async function callSifu(cookie: string, payload: Record<string, unknown>, model: string, signal?: AbortSignal): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHILD_TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const r = await fetch(new URL("/api/sifu", INTERNAL_BASE), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": cookie, "X-Sifu-Fusion": "1", "X-Sifu-Fusion-Token": internalToken() },
      body: JSON.stringify({ ...payload, model, noCache: true }),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>));
    if (!r.ok || (j as Record<string, unknown>).error) return { ok: false, error: String((j as Record<string, unknown>).error || `http_${r.status}`) };
    const reply = String((j as Record<string, unknown>).reply || "").trim();
    return reply ? { ok: true, reply } : { ok: false, error: "empty_reply" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

type ProfileRow = { id: string; name: string | null; nickname: string | null; birth_datetime: string; birth_lng: number | null; gender: string | null; birth_time_known: boolean | null };

/** โหลด profile (org-scoped · กันอ่านข้ามบัญชี) → BirthData */
async function loadBirth(profileId: string, orgId: string | null): Promise<BirthData | null> {
  const row = await q1<ProfileRow>(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
            birth_lng, gender, birth_time_known
     FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false`,
    [profileId, orgId]
  );
  if (!row || !row.birth_datetime) return null;
  // Bangkok wall time → UTC instant (+07:00)
  const dtUTC = new Date(`${row.birth_datetime}+07:00`);
  if (isNaN(dtUTC.getTime())) return null;
  return {
    name: (row.nickname || row.name || "ดวง").slice(0, 40),
    dtUTC,
    lat: 13.75,                                   // ⚠️ profiles ไม่เก็บ lat เกิด → default กทม (ใส่สถานที่ใน UI ภายหลัง)
    lng: Number(row.birth_lng || 100.5018),
    hasTime: row.birth_time_known !== false,
    gender: (String(row.gender || "").trim().toLowerCase().charAt(0) === "f" ? "F" : "M"),
  };
}

function cleanId(x: unknown): string | null {
  const s = String(x || "").trim();
  return /^[0-9a-f-]{8,40}$/i.test(s) ? s : null;
}

type WorkerParams = { userId: string; cookie: string; runSciences: ScienceId[]; births: BirthData[]; profileIds: string[]; question: string; lang: string; yam: number; skipped: ScienceId[] };

/** 🔄 worker เบื้องหลัง · ไม่ผูก req.signal → user ปิดจอ/พับมือถือได้ งานวิ่งต่อบน server → เก็บผลลง DB
 *  เรียกแบบ detached (ไม่ await) · ต้องไม่ throw ออกนอก (อัปเดต job เสมอ ทั้งสำเร็จ/พลาด) */
async function processFusion5(jobId: string, p: WorkerParams): Promise<void> {
  try {
    const { cookie, runSciences, births, profileIds, question, lang, yam, skipped, userId } = p;
    const refDate = new Date("2026-06-30T00:00:00Z");

    // panel แยกศาสตร์ (ขนาน) · ทุก path คืน {ok:false} ไม่ throw · ⚠️ ไม่ส่ง signal (งานต้องวิ่งจบแม้ client หลุด)
    const panels: PanelOut[] = await Promise.all(runSciences.map(async (science): Promise<PanelOut> => {
      const bind = DISCIPLINES[science];
      const label = bind.labelTh;
      try {
        if (science === "bazi") {
          const targets = births.length > 1 ? profileIds : [profileIds[0]];
          const parts: string[] = [];
          let anyOk = false;
          for (let i = 0; i < targets.length; i++) {
            const note = births.length > 1 ? `\n(ดูคู่ระหว่าง ${births.map((b) => b.name).join(" และ ")} — วิเคราะห์ ${births[i].name})` : "";
            const r = await callSifu(cookie, { profileId: targets[i], message: question + note, lang }, bind.defaultModel);
            if (r.ok && r.reply) { anyOk = true; parts.push(births.length > 1 ? `【${births[i].name}】\n${r.reply}` : r.reply); }
          }
          return anyOk ? { science, label, model: bind.defaultModel, ok: true, reply: parts.join("\n\n") } : { science, label, model: bind.defaultModel, ok: false, error: "bazi_failed" };
        }
        const prompt = buildSciencePrompt(science, births, question, lang, refDate);
        const res = await callSifu(cookie, { message: question, externalPrompt: prompt, lang }, bind.defaultModel);
        if (!res.ok && bind.fallbackModels[0]) {
          const fb = await callSifu(cookie, { message: question, externalPrompt: prompt, lang }, bind.fallbackModels[0]);
          if (fb.ok) return { science, label, model: bind.fallbackModels[0], ...fb };
        }
        return { science, label, model: bind.defaultModel, ...res };
      } catch (e) {
        return { science, label, model: bind.defaultModel, ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "engine_error" };
      }
    }));

    const okPanels = panels.filter((x) => x.ok && x.reply);

    let judge: { ok: boolean; reply?: string; error?: string; model: string } = { ok: false, model: JUDGE_MODEL };
    if (okPanels.length >= 2) {
      try {
        const jp = buildJudgePrompt(okPanels.map((x) => ({ science: x.science, reply: x.reply! })), births, question, lang);
        const jr = await callSifu(cookie, { message: question, externalPrompt: jp, lang }, JUDGE_MODEL);
        judge = { ...jr, model: JUDGE_MODEL };
      } catch (e) { judge = { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "judge_error", model: JUDGE_MODEL }; }
    }

    // ยามคืน (refund · ForUser เพราะ background ไม่มี session)
    const panelRefund = panels.filter((x) => !x.ok).reduce((s, x) => s + DISCIPLINES[x.science].costYam * births.length, 0);
    const judgeCharged = runSciences.length >= 2 ? JUDGE_YAM : 0;
    const judgeRefund = judgeCharged > 0 && !judge.ok ? JUDGE_YAM : 0;
    const totalRefund = panelRefund + judgeRefund;
    if (totalRefund > 0) await refundHoursForUser(userId, totalRefund, FEATURE).catch(() => {});

    const reply = judge.ok && judge.reply ? judge.reply
      : okPanels.length === 1 ? okPanels[0].reply!
      : okPanels.length ? okPanels.map((x) => `【${x.label}】\n${x.reply}`).join("\n\n")
      : "ขออภัย ยังไม่สามารถอ่านดวงได้ในขณะนี้ ลองใหม่อีกครั้ง";

    const result = {
      reply, model: "fusion5",
      fusion5: {
        profileNames: births.map((b) => b.name),
        pairMode: births.length > 1,
        panels: panels.map((x) => ({ science: x.science, label: x.label, model: x.model, ok: x.ok, reply: x.reply || null, error: x.error || null })),
        judge: { ok: judge.ok, model: judge.model },
        skipped,
        yam: { charged: yam, refunded: totalRefund },
      },
    };
    await q(`UPDATE fusion5_jobs SET status='done', result=$2, updated_at=now() WHERE id=$1`, [jobId, JSON.stringify(result)]);
  } catch (e) {
    // worker throw ที่ไม่คาดคิด → คืนยามเต็ม + mark error (กันเงินหาย + job ค้าง running)
    await refundHoursForUser(p.userId, p.yam, FEATURE).catch(() => {});
    await q(`UPDATE fusion5_jobs SET status='error', error=$2, updated_at=now() WHERE id=$1`, [jobId, (e instanceof Error ? e.message : String(e)).slice(0, 200)]).catch(() => {});
  }
}

export async function POST(req: Request) {
  let chargedYam = 0, userId = "";
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
    const orgId = session.orgId ?? null;
    userId = session.userId;

    const profileIds = (Array.isArray(body.profileIds) ? body.profileIds : [body.profileId])
      .map(cleanId).filter((x): x is string => !!x).slice(0, 2);
    const sciences = (Array.isArray(body.sciences) ? body.sciences : [])
      .map((s) => String(s) as ScienceId)
      .filter((s) => DISCIPLINES[s]?.available);
    const question = String(body.question || body.message || "").trim().slice(0, 2000);
    const lang = ["th", "en", "zh"].includes(String(body.lang)) ? String(body.lang) : "th";

    if (!profileIds.length) return NextResponse.json({ error: "profile_required" }, { status: 400 });
    if (!sciences.length) return NextResponse.json({ error: "no_science_selected" }, { status: 400 });
    if (!question) return NextResponse.json({ error: "no_question" }, { status: 400 });

    const births: BirthData[] = [];
    for (const pid of profileIds) {
      const b = await loadBirth(pid, orgId);
      if (!b) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
      births.push(b);
    }

    const allHaveTime = births.every((b) => b.hasTime);
    const runSciences = sciences.filter((s) => !DISCIPLINES[s].needsBirthTime || allHaveTime);
    const skipped = sciences.filter((s) => DISCIPLINES[s].needsBirthTime && !allHaveTime);
    if (!runSciences.length) return NextResponse.json({ error: "all_sciences_need_birthtime", skipped }, { status: 400 });

    const yam = computeYam(runSciences, births.length);
    const spend = await spendHoursForUser(userId, yam, FEATURE);
    if (!spend.ok) return NextResponse.json({ error: "insufficient_hours", needed: yam }, { status: 402 });
    chargedYam = yam;

    // สร้าง job (running) → คืน jobId ทันที → ประมวลผลเบื้องหลัง (user พับจอได้)
    const cookie = await authCookie(session);
    const job = await q1<{ id: string }>(
      `INSERT INTO fusion5_jobs(user_id, org_id, status, question, sciences, profile_ids, pair_mode)
       VALUES ($1,$2,'running',$3,$4,$5,$6) RETURNING id`,
      [userId, orgId, question, runSciences, profileIds, births.length > 1]
    );
    if (!job) { await refundHoursForUser(userId, yam, FEATURE).catch(() => {}); return NextResponse.json({ error: "job_create_failed" }, { status: 500 }); }
    chargedYam = 0; // job รับช่วงดูแล refund แล้ว (outer catch ไม่ต้องคืนซ้ำ)

    // 🔄 detached — ไม่ await · งานวิ่งบน server แม้ client ปิด
    void processFusion5(job.id, { userId, cookie, runSciences, births, profileIds, question, lang, yam, skipped });

    return NextResponse.json({ jobId: job.id, status: "running", yam: { charged: yam }, skipped, profileNames: births.map((b) => b.name), pairMode: births.length > 1 });
  } catch {
    if (chargedYam > 0 && userId) await refundHoursForUser(userId, chargedYam, FEATURE).catch(() => {});
    return NextResponse.json({ error: "fusion5_error" }, { status: 500 });
  }
}

/** poll ผลงาน (user-scoped) · UI เรียกซ้ำจน status!=running */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const jobId = cleanId(new URL(req.url).searchParams.get("jobId"));
  if (!jobId) return NextResponse.json({ error: "bad_jobId" }, { status: 400 });
  const row = await q1<{ status: string; result: unknown; error: string | null; created_at: string }>(
    `SELECT status, result, error, created_at FROM fusion5_jobs WHERE id=$1 AND user_id=$2`,
    [jobId, session.userId]
  );
  if (!row) return NextResponse.json({ error: "job_not_found" }, { status: 404 });
  // กัน job ค้าง running เกิน 15 นาที (server restart กลางคัน) → ถือว่า error
  const stale = row.status === "running" && Date.now() - new Date(row.created_at).getTime() > 15 * 60_000;
  return NextResponse.json({
    status: stale ? "error" : row.status,
    result: row.result || null,
    error: stale ? "timeout" : row.error || null,
  });
}
