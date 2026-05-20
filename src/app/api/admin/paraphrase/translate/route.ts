import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

/**
 * POST /api/admin/paraphrase/translate
 * body: { text: string, sourceLang: 'en'|'th'|'zh', targetLang: 'en'|'th'|'zh', context?: string }
 * Returns: { translated: string }
 *
 * Uses OpenRouter Haiku — Decode voice (no Sesheta mention)
 */
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const { text, sourceLang, targetLang, context } = body as {
    text?: string;
    sourceLang?: string;
    targetLang?: string;
    context?: string;
  };
  if (!text || !sourceLang || !targetLang) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (sourceLang === targetLang) {
    return NextResponse.json({ ok: true, translated: text });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "OPENROUTER_API_KEY not set · กรอกใน .env แล้วลองใหม่" },
      { status: 503 }
    );
  }

  const langName: Record<string, string> = {
    en: "English",
    th: "Thai (ภาษาไทย)",
    zh: "Simplified Chinese (简体中文)",
  };
  const voicePrompt = `You are translating BaZi/Chinese metaphysics content for hourkey.io Decode platform.

Style rules:
- Founder-grade voice: math, loop, SOP, arbitrage, compound mindset
- Drop fluffy words: "radiance, glow, warmth, energy emanating"
- Direct, sharp, modern · not classical-ornate
- For Thai: use "คุณ" (formal-direct), avoid "ท่าน"
- For Chinese: use Simplified, modern professional tone
- Keep classical terms (干支, 十神, 五行 names) as-is
- Output ONLY the translated text. No quotes, no explanations.

Context (for term consistency): ${context || "n/a"}

Translate from ${langName[sourceLang] || sourceLang} to ${langName[targetLang] || targetLang}:

${text}`;

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hourkey.io",
        "X-Title": "hourkey · Decode · Admin Paraphrase",
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4.5",
        messages: [{ role: "user", content: voicePrompt }],
        temperature: 0.2,
        max_tokens: 1200,
      }),
    });
    const j = await r.json();
    const translated = j.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({ ok: true, translated, model: "haiku-4.5" });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 502 }
    );
  }
}
