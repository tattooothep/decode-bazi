import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.env.PAIR_REACTION_V2_TS_READY !== "1") {
  const self = fileURLToPath(import.meta.url);
  const child = spawnSync(process.execPath, [
    "--experimental-strip-types",
    "--import",
    "./scripts/_ts-resolver.mjs",
    self,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, PAIR_REACTION_V2_TS_READY: "1" },
    stdio: "inherit",
  });
  process.exit(child.status ?? 1);
}

const { computePairReactionV2 } = await import("../src/lib/scoring/pair-reaction-v2.ts");
const { buildNetworkScorePayload } = await import("../src/lib/scoring/network-score-payload.ts");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function finiteScore(value, label) {
  assert(Number.isFinite(value), `${label} is not finite`);
  assert(value >= -100 && value <= 100, `${label} out of range: ${value}`);
}

const fireNeedsFire = {
  id: "needs-fire",
  year: { stem: "庚", branch: "子" },
  month: { stem: "壬", branch: "子" },
  day: { stem: "甲", branch: "辰" },
  hour: { stem: "癸", branch: "亥" },
  useful: {
    primary_yongshen: ["fire"],
    xishen: ["wood"],
    jishen: ["water", "metal"],
    medicine: ["fire"],
    diseases: ["water"],
  },
};

const fireHeavySupport = {
  id: "fire-heavy",
  year: { stem: "丙", branch: "午" },
  month: { stem: "丁", branch: "巳" },
  day: { stem: "丙", branch: "午" },
  hour: { stem: "甲", branch: "寅" },
  useful: {
    primary_yongshen: ["water"],
    xishen: ["metal"],
    jishen: ["fire"],
  },
};

const waterHeavyFriction = {
  id: "water-heavy",
  year: { stem: "壬", branch: "子" },
  month: { stem: "癸", branch: "亥" },
  day: { stem: "壬", branch: "子" },
  hour: { stem: "庚", branch: "申" },
  useful: {
    primary_yongshen: ["fire"],
    xishen: ["wood"],
    jishen: ["water"],
  },
};

const dayClashPerson = {
  id: "day-clash",
  year: { stem: "乙", branch: "卯" },
  month: { stem: "辛", branch: "酉" },
  day: { stem: "庚", branch: "戌" },
  hour: { stem: "辛", branch: "酉" },
  useful: {
    primary_yongshen: ["wood"],
    xishen: ["fire"],
    jishen: ["metal"],
  },
};

const fullGroupA = {
  id: "full-group-a",
  year: { stem: "甲", branch: "寅" },
  month: { stem: "乙", branch: "卯" },
  day: { stem: "甲", branch: "辰" },
  hour: { stem: "丙", branch: "午" },
  useful: { primary_yongshen: ["fire"], jishen: ["water"] },
};

const duplicateBranchB = {
  id: "duplicate-branch-b",
  year: { stem: "甲", branch: "寅" },
  month: { stem: "甲", branch: "寅" },
  day: { stem: "甲", branch: "寅" },
  hour: { stem: "甲", branch: "寅" },
  useful: { primary_yongshen: ["water"], jishen: ["fire"] },
};

const usefulClashA = {
  id: "useful-clash-a",
  year: { stem: "丙", branch: "午" },
  month: { stem: "丙", branch: "午" },
  day: { stem: "丙", branch: "午" },
  hour: { stem: "丙", branch: "午" },
  useful: { primary_yongshen: ["fire"], jishen: ["water"] },
};

const waterClashB = {
  id: "water-clash-b",
  year: { stem: "壬", branch: "子" },
  month: { stem: "壬", branch: "子" },
  day: { stem: "壬", branch: "子" },
  hour: { stem: "壬", branch: "子" },
  useful: { primary_yongshen: ["fire"], jishen: ["water"] },
};

const controlsB = {
  id: "controls-b",
  year: { stem: "戊", branch: "辰" },
  month: { stem: "戊", branch: "辰" },
  day: { stem: "戊", branch: "辰" },
  hour: { stem: "戊", branch: "辰" },
  useful: { primary_yongshen: ["wood"], jishen: ["metal"] },
};

