/**
 * claude-stream.ts · helper สำหรับ AI streaming (Phase 12 · /api/sifu/compare)
 *
 * 19 พ.ค. 2026 · clone pattern จาก /api/sifu LOCKED · ห้ามแตะของเดิม
 * ใช้โดย /api/sifu/compare เพื่อ:
 *   - spawn `sudo claude --output-format stream-json` (Claude Max subscription)
 *   - parse JSONL stdout เป็น text_delta chunks
 *   - fallback OpenRouter API (stream SSE) ถ้า CLI fail
 *
 * NOTE: /api/sifu LOCKED ยังคง inline helpers ของตัวเอง · byte-equal · ไม่แตะ
 */
import { spawn, type ChildProcess } from "child_process";

const CHILD_USER = "jarvis";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/* 🌊 spawn Claude CLI · stream-json + include-partial-messages */
export function spawnClaudeStreaming(prompt: string): ChildProcess {
  const claudeArgs = [
    "-p",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--dangerously-skip-permissions",
    "--setting-sources", "user",
  ];
  const spawnArgs = ["-u", CHILD_USER, "-H", "claude", ...claudeArgs];
  const c = spawn("sudo", spawnArgs, {
    cwd: "/var/www/checklist-app",
    env: process.env,
  });
  c.stdin.write(prompt);
  c.stdin.end();
  return c;
}

/* JSONL parser · แยก line · ดึง text_delta */
export function makeJsonlParser(onText: (text: string) => void) {
  let buf = "";
  return (chunk: Buffer) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        // partial: stream_event · content_block_delta · text_delta
        if (obj.type === "stream_event" && obj.event?.type === "content_block_delta" && obj.event.delta?.type === "text_delta") {
          onText(obj.event.delta.text);
        }
        // assistant final · skip (partial ส่งครบแล้ว)
      } catch (_) {
        // not JSON line · skip
      }
    }
  };
}

/* OpenRouter SSE streaming · fallback ถ้า Claude CLI ล่ม */
export async function streamOpenRouter(
  prompt: string,
  onText: (text: string) => void,
  opts: { model?: string; title?: string; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<{ full: string; model: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  const model = opts.model || process.env.SIFU_COMPARE_MODEL || process.env.SIFU_INTRO_MODEL || "anthropic/claude-opus-4.7";
  const title = opts.title || "hourkey · Sifu Compare";
  const timeoutMs = opts.timeoutMs || 180_000;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  /* รวม signal กับ external abort (client close) */
  if (opts.signal) {
    if (opts.signal.aborted) ac.abort();
    else opts.signal.addEventListener("abort", () => ac.abort(), { once: true });
  }
  let full = "";
  try {
    const r = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hourkey.io",
        "X-Title": title,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.35,
        max_tokens: 1800,
        stream: true,
      }),
      signal: ac.signal,
    });
    if (!r.ok || !r.body) {
      const errText = await r.text().catch(() => "");
      throw new Error(`openrouter ${r.status} ${errText.slice(0, 200)}`);
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        for (const line of raw.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const obj = JSON.parse(data);
            const delta = obj.choices?.[0]?.delta?.content;
            const text = typeof delta === "string"
              ? delta
              : Array.isArray(delta)
                ? delta.map((x: { text?: string }) => x?.text || "").join("")
                : "";
            if (text) {
              full += text;
              onText(text);
            }
          } catch {}
        }
      }
    }
    return { full: full.trim(), model };
  } finally {
    clearTimeout(timer);
  }
}
