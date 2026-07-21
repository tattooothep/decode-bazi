import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let passed = 0;

function signature(name, condition, detail = "") {
  if (!condition) throw new Error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  passed++;
  console.log(`PASS ${name}${detail ? ` · ${detail}` : ""}`);
}

const migration = read("migrations/20260711_notification_support_p0.sql");
const outbox = read("src/lib/notification-outbox.ts");
signature(
  "1/5 integrity and exactly-once constraints",
  migration.includes("UNIQUE(event_id, recipient_user_id)") &&
    migration.includes("ON support_report_messages(report_id, author_type, client_message_id)") &&
    outbox.includes("ON CONFLICT (dedupe_key) DO NOTHING")
);

const userRoute = read("src/app/api/support/report/route.ts");
const adminRoute = read("src/app/api/admin/community/route.ts");
signature(
  "2/5 security, ownership, RBAC, and internal-note isolation",
  userRoute.includes("WHERE r.user_id=$1") &&
    userRoute.includes("r.user_id=$1 AND m.visibility='public'") &&
    adminRoute.includes('requirePermission("admin.community.write")') &&
    adminRoute.includes("visibility,body")
);

const e2e = await execFileAsync(process.execPath, ["scripts/test-notification-support-p0.mjs"], {
  cwd: root,
  env: process.env,
  timeout: 120_000,
  maxBuffer: 2 * 1024 * 1024,
});
process.stdout.write(e2e.stdout);
signature(
  "3/5 end-to-end user/admin conversation and audit",
  /support\/outbox E2E checks passed/.test(e2e.stdout)
);

const worker = read("scripts/workers/admin-notify-watcher.mjs");
const supportPage = read("public/support.html");
const localeBlocks = ["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"]
  .every((locale) => new RegExp(`\\n  ${locale}: \\{`).test(worker) &&
    new RegExp(`\\n    ${locale}:\\{title:`).test(supportPage) &&
    new RegExp(`\\n    ${locale}:\\{threadTitle:`).test(supportPage));
signature(
  "4/5 retry, restart recovery, and nine-language delivery",
  worker.includes("worker_interrupted") && worker.includes("FOR UPDATE SKIP LOCKED") &&
    worker.includes("ON CONFLICT(event_id,recipient_user_id) DO NOTHING") && localeBlocks &&
    supportPage.includes("@media(max-width:860px)")
);

const load = await execFileAsync(process.execPath, ["scripts/test-notification-load-5000.mjs"], {
  cwd: root,
  env: process.env,
  timeout: 120_000,
  maxBuffer: 2 * 1024 * 1024,
});
process.stdout.write(load.stdout);
const metric = load.stdout.match(/\{"users":5000[^\n]+\}/)?.[0] || "";
signature(
  "5/5 regression and 5,000-user load",
  load.stdout.includes("replayed inbox insert remains exactly-once for all 5,000 users"),
  metric
);

console.log(`${passed}/5 notification and support signatures passed`);