const supportive = computePairReactionV2({ a: fireNeedsFire, b: fireHeavySupport });
const friction = computePairReactionV2({ a: fireNeedsFire, b: waterHeavyFriction });
const directional = computePairReactionV2({ a: fireNeedsFire, b: dayClashPerson });
const duplicateGroup = computePairReactionV2({ a: fullGroupA, b: duplicateBranchB });
const usefulClash = computePairReactionV2({ a: usefulClashA, b: waterClashB });
const controlPath = computePairReactionV2({ a: fireNeedsFire, b: controlsB });
const routePayload = await buildNetworkScorePayload({
  scoringVersion: "v2",
  self: fireNeedsFire,
  others: [{ id: fireHeavySupport.id, ...fireHeavySupport }],
  selfYongshen: ["fire"],
  selfJishen: ["water", "metal"],
  date: "2026-06-03",
});

for (const [name, result] of Object.entries({ supportive, friction, directional })) {
  assert(result.version === "pair-reaction-v2", `${name} wrong version`);
  for (const key of ["day", "week", "month", "year", "luck", "overall"]) finiteScore(result.scores[key], `${name}.${key}`);
  finiteScore(result.directional.atob.score, `${name}.atob`);
  finiteScore(result.directional.btoa.score, `${name}.btoa`);
  finiteScore(result.contexts.work, `${name}.contexts.work`);
  assert(Array.isArray(result.tags), `${name}.tags missing`);
  assert(result.guidance && typeof result.guidance.primary === "string", `${name}.guidance missing`);
}

assert(
  supportive.directional.atob.score > friction.directional.atob.score,
  `supportive should beat friction: ${supportive.directional.atob.score} <= ${friction.directional.atob.score}`,
);
assert(
  supportive.directional.atob.breakdown.support > friction.directional.atob.breakdown.support,
  "supportive case should have stronger support breakdown",
);
assert(
  friction.directional.atob.breakdown.friction > supportive.directional.atob.breakdown.friction,
  "friction case should have stronger friction breakdown",
);
assert(
  Math.abs(directional.directional.atob.score - directional.directional.btoa.score) >= 8,
  `directionality too flat: atob=${directional.directional.atob.score}, btoa=${directional.directional.btoa.score}`,
);
assert(
  !duplicateGroup.directional.atob.tags.some((tag) => tag.includes("三會") || tag.includes("三合")),
  `duplicate branch should not create group bonus: ${duplicateGroup.directional.atob.tags.join(",")}`,
);
assert(usefulClash.directional.atob.flags.includes("clash_hits_useful"), "own useful branch clash was not flagged");
assert(controlPath.directional.atob.tags.includes("我克"), "A-controls-B relation was not tagged");
assert(routePayload.version === "pair-reaction-v2", `route V2 version wrong: ${routePayload.version}`);
assert(routePayload.scores?.[fireHeavySupport.id], "route V2 scores missing");
assert(routePayload.directional?.[fireHeavySupport.id], "route V2 directional missing");
assert(routePayload.breakdown?.[fireHeavySupport.id]?.atob, "route V2 breakdown missing");
assert(routePayload.guidance?.[fireHeavySupport.id], "route V2 guidance missing");
assert(routePayload.reaction_v2?.[fireHeavySupport.id]?.version === "pair-reaction-v2", "route V2 full reaction missing");
assert(
  routePayload.tags[fireHeavySupport.id].join("|") === routePayload.reaction_v2[fireHeavySupport.id].directional.atob.tags.join("|"),
  "route top-level tags must remain A->B only",
);

console.log("pair-reaction-v2 regression");
console.log(`supportive A->B: ${supportive.directional.atob.score} overall=${supportive.scores.overall}`);
console.log(`friction A->B: ${friction.directional.atob.score} overall=${friction.scores.overall}`);
console.log(`directional A->B/B->A: ${directional.directional.atob.score}/${directional.directional.btoa.score}`);
console.log(`route V2 version: ${routePayload.version} overall=${routePayload.scores[fireHeavySupport.id].overall}`);
