import fs from "node:fs";

let pass = 0;
let fail = 0;
const read = (file) => fs.readFileSync(file, "utf8");
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  ok ? pass++ : fail++;
};

const files = [
  "src/lib/claude-stream.ts",
  "src/app/api/activity-classify/route.ts",
  "src/app/api/chart/overview/route.ts",
  "src/app/api/forecast/route.ts",
  "src/app/api/network/ai-parse-bulk/route.ts",
  "src/app/api/network/sifu/route.ts",
  "src/app/api/qimen/sifu/route.ts",
  "src/app/api/sifu/compare/route.ts",
  "src/app/api/sifu/group/route.ts",
  "src/app/api/sifu/route.ts",
];
const cliSources = files.map(read).join("\n");
const helper = read("src/lib/ai-cli-security.ts");
const imagegen = read("src/app/api/ai/imagegen/route.ts");
const askReport = read("src/app/api/ask/report/route.ts");
const tokens = read("src/lib/auth-tokens.ts");
const omise = read("src/app/api/payment/webhook/omise/route.ts");
const palm = read("src/lib/palm/vision.ts");

check("no Claude permission bypass remains", !cliSources.includes("--dangerously-skip-permissions"));
check("Claude text runners expose no tools", helper.includes('"--safe-mode"') && helper.includes('"--tools", ""'));
check("Grok text runners use a non-I/O allowlist", helper.includes('"--tools", "todo_write"') && helper.includes('"--disable-web-search"'));
check("public Ask report uses shared Redis limiter", askReport.includes("await rateLimit(`ask-report:") && askReport.includes("GROK_TEXT_ONLY_ARGS"));
check("image generation cannot spawn a host agent", imagegen.includes("image_generation_temporarily_disabled") && !/child_process|\bspawn\s*\(/.test(imagegen));
check("direct Codex prediction requests fail closed", read("src/app/api/sifu/route.ts").includes("provider_security_disabled") && read("src/app/api/sifu/group/route.ts").includes("provider_security_disabled"));
check("palm fallback cannot run Codex on the host", !palm.includes("runCodexVision") && !palm.includes('engine: "codex-cli"'));
check("auth tokens are stored as hashes", tokens.includes("tokenDigest(token)") && tokens.includes('createHash("sha256")'));
check("auth token consumption is one atomic update", /UPDATE auth_tokens[\s\S]*used=false[\s\S]*expires_at > now\(\)[\s\S]*RETURNING user_id/.test(tokens) && !tokens.includes("SELECT user_id, expires_at"));
check("Omise webhook requires secret and API configuration", omise.includes("!wantSecret || !omiseReady()") && omise.includes("timingSafeEqual"));

console.log(`security-p0: ${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
