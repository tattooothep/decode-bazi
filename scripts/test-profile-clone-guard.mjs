import fs from "node:fs";

const checks = [];

function ok(name, pass) {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? "✓" : "✗"} ${name}`);
}

const guard = fs.readFileSync("src/lib/profile-clone-guard.ts", "utf8");
const createRoute = fs.readFileSync("src/app/api/profile/create/route.ts", "utf8");
const updateRoute = fs.readFileSync("src/app/api/profile/[id]/route.ts", "utf8");
const backfill = fs.readFileSync("migrations/20260603_research_console_backfill.sql", "utf8");

ok("clone guard checks active self profiles only", /is_archived=false/.test(guard) && /relationship_type IS NULL/.test(guard));
ok("clone guard matches birth date, time, known flag, and day boundary", /birth_time_known=\$3/.test(guard) && /YYYY-MM-DD/.test(guard) && /HH24:MI/.test(guard) && /COALESCE\(day_boundary, '23:00'\) = \$6/.test(guard));
ok("clone guard supports excluding the profile being updated", /\$7::uuid IS NULL OR id <> \$7::uuid/.test(guard));
ok("profile create route rejects self-profile clones", /findMatchingSelfProfile/.test(createRoute) && /code: "self_profile_clone"/.test(createRoute));
ok("profile update route rejects self-profile clones", /findMatchingSelfProfile/.test(updateRoute) && /code: "self_profile_clone"/.test(updateRoute));
ok("profile update route preserves existing nickname for clone comparison", /name, nickname, gender/.test(updateRoute) && /existing\.nickname/.test(updateRoute));
ok("research backfill ignores archived profiles", /FROM profiles p\s+WHERE p\.is_archived=false/.test(backfill));

const failed = checks.filter((c) => !c.pass);
if (failed.length) {
  console.error(`\n${failed.length}/${checks.length} profile clone guard checks failed`);
  process.exit(1);
}
console.log(`\n=== ${checks.length}/${checks.length} PASS ===`);
