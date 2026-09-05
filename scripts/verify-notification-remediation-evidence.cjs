#!/usr/bin/env node
"use strict";
// Read-only SOURCE dossier only. This schema/output must not be passed as an
// installed migration preflight dossier: actual build/runtime/source artifact
// digests, execution proofs and independently authenticated reviews are absent.
// Invoke this from a separate reviewed tool checkout. --backend-root and
// --mobile-root identify application checkouts at the policy's frozen commits;
// do not move those pins to this tool's own HEAD or install an evidence exception.
const { inspectRemediationEvidence, failureReport } = require("./lib/notification-remediation-release-evidence.cjs");

function main(argv) {
  const allowed = new Map([["--evidence", "evidencePath"], ["--backend-root", "backendRoot"], ["--mobile-root", "mobileRoot"]]);
  const options = {};
  if (argv.length !== 6) return failureReport("cli_arguments_invalid");
  for (let index = 0; index < argv.length; index += 2) {
    const key = allowed.get(argv[index]);
    if (!key || Object.hasOwn(options, key) || !argv[index + 1] || argv[index + 1].startsWith("--")) return failureReport("cli_arguments_invalid");
    options[key] = argv[index + 1];
  }
  return inspectRemediationEvidence(options);
}
if (require.main === module) {
  const result = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  // No branch in this source-only slice may authorize a release.
  process.exitCode = result.invalidProofs.length > 0 ? 1 : 2;
}
module.exports = Object.freeze({ main });
