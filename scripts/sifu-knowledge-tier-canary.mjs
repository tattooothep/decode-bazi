/**
 * G0/G3/G5 canary — no live AI. Measures tier book selection + char budgets.
 *   node --experimental-strip-types --import ./scripts/register-loader.mjs scripts/sifu-knowledge-tier-canary.mjs
 */
import { pathToFileURL } from "url";
import { join } from "path";

const root = process.cwd();
const mod = await import(pathToFileURL(join(root, "src/lib/sifu-knowledge-tier.ts")).href);

const {
  SIFU_KNOWLEDGE_CANARY,
  classifySifuKnowledgeIntents,
  resolveSifuKnowledgeTier,
  selectTieredBooks,
  knowledgeCapChars,
  renderTieredExtraBlock,
} = mod;

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log("  PASS", msg);
  } else {
    fail++;
    console.log("  FAIL", msg);
  }
}

console.log("=== sifu-knowledge-tier canary ===\n");

// defaults
for (const model of ["claude-max-cli", "codex-cli", "grok-cli"]) {
  const tier = resolveSifuKnowledgeTier(model);
  const cap = knowledgeCapChars(model);
  console.log(`model=${model} tier=${tier} cap=${cap}`);
  if (model === "claude-max-cli") ok(tier === "t3", "claude default t3");
  if (model === "codex-cli") ok(tier === "t2" || tier === "t1" || tier === "t0", `codex tier resolved ${tier}`);
  if (model === "grok-cli") ok(tier === "t2" || tier === "t1" || tier === "t0", `grok tier resolved ${tier}`);
}

console.log("\n--- canary 10 intent + budget ---\n");
let intentHits = 0;
for (const c of SIFU_KNOWLEDGE_CANARY) {
  const got = classifySifuKnowledgeIntents(c.message, "");
  const overlap = c.intents.some((i) => got.includes(i) || (i === "general" && got.includes("general")));
  if (overlap) intentHits++;
  ok(overlap, `intent ${c.id}: expect~${c.intents.join("|")} got=${got.join("|")}`);

  for (const model of ["codex-cli", "grok-cli"]) {
    const tier = resolveSifuKnowledgeTier(model);
    if (tier === "t0") continue;
    const reserved = 45_000; // baseline+qtbj approx
    const sel = selectTieredBooks({ tier, model, intents: got, reservedChars: reserved });
    const body = renderTieredExtraBlock(sel.selected);
    const total = reserved + body.length;
    const cap = knowledgeCapChars(model);
    ok(total <= cap + 1, `${model} ${c.id} chars ${total} ≤ cap ${cap} (files=${sel.selected.map((x) => x.id).join(",") || "-"} dropped=${sel.dropped.join(",") || "-"})`);
  }
}

const intentPct = (intentHits / SIFU_KNOWLEDGE_CANARY.length) * 100;
ok(intentPct >= 80, `intent accuracy ${intentPct.toFixed(0)}% ≥ 80%`);

// T1 core always present when tier t1/t2 and not over-dropped
{
  const sel = selectTieredBooks({
    tier: "t1",
    model: "codex-cli",
    intents: ["general"],
    reservedChars: 45_000,
  });
  const ids = new Set(sel.selected.map((x) => x.id));
  ok(ids.has("zpzq") || ids.has("geju"), "t1 includes geju or zpzq");
  ok(ids.has("hechong") || ids.has("ajek"), "t1 includes hechong or ajek");
}

console.log(`\nRESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
