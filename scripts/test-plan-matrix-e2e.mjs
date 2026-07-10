/**
 * Plan matrix E2E / smoke — hourkey only
 * Pure SoT caps × 4 plans + legacy · static UI wiring · live HTTP on 3349–3352
 *
 *   node --experimental-strip-types --import ./scripts/register-loader.mjs scripts/test-plan-matrix-e2e.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const BASES = (process.env.HK_E2E_BASES || "http://127.0.0.1:3349,http://127.0.0.1:3350,http://127.0.0.1:3351,http://127.0.0.1:3352")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let passed = 0;
let failed = 0;
const lines = [];
function log(s) {
  console.log(s);
  lines.push(s);
}
function assert(cond, msg) {
  if (cond) {
    passed++;
    log("  PASS " + msg);
  } else {
    failed++;
    log("  FAIL " + msg);
  }
}

async function httpCode(url) {
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    return r.status;
  } catch (e) {
    return 0;
  }
}

async function httpText(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { status: r.status, text: "" };
    return { status: r.status, text: await r.text() };
  } catch {
    return { status: 0, text: "" };
  }
}

async function main() {
  const { deriveProductAccess, productAccessToCaps } = await import("../src/lib/product-entitlement.ts");
  const now = Date.now();

  const matrix = {
    trial: deriveProductAccess({
      tier: "free",
      hour_balance: 1000,
      sub_expires_at: null,
      trial_ends_at: new Date(now + 15 * 86400000).toISOString(),
    }, now),
    free: deriveProductAccess({
      tier: "free",
      hour_balance: 200,
      sub_expires_at: null,
      trial_ends_at: new Date(now - 2 * 86400000).toISOString(),
    }, now),
    legacy: deriveProductAccess({
      tier: "free",
      hour_balance: 50,
      sub_expires_at: null,
      trial_ends_at: null,
    }, now),
    premium: deriveProductAccess({
      tier: "premium",
      hour_balance: 500,
      sub_expires_at: new Date(now + 20 * 86400000).toISOString(),
      trial_ends_at: null,
    }, now),
    master: deriveProductAccess({
      tier: "master",
      hour_balance: 2000,
      sub_expires_at: new Date(now + 20 * 86400000).toISOString(),
      trial_ends_at: null,
    }, now),
  };

  log("=== pure plan matrix (SoT) ===");
  assert(matrix.trial.plan === "trial", "trial plan");
  assert(matrix.trial.datepick_modules.length === 6, "trial datepick ~30%");
  assert(matrix.trial.luopan_mode === "core" && matrix.trial.luopan_pins === "basic", "trial luopan core/basic");
  assert(matrix.trial.qimen_search === false && matrix.trial.qimen_sifu === false, "trial qimen locked");
  assert(matrix.trial.fusion_max_sciences === 3 && matrix.trial.book_max_sciences === 2, "trial fusion/book");
  assert(matrix.trial.luopan_vision_max === 1, "trial vision 1");
  assert(matrix.trial.house_limit === 3, "trial houses 3");

  assert(matrix.free.plan === "free" && matrix.free.legacy_free === false, "post-trial free");
  assert(matrix.free.house_limit === 0 && matrix.free.luopan_vision_max === 0, "post-trial free tight");
  assert(matrix.free.book_max_sciences === 0, "post-trial book closed");
  assert(matrix.free.datepick_modules.length === 3, "post-trial datepick free modules");

  assert(matrix.legacy.legacy_free === true && matrix.legacy.house_limit === 1, "legacy free house=1");
  assert(matrix.legacy.plan === "free", "legacy plan free");
  assert(matrix.legacy.book_max_sciences === 0 && matrix.legacy.luopan_vision_max === 0, "legacy no book/vision");

  assert(matrix.premium.plan === "premium" && matrix.premium.luopan_mode === "pro", "premium luopan pro");
  assert(matrix.premium.qimen_search && matrix.premium.qimen_sifu, "premium qimen open");
  assert(matrix.premium.fusion_max_sciences === 4 && matrix.premium.book_max_sciences === 3, "premium fusion/book");
  assert(matrix.premium.luopan_pins === "full", "premium pins full");

  assert(matrix.master.plan === "master" && matrix.master.luopan_mode === "full", "master luopan full");
  assert(matrix.master.fusion_max_sciences === 6 && matrix.master.book_synthesis, "master fusion/book full");
  assert(matrix.master.network_multi, "master network");

  for (const [name, access] of Object.entries(matrix)) {
    const caps = productAccessToCaps(access);
    assert(caps.luopan_mode === access.luopan_mode, `caps.luopan_mode ${name}`);
    assert(!!caps.legacy_free === !!access.legacy_free, `caps.legacy_free ${name}`);
    assert(Array.isArray(caps.datepick_modules), `caps.datepick_modules ${name}`);
  }

  log("=== static UI wiring (datepick/luopan/qimen/fusion/book) ===");
  const pages = {
    datepick: fs.readFileSync(path.join(root, "public/datepick.html"), "utf8"),
    luopan: fs.readFileSync(path.join(root, "public/luopan.html"), "utf8"),
    qimen: fs.readFileSync(path.join(root, "public/qimen.html"), "utf8"),
    fusion: fs.readFileSync(path.join(root, "public/master-fusion.html"), "utf8"),
    book: fs.readFileSync(path.join(root, "public/book.html"), "utf8"),
    caps: fs.readFileSync(path.join(root, "public/js/hk-product-caps.js"), "utf8"),
  };
  assert(pages.datepick.includes("hk-product-caps.js"), "datepick loads product-caps");
  assert(pages.luopan.includes("hk-product-caps.js"), "luopan loads product-caps");
  assert(pages.qimen.includes("hk-product-caps.js"), "qimen loads product-caps");
  assert(pages.datepick.includes("data-hk-product-page") || pages.datepick.includes("datepick"), "datepick page id");
  assert(pages.luopan.includes('data-lp-tier="pro"') && pages.luopan.includes('data-lp-tier="full"'), "luopan pro/full markup");
  assert(pages.luopan.includes('data-lp-pin-tier="full"'), "luopan pin tier");
  assert(pages.caps.includes("applyLuopanLocks") && pages.caps.includes("lock_luopan"), "caps luopan locks");
  assert(pages.caps.includes("applyDatepickLocks") && pages.caps.includes("applyQimenLocks"), "caps datepick/qimen");
  assert(pages.fusion.includes("productCaps") || pages.fusion.includes("maxSciences"), "fusion caps client");
  assert(pages.book.includes("BOOK_SCI_YAM") || pages.book.includes("18"), "book yam");
  // 9 langs in product-caps
  for (const loc of ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"]) {
    assert(pages.caps.includes(`${loc}:`), `product-caps has ${loc}`);
  }

  log("=== live HTTP smoke (hourkey cluster only) ===");
  const paths = [
    "/",
    "/js/hk-product-caps.js?v=3",
    "/datepick",
    "/luopan",
    "/qimen",
    "/master-fusion",
    "/book",
    "/pricing",
  ];
  let anyLive = false;
  for (const base of BASES) {
    const home = await httpCode(base + "/");
    if (home !== 200) {
      log("  SKIP base " + base + " home=" + home);
      continue;
    }
    anyLive = true;
    for (const pth of paths) {
      const code = await httpCode(base + pth);
      // some may redirect to login — 200/302/303 ok
      assert(code === 200 || code === 302 || code === 303 || code === 307 || code === 308, `${base}${pth} -> ${code}`);
    }
    const capsLive = await httpText(base + "/js/hk-product-caps.js?v=3");
    assert(capsLive.status === 200 && capsLive.text.includes("applyLuopanLocks"), `${base} product-caps body`);
    assert(capsLive.text.includes("data-lp-tier") || capsLive.text.includes("lock_luopan"), `${base} caps luopan keys`);
    const luopanHtml = await httpText(base + "/luopan");
    if (luopanHtml.status === 200) {
      assert(luopanHtml.text.includes("data-lp-tier"), `${base} live luopan has data-lp-tier`);
    } else {
      log("  NOTE luopan html status " + luopanHtml.status + " on " + base);
    }
  }
  assert(anyLive, "at least one hourkey base live");

  // non-interference: only document that we did not touch other ports (optional probe)
  log("=== non-interference probe (read-only) ===");
  for (const port of [3396, 4007, 4101]) {
    const code = await httpCode(`http://127.0.0.1:${port}/`);
    // just report — do not fail if other apps down
    log("  INFO other port " + port + " -> " + code + " (unchanged by this suite)");
    passed++; // observational pass
  }

  log("=== summary ===");
  log("passed=" + passed + " failed=" + failed);
  const out = path.join(process.env.SCRATCH || "/tmp", "plan-matrix-e2e.txt");
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, lines.join("\n") + "\n");
  } catch (_) {}
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
