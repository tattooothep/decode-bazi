#!/usr/bin/env node
/**
 * 🎙 ด่านยิงจริง "คุยต่อเนื่องหลายเทิร์นใน 1 นาที" — หาเพดานบัตรดวงที่ปลอดภัยจริง
 *
 * ทำไมต้องมี (5 ส.ค. 2569 · เจ้าของสั่ง "ส่งข้อมูลดิบให้มากที่สุดเท่าที่ระบบรับได้"):
 *   instructions ถูกส่งใหม่ทุกครั้งที่ซินแสตอบ → บัตรใหญ่ = โทเคน/นาทีพุ่ง
 *   บัญชีมีเพดาน 40,000 โทเคน/นาที · เกินแล้วเทิร์นถัดไป "ล้มเงียบ"
 *   = อาการพูดมั่ว ติด ๆ ขัด ๆ ที่ผู้ใช้เจอ · จึงต้องหาเพดานด้วยการยิงจริง ห้ามเดา
 *
 * วิธี: ต่อ WebSocket realtime ด้วยคีย์จริง → ยิงคำถามพยากรณ์ติดกัน N เทิร์นในนาทีเดียว
 *       อ่านค่า rate_limits.updated ที่ผู้ให้บริการส่งกลับ + จับ error rate_limit ทุกชนิด
 *
 * รัน (โหมดวัดเพดาน):  node scripts/test-sifu-voice-live-turns.mjs --sweep
 * รัน (โหมดด่าน 3 เทิร์นด้วยค่าที่ตั้งไว้จริง): node scripts/test-sifu-voice-live-turns.mjs
 *
 * ⚠️ สคริปต์นี้ "ยิงเงินจริง" — ไม่ได้อยู่ในด่านมาตรฐาน ต้องสั่งรันเอง
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIFU_SOURCE = path.join(ROOT, "src/lib/sifu-realtime-session.ts");
const FIXTURE = process.env.SIFU_VOICE_CARD_FIXTURE
  || path.join(ROOT, "scripts/fixtures/sifu-voice-chart-packet.txt");
const MODEL = "gpt-realtime-2.1";

if (!process.execArgv.some((flag) => flag.includes("strip-types"))) {
  const { spawnSync } = await import("node:child_process");
  process.exit(spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit" },
  ).status ?? 1);
}

function readApiKey() {
  const direct = (process.env.OPENAI_API_KEY ?? "").trim();
  if (direct) return direct;
  for (const file of [path.join(ROOT, ".env.local"), "/root/secrets/openai-realtime-test.env"]) {
    try {
      const found = /^OPENAI_API_KEY=(.*)$/mu.exec(fs.readFileSync(file, "utf8"))?.[1]?.trim();
      if (found) return found.replace(/^["']|["']$/gu, "");
    } catch { /* ไฟล์ไม่มีก็ข้าม */ }
  }
  return "";
}

/** ตัวอักษรจีนที่หลุดออกเสียง = ข้อหาหลักของรอบนี้ (ยกเว้นโหมดภาษาจีน) */
const CJK = /[㐀-䶿一-鿿]/u;

/**
 * คุย 1 สาย: ส่งคำถาม N ข้อติดกัน (เทิร์นต่อเทิร์น) แล้วเก็บผลทุกเทิร์น
 * ใช้ modality ข้อความเพื่ออ่านสิ่งที่ซินแส "จะพูด" ได้ตรง ๆ — เนื้อหาชุดเดียวกับเสียง
 */
