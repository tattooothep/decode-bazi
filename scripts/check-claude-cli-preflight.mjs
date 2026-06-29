import { spawn } from "node:child_process";

const TIMEOUT_MS = Math.max(10_000, Number(process.env.CLAUDE_PREFLIGHT_TIMEOUT_MS || 60_000));
const CHILD_USER = process.env.SIFU_CHILD_USER || "jarvis";
const CWD = process.env.SIFU_CLAUDE_CWD || "/var/www/checklist-app";
const PROMPT = "Reply with exactly OK.\n";

function classify(text) {
  if (/session limit|usage limit|rate limit|quota|429/i.test(text)) return "CLAUDE_QUOTA_BLOCKED";
  if (/401|Unauthorized|not logged in|authentication|sign in|login/i.test(text)) return "CLAUDE_AUTH_REQUIRED";
  if (/timeout/i.test(text)) return "CLAUDE_TIMEOUT";
  return "CLAUDE_FAILED";
}

function runClaude() {
  return new Promise((resolve) => {
    const args = [
      "-u", CHILD_USER,
      "-H",
      "claude",
      "-p",
      "--output-format", "text",
      "--dangerously-skip-permissions",
      "--setting-sources", "user",
    ];
    const child = spawn("sudo", args, {
      cwd: CWD,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      if (!settled) {
        settled = true;
        resolve({ code: null, stdout, stderr, timedOut: true });
      }
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ code: null, stdout, stderr: `${stderr}\n${error.message}`, timedOut: false });
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ code, stdout, stderr, timedOut: false });
      }
    });
    child.stdin.write(PROMPT);
    child.stdin.end();
  });
}

const result = await runClaude();
const combined = `${result.stderr}\n${result.stdout}`.trim();
const summary = {
  ok: result.code === 0 && !!result.stdout.trim(),
  code: result.code,
  status: result.timedOut ? "CLAUDE_TIMEOUT" : result.code === 0 && result.stdout.trim() ? "CLAUDE_READY" : classify(combined),
  stdout: result.stdout.trim().slice(0, 300),
  stderr: result.stderr.trim().slice(0, 300),
};

console.log(JSON.stringify(summary, null, 2));

if (summary.status === "CLAUDE_READY") process.exit(0);
if (summary.status === "CLAUDE_QUOTA_BLOCKED") process.exit(2);
if (summary.status === "CLAUDE_AUTH_REQUIRED") process.exit(3);
if (summary.status === "CLAUDE_TIMEOUT") process.exit(4);
process.exit(1);
