import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const route = readFileSync(join(ROOT, "src/app/api/sifu/group/route.ts"), "utf8");
const master = readFileSync(join(ROOT, "public/master.html"), "utf8");

let pass = 0;
let fail = 0;
function ck(label: string, condition: boolean, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ✅ ${label}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${label}${detail ? ` · ${detail}` : ""}`);
  }
}

ck("group route is pair-only MAX_GROUP=2", /const MAX_GROUP = 2;/.test(route));
ck("group route rejects more than two profiles instead of silently slicing", /pair_context_requires_two_profiles/.test(route) && !/profileIds = profileIds\.slice\(0, MAX_GROUP\)/.test(route));
ck("group route sends full chart packet to every model", /renderChartPrompt\(packet,\s*\{\s*includeTransitDrilldown:\s*true,[\s\S]*subjectLabel:/.test(route));
ck("group route does not disable monthly transit drilldown", !/includeTransitMonthlyDrilldown:\s*false/.test(route));
ck("group route passes annual pillar to synastry resolver", /annualPillar:\s*packet\.annualPillar/.test(route));
ck("group route passes current luck to synastry resolver", /currentLuck:\s*packet\.currentLuck/.test(route));
ck("group route still accepts Grok model", /if \(s === "grok" \|\| s === "grok-cli"\) return "grok-cli";/.test(route));
ck("group route does not force all pair requests to Claude", !/const sifuModel\s*=\s*"claude-max-cli"/.test(route));
ck("master UI blocks group sends above two profiles before request", /if \(hkgG\.ids\.length > 2\)/.test(master) && /โหมดดวงคู่รับเฉพาะ 2 ดวง/.test(master));
ck("master UI still sends selected model including Grok", /var modelG = selectedSifuModel\(\);/.test(master) && /model:\s*modelG/.test(master));

console.log(`\n[sifu-group-pair-contract] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