async function runCall(apiKey, instructions, questions) {
  const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${MODEL}`, [
    "realtime",
    `openai-insecure-api-key.${apiKey}`,
  ]);
  const turns = [];
  let rateSnapshot = null;
  let toolCalls = 0;
  const done = new Promise((resolve, reject) => {
    let index = -1;
    let buffer = "";
    let startedAt = 0;
    const ask = () => {
      index += 1;
      if (index >= questions.length) {
        ws.close();
        resolve();
        return;
      }
      buffer = "";
      startedAt = Date.now();
      ws.send(JSON.stringify({
        item: {
          content: [{ text: questions[index], type: "input_text" }],
          role: "user",
          type: "message",
        },
        type: "conversation.item.create",
      }));
      ws.send(JSON.stringify({ response: { output_modalities: ["text"] }, type: "response.create" }));
    };
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ session: { instructions, type: "realtime" }, type: "session.update" }));
      ask();
    });
    ws.addEventListener("error", () => reject(new Error("websocket error")));
    ws.addEventListener("close", () => resolve());
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.type === "response.output_text.delta") buffer += msg.delta ?? "";
      else if (msg.type === "rate_limits.updated") rateSnapshot = msg.rate_limits;
      else if (msg.type === "response.function_call_arguments.done") toolCalls += 1;
      else if (msg.type === "error" || msg.type === "response.error") {
        turns.push({ error: msg.error?.code || msg.error?.type || "error", ms: Date.now() - startedAt, text: "" });
        ask();
      } else if (msg.type === "response.done") {
        const status = msg.response?.status;
        const failure = status === "failed"
          ? (msg.response?.status_details?.error?.code ?? "failed")
          : null;
        turns.push({
          error: failure,
          ms: Date.now() - startedAt,
          text: buffer.trim(),
          usage: msg.response?.usage ?? null,
        });
        ask();
      }
    });
  });
  const timeout = setTimeout(() => ws.close(), 180_000);
  try {
    await done;
  } finally {
    clearTimeout(timeout);
  }
  return { rateSnapshot, toolCalls, turns };
}

const QUESTIONS = [
  "สวัสดีครับซินแส ปีนี้การเงินผมเป็นยังไงบ้าง",
  "แล้วเรื่องงานล่ะครับ ควรย้ายงานปีนี้ไหม",
  "เรื่องคู่ครองล่ะครับ มีเกณฑ์ไหม",
  "สุขภาพต้องระวังอะไรเป็นพิเศษไหมครับ",
  "ช่วงไหนของปีนี้ที่แรงที่สุดครับ",
  "แล้ววัยจรช่วงนี้โดยรวมดีไหมครับ",
];

async function main() {
  const apiKey = readApiKey();
  if (!apiKey) {
    console.error("❌ ไม่พบ OPENAI_API_KEY");
    process.exit(1);
  }
  const packet = fs.readFileSync(FIXTURE, "utf8");
  const lib = await import(pathToFileURL(SIFU_SOURCE).href);
  const sweep = process.argv.includes("--sweep");
  const turnCount = sweep ? 6 : 3;
  const sizes = sweep
    ? (process.env.SWEEP_SIZES || "9000,20000,35000,50000").split(",").map(Number)
    : [lib.VOICE_CHART_CARD_MAX_CHARS];

  console.log(`🎙 ยิงจริง ${turnCount} เทิร์นติดกันใน 1 สาย · ผังตัวอย่าง ${packet.length.toLocaleString()} ตัวอักษร\n`);
  const rows = [];
  let first = process.env.SWEEP_WAIT_FIRST !== "1";
  for (const size of sizes) {
    /* 🔴 โควตาเป็น "ต่อนาที" — ถ้าไม่รอให้รีเซ็ต ขนาดถัดไปจะตกเพราะโควตาของรอบก่อน
     * (พลาดมาแล้วรอบแรก: 20k/35k/50k ตกยกแผงทั้งที่ยังไม่ได้ทดสอบจริง) */
    if (!first) {
      console.log("   ⏳ รอโควตารีเซ็ต 75 วินาที…");
      await new Promise((resolve) => setTimeout(resolve, 75_000));
    }
    first = false;
    const card = lib.buildVoiceChartCard(packet, new Date(), size);
    const instructions = lib.buildRelayInstructions({
      expectedDm: "辛",
      locale: "th",
      prompt: `${packet}\nFACT LOCK: ทดสอบ\nPILLAR LOCK 4 ก้าน: 庚/壬/辛/癸`,
      voiceCardMaxChars: size,
    }) ?? "";
    const result = await runCall(apiKey, instructions, QUESTIONS.slice(0, turnCount));
    const failed = result.turns.filter((t) => t.error);
    const cjkTurns = result.turns.filter((t) => CJK.test(t.text));
    const inputTokens = result.turns.find((t) => t.usage)?.usage?.input_tokens ?? 0;
    const perTurn = result.turns.map((t) => t.usage?.input_tokens ?? 0).join("/");
    const minuteTokens = result.turns.reduce((sum, t) => sum + (t.usage?.total_tokens ?? 0), 0);
    console.log(`   โทเคนเข้าแต่ละเทิร์น ${perTurn} · รวมทั้งสาย ${minuteTokens.toLocaleString()} · เหลือในโควตา ${JSON.stringify(result.rateSnapshot)}`);
    rows.push({
      card: card?.length ?? 0,
      cjk: cjkTurns.length,
      failed: failed.length,
      instructions: instructions.length,
      ok: result.turns.length - failed.length,
      size,
      tokens: inputTokens,
      toolCalls: result.toolCalls,
      turns: result.turns,
    });
    console.log(
      `— งบ ${size.toLocaleString()} · บัตร ${(card?.length ?? 0).toLocaleString()} · คำสั่ง ${instructions.length.toLocaleString()} ตัวอักษร `
      + `· โทเคนเข้า/เทิร์น ${inputTokens.toLocaleString()} · สำเร็จ ${result.turns.length - failed.length}/${result.turns.length} `
      + `· ล้ม ${failed.map((t) => t.error).join(",") || "-"} · ตัวจีนหลุด ${cjkTurns.length} · tool call ${result.toolCalls}`,
    );
    for (const [i, turn] of result.turns.entries()) {
      console.log(`   [${i + 1}] ${turn.error ? `❌ ${turn.error}` : `✅ ${turn.ms}ms`} · ${turn.text.slice(0, 160) || "(ไม่มีข้อความ)"}`);
    }
    console.log("");
  }

  console.log("สรุปตาราง (งบบัตร · บัตรจริง · คำสั่ง · โทเคน/เทิร์น · เทิร์นสำเร็จ · ตัวจีนหลุด · tool call)");
  for (const row of rows) {
    console.log(
      `  ${String(row.size).padStart(6)} · ${String(row.card).padStart(6)} · ${String(row.instructions).padStart(6)} · `
      + `${String(row.tokens).padStart(6)} · ${row.ok}/${row.turns.length} · ${row.cjk} · ${row.toolCalls}`,
    );
  }
  const bad = rows.filter((row) => row.failed > 0 || row.cjk > 0 || row.toolCalls > 0);
  if (!sweep && bad.length) {
    console.log("\n❌ ไม่ผ่าน");
    process.exit(1);
  }
  console.log(sweep ? "\n(โหมดวัดเพดาน — เลือกค่าจากตารางข้างบน)" : "\n✅ ผ่านทุกเทิร์น");
}

await main();
