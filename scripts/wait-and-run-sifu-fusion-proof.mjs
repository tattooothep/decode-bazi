import { spawn } from "node:child_process";

const POLL_MS = Math.max(10_000, Number(process.env.FUSION_WAIT_POLL_MS || 120_000));
const MAX_WAIT_MS = Math.max(60_000, Number(process.env.FUSION_WAIT_MAX_MINUTES || 180) * 60_000);
const started = Date.now();

function run(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (opts.echo) process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (opts.echo) process.stderr.write(text);
    });
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePreflight(stdout) {
  try { return JSON.parse(stdout); } catch { return { status: "PREFLIGHT_PARSE_FAILED", stdout: stdout.slice(0, 300) }; }
}

let attempt = 0;
for (;;) {
  attempt += 1;
  const elapsed = Date.now() - started;
  if (elapsed > MAX_WAIT_MS) {
    console.error(`[fusion-wait] max wait exceeded after ${Math.round(elapsed / 1000)}s`);
    process.exit(2);
  }

  console.log(`[fusion-wait] preflight attempt ${attempt} at ${new Date().toISOString()}`);
  const preflight = await run("node", ["scripts/check-claude-cli-preflight.mjs"]);
  const status = parsePreflight(preflight.stdout);
  console.log(`[fusion-wait] ${status.status || "UNKNOWN"}${status.stdout ? ` · ${status.stdout}` : ""}`);

  if (preflight.code === 0 && status.status === "CLAUDE_READY") break;
  if (status.status === "CLAUDE_AUTH_REQUIRED") {
    console.error("[fusion-wait] Claude auth required; not retrying");
    process.exit(3);
  }
  await sleep(POLL_MS);
}

console.log(`[fusion-wait] Claude ready; starting 5-profile proof at ${new Date().toISOString()}`);
const proof = await run("node", ["scripts/run-sifu-fusion5-report.mjs"], { echo: true });
process.exit(proof.code);
