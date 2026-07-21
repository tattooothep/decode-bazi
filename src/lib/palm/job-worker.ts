import { spawn } from "child_process";
import { chmod, rm } from "fs/promises";
import path from "path";
import { q } from "@/lib/db";
import { settlePalmJobBilling, refundPalmJobBilling } from "@/lib/palm-billing";
import { readPalmVision } from "@/lib/palm/vision";
import {
  loadPalmCanon,
  buildPalmPrompt,
  parsePalmResult,
  reshootTargets,
  type PalmContext,
  type PalmImageMeta,
} from "@/lib/palm/prompt";

const ENHANCE = path.join(process.cwd(), "scripts/palm-enhance.py");

export type PalmJobPayload = {
  jobId: string;
  jobDir: string;
  srcPaths: string[];
  metas: PalmImageMeta[];
  labels: string[];
  lang: string;
  context: PalmContext;
};

function enhance(src: string, stem: string): Promise<{ clarity: number; clear: string; advise: string }> {
  return new Promise((resolve) => {
    const child = spawn("python3", [ENHANCE, src, stem]);
    let output = "";
    let settled = false;
    const finish = (value: { clarity: number; clear: string; advise: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      finish({ clarity: 0, clear: src, advise: "enhance_timeout" });
    }, 30_000);
    child.stdout.on("data", (data) => { output += data; });
    child.on("close", () => {
      try {
        const parsed = JSON.parse(output.trim());
        if (parsed.ok) return finish({ clarity: parsed.clarity, clear: parsed.clear, advise: parsed.advise });
      } catch {}
      finish({ clarity: 0, clear: src, advise: "enhance_failed" });
    });
    child.on("error", () => finish({ clarity: 0, clear: src, advise: "enhance_error" }));
  });
}

export async function processPalmJob(payload: PalmJobPayload): Promise<void> {
  const { jobId, jobDir, srcPaths, metas, labels, lang, context } = payload;
  try {
    const clarityHints: { label: string; clarity: number; advise: string }[] = [];
    const sendPaths: string[] = [];
    for (let i = 0; i < srcPaths.length; i++) {
      const enhanced = await enhance(srcPaths[i], path.join(jobDir, `e_${i}`));
      await chmod(enhanced.clear, 0o600).catch(() => {});
      sendPaths.push(enhanced.clear);
      clarityHints.push({ label: labels[i] || `image_${i + 1}`, clarity: enhanced.clarity, advise: enhanced.advise });
    }

    const canon = await loadPalmCanon();
    const prompt = buildPalmPrompt({ canon, lang, images: metas, clarityHints, context });
    const vision = await readPalmVision(sendPaths, prompt, undefined);

    let reading;
    try {
      reading = parsePalmResult(vision.text);
    } catch {
      await refundPalmJobBilling(jobId, "parse_failed").catch(() => {});
      await q(`UPDATE palm_jobs SET status='error', error=$2, engine=$3, updated_at=now() WHERE id=$1`,
        [jobId, "parse_failed", vision.engine]).catch(() => {});
      return;
    }

    const readingText = JSON.stringify(reading);
    const billing = await settlePalmJobBilling(jobId, readingText.length);
    const result = {
      ok: true,
      engine: vision.engine,
      lang,
      clarity_hints: clarityHints,
      reading,
      reshoot: reshootTargets(reading),
      image_count: srcPaths.length,
      yam: billing.ok ? { charged: billing.charged, balance: billing.balance_after } : null,
    };
    await q(`UPDATE palm_jobs SET status='done', result=$2, engine=$3, heartbeat_at=now(), updated_at=now() WHERE id=$1`,
      [jobId, JSON.stringify(result), vision.engine]);
  } catch (error) {
    const message = ((error as Error)?.message || "read_failed").slice(0, 200);
    await refundPalmJobBilling(jobId, message).catch(() => {});
    await q(`UPDATE palm_jobs SET status='error', error=$2, heartbeat_at=now(), updated_at=now() WHERE id=$1`,
      [jobId, message]).catch(() => {});
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
}
