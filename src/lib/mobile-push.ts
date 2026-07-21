import { q } from "@/lib/db";

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts";

type TokenRow = { id: string; expo_push_token: string; fail_count: number };
type Ticket = { status?: string; id?: string; message?: string; details?: { error?: string } };

export type MobilePushReport = {
  accepted: number;
  failed: number;
  removed: number;
  skipped: "no_mobile_subscription" | null;
};

function headers(): Record<string, string> {
  const accessToken = String(process.env.EXPO_PUSH_ACCESS_TOKEN || "").trim();
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

function safePath(raw: string | undefined): string {
  const value = String(raw || "/today").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/today";
  return value.slice(0, 300);
}

export async function sendMobilePushToUser(
  userId: string,
  message: { title: string; body: string; url?: string; tag?: string }
): Promise<MobilePushReport> {
  const report: MobilePushReport = { accepted: 0, failed: 0, removed: 0, skipped: null };
  const tokens = await q<TokenRow>(
    `SELECT id,expo_push_token,fail_count FROM mobile_push_tokens
      WHERE user_id=$1 AND enabled=true ORDER BY created_at LIMIT 100`,
    [userId]
  );
  if (!tokens.length) {
    report.skipped = "no_mobile_subscription";
    return report;
  }

  try {
    const response = await fetch(SEND_URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(tokens.map((row) => ({
        to: row.expo_push_token,
        title: String(message.title || "Hourkey").slice(0, 120),
        body: String(message.body || "").slice(0, 400),
        data: { url: safePath(message.url) },
        sound: "default",
        priority: "high",
        ttl: 21_600,
        ...(message.tag ? { tag: String(message.tag).slice(0, 80) } : {}),
      }))),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`expo_push_http_${response.status}`);
    const payload = await response.json() as { data?: Ticket[] | Ticket };
    const tickets = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const ticket = tickets[index];
      if (ticket?.status === "ok" && ticket.id) {
        report.accepted += 1;
        await q(
          `INSERT INTO mobile_push_receipts(ticket_id,token_id) VALUES($1,$2)
           ON CONFLICT(ticket_id) DO NOTHING`,
          [ticket.id, token.id]
        ).catch(() => null);
      } else if (ticket?.details?.error === "DeviceNotRegistered") {
        report.removed += 1;
        await q(`UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now() WHERE id=$1`, [token.id]).catch(() => null);
      } else {
        report.failed += 1;
        await q(`UPDATE mobile_push_tokens SET fail_count=fail_count+1,updated_at=now() WHERE id=$1`, [token.id]).catch(() => null);
      }
    }
  } catch {
    report.failed = tokens.length;
  }
  return report;
}

export async function checkMobilePushReceipts(limit = 1000): Promise<{ checked: number; removed: number; errors: number }> {
  const rows = await q<{ ticket_id: string; token_id: string }>(
    `SELECT ticket_id,token_id FROM mobile_push_receipts
      WHERE status='pending' AND available_at<=now()
      ORDER BY available_at LIMIT $1`,
    [Math.max(1, Math.min(1000, limit))]
  );
  if (!rows.length) return { checked: 0, removed: 0, errors: 0 };
  const response = await fetch(RECEIPT_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ids: rows.map((row) => row.ticket_id) }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`expo_receipt_http_${response.status}`);
  const payload = await response.json() as { data?: Record<string, Ticket> };
  let checked = 0, removed = 0, errors = 0;
  for (const row of rows) {
    const receipt = payload.data?.[row.ticket_id];
    if (!receipt) continue;
    checked += 1;
    const code = receipt.details?.error || null;
    const status = receipt.status === "ok" ? "ok" : "error";
    if (status === "error") errors += 1;
    await q(
      `UPDATE mobile_push_receipts SET status=$2,error_code=$3,error_message=$4,checked_at=now()
        WHERE ticket_id=$1`,
      [row.ticket_id, status, code, receipt.message || null]
    );
    if (code === "DeviceNotRegistered") {
      removed += 1;
      await q(`UPDATE mobile_push_tokens SET enabled=false,disabled_at=now(),updated_at=now() WHERE id=$1`, [row.token_id]);
    } else if (status === "ok") {
      await q(`UPDATE mobile_push_tokens SET fail_count=0,last_success_at=now(),updated_at=now() WHERE id=$1`, [row.token_id]);
    }
  }
  return { checked, removed, errors };
}
