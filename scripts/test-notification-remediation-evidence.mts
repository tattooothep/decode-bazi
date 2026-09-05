import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, writeFileSync, symlinkSync, unlinkSync, rmdirSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const backendRoot = resolve(import.meta.dirname, '..');
const mobileRoot = '/root/worktrees/hourkey-mobile-zibai-v3-p0';
const modulePath = join(backendRoot, 'scripts/lib/notification-remediation-release-evidence.cjs');
assert.ok(existsSync(modulePath), 'RED: the current evidence verifier is not implemented');
const api = require(modulePath);
let checks = 0;
function check(name: string, body: () => void) { body(); checks += 1; }
const clone = (v: any) => JSON.parse(JSON.stringify(v));
const policy = api.loadPolicy();
const backend = api.captureCommittedSource(backendRoot, 'backend', policy.references.backend.candidateCommit);
const mobile = api.captureCommittedSource(mobileRoot, 'mobile', policy.references.mobile.candidateCommit);
const snapshots = { backend, mobile };
function fixture() {
  const source = (s: any) => ({ baselineCommit: s.baselineCommit, applicationCommit: s.applicationCommit,
    applicationTree: s.applicationTree, deltaRecords: clone(s.deltaRecords) });
  const bundle = { releaseMode: 'hard_off', policyDigest: api.policyDigest(),
    backend: source(backend), mobile: source(mobile), authors: ['TEST_ONLY_AUTHOR'],
    science: clone(policy.science), providerAttempts: 0,
    activationBoundary: clone(policy.activationBoundary), proofClaims: {} };
  return { schema: 1, bundle, bundleDigest: api.canonicalDigest(bundle), signatures: [] };
}
function resign(document: any) { document.bundleDigest = api.canonicalDigest(document.bundle); return document; }
function metadata(document: any) {
  document.signatures = policy.signatureDimensions.map((dimension: string, i: number) => ({
    reviewerId: `TEST_ONLY_REVIEWER_${i}`, dimension, verdict: 'PASS', bundleDigest: document.bundleDigest,
    backendCommit: document.bundle.backend.applicationCommit, mobileCommit: document.bundle.mobile.applicationCommit,
    findings: { critical: [], important: [], minor: [] }, testEvidence: ['TEST_ONLY_METADATA_NOT_EXECUTION_PROOF'],
    reviewedAt: '2026-09-05T12:00:00Z',
  }));
  return document;
}
function evaluate(document: any) { return api.evaluateEvidenceDocument(document, snapshots); }
function failsSource(mutate: (document: any) => void) {
  const doc = fixture(); mutate(doc); resign(doc);
  assert.equal(evaluate(doc).committedSourceBindingValid, false);
  assert.equal(evaluate(doc).releaseReady, false);
}

check('policy pins exhaustive corrections without wildcard paths', () => {
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.references.backend.deltaRecords), true);
  assert.ok(backend.deltaRecords.length > 50 && mobile.deltaRecords.length > 30);
  for (const side of ['backend', 'mobile']) for (const row of policy.references[side].deltaRecords) {
    assert.ok(!/[?*]/u.test(row.path));
    assert.ok(row.classification && row.authority);
    for (const part of [row.old, row.new].filter(Boolean)) {
      assert.match(part.sha256, /^[0-9a-f]{64}$/u);
      assert.match(part.mode, /^100(?:644|755)$/u);
      assert.match(part.gitOid, /^[0-9a-f]{40}$/u);
    }
  }
});
check('exact immutable source records can validate without claiming release readiness', () => {
  const result = evaluate(fixture());
  assert.equal(result.committedSourceBindingValid, true, JSON.stringify(result));
  assert.equal(result.releaseReady, false);
  assert.equal(result.artifactProofComplete, false);
  assert.equal(result.signaturesValid, false);
  assert.deepEqual(result.missingVerifierCoverage, policy.requiredProofs.map((p: any) => p.id));
  assert.ok(result.missingProofs.includes('independent_review_authority'));
  assert.equal(result.installedPreflightDossierCompatible, false);
  assert.equal(result.verifierCheckoutRole, 'separate_tool_checkout_pins_frozen_application_checkouts_not_its_own_commit');
});
check('omitted backend delta is rejected', () => failsSource(d => d.bundle.backend.deltaRecords.pop()));
check('omitted mobile delta is rejected', () => failsSource(d => d.bundle.mobile.deltaRecords.shift()));
check('invented extra delta is rejected', () => failsSource(d => d.bundle.backend.deltaRecords.push({ ...d.bundle.backend.deltaRecords[0], path: 'scripts/unreviewed.cjs' })));
check('duplicate delta is rejected', () => failsSource(d => d.bundle.mobile.deltaRecords.push(d.bundle.mobile.deltaRecords[0])));
check('delta reordering cannot replace the canonical exhaustive record', () => failsSource(d => d.bundle.backend.deltaRecords.reverse()));
check('changed old SHA-256 is rejected', () => failsSource(d => { const r = d.bundle.backend.deltaRecords.find((x: any) => x.old); r.old.sha256 = '0'.repeat(64); }));
check('changed new SHA-256 is rejected', () => failsSource(d => { d.bundle.mobile.deltaRecords[0].new.sha256 = '1'.repeat(64); }));
check('mode-only tampering is rejected', () => failsSource(d => { d.bundle.backend.deltaRecords[0].new.mode = '100755'; }));
check('classification tampering is rejected', () => failsSource(d => { d.bundle.backend.deltaRecords[0].classification = 'untouched'; }));
check('authority tampering is rejected', () => failsSource(d => { d.bundle.backend.deltaRecords[0].authority = 'self-approved'; }));
check('tree mismatch is rejected', () => failsSource(d => { d.bundle.mobile.applicationTree = 'a'.repeat(40); }));
check('different candidate is not authorized by the same path allowlist', () => failsSource(d => { d.bundle.backend.applicationCommit = 'b'.repeat(40); }));
check('untrusted policy digest is rejected', () => { const d = fixture(); d.bundle.policyDigest = '0'.repeat(64); resign(d); assert.ok(evaluate(d).invalidProofs.includes('policy_digest_mismatch')); });
check('bundle byte mutation is rejected', () => { const d = fixture(); d.bundle.authors.push('another'); assert.ok(evaluate(d).invalidProofs.includes('bundle_digest_mismatch')); });
check('unknown schema is rejected', () => { const d = fixture(); d.schema = 2; assert.ok(evaluate(d).invalidProofs.includes('dossier_shape_invalid')); });
check('extra approval field is rejected', () => { const d: any = fixture(); d.releaseReady = true; assert.ok(evaluate(d).invalidProofs.includes('dossier_shape_invalid')); });
check('Qizheng activation claim is rejected', () => { const d = fixture(); d.bundle.science.qizheng.providerSendEnabled = true; resign(d); assert.ok(evaluate(d).invalidProofs.includes('science_boundary_mismatch')); });
check('astronomy activation claim is rejected', () => { const d = fixture(); d.bundle.science.astronomyFact.providerSendEnabled = true; resign(d); assert.ok(evaluate(d).invalidProofs.includes('science_boundary_mismatch')); });
check('fabricated source completion is rejected', () => { const d = fixture(); d.bundle.science.qizheng.sourceStatus = 'double_verified'; resign(d); assert.ok(evaluate(d).invalidProofs.includes('science_boundary_mismatch')); });
check('provider attempts cannot be hidden by hard-off label', () => { const d = fixture(); d.bundle.providerAttempts = 1; resign(d); assert.ok(evaluate(d).invalidProofs.includes('provider_attempts_not_zero')); });
check('all metadata signatures still do not establish independent authority', () => {
  const r = evaluate(metadata(fixture())); assert.equal(r.signatureMetadataValid, true, JSON.stringify(r));
  assert.equal(r.signaturesValid, false); assert.equal(r.releaseReady, false);
});
check('stale historical signatures rejected', () => { const d = metadata(fixture()); d.signatures[0].bundleDigest = 'd1f86822b35d7a9d261f5a7730d5cea289ff579f0a24233193711b3e12f24880'; assert.equal(evaluate(d).signatureMetadataValid, false); });
check('duplicate reviewers rejected', () => { const d = metadata(fixture()); d.signatures[1].reviewerId = d.signatures[0].reviewerId; assert.equal(evaluate(d).signatureMetadataValid, false); });
check('reviewer case variants cannot evade duplicate detection', () => { const d = metadata(fixture()); d.signatures[1].reviewerId = d.signatures[0].reviewerId.toLowerCase(); assert.equal(evaluate(d).signatureMetadataValid, false); });
check('numeric reviewer cannot be coerced into a valid reviewer identity', () => { const d = metadata(fixture()); d.signatures[0].reviewerId = 123; assert.equal(evaluate(d).signatureMetadataValid, false); });
check('structural signature checks explicitly disclaim actual review authority', () => {
  assert.equal(evaluate(metadata(fixture())).signatureValidationScope, 'structural_only_unverified_identity_authorship_reviews_and_execution');
});
check('future astronomy/Qizheng activation is conditional, not required by hard-off goal', () => {
  const r = evaluate(fixture());
  for (const id of ['separate_signed_astronomy_activation', 'double_verified_qizheng_rulepack_and_separate_activation']) {
    assert.ok(!r.missingProofs.includes(id)); assert.ok(!r.missingVerifierCoverage.includes(id));
    const gate = r.conditionalActivation.find((p: any) => p.id === id);
    assert.equal(gate.requiredForCurrentHardOffRelease, false);
    assert.equal(gate.requiredForCurrentGoalAcceptance, false);
    assert.equal(gate.activationAvailable, false);
  }
});
check('self author rejected', () => { const d = metadata(fixture()); d.signatures[0].reviewerId = d.bundle.authors[0]; assert.equal(evaluate(d).signatureMetadataValid, false); });
check('self author case variant is rejected', () => { const d = metadata(fixture()); d.signatures[0].reviewerId = d.bundle.authors[0].toLowerCase(); assert.equal(evaluate(d).signatureMetadataValid, false); });
check('duplicate dimensions rejected', () => { const d = metadata(fixture()); d.signatures[1].dimension = d.signatures[0].dimension; assert.equal(evaluate(d).signatureMetadataValid, false); });
check('wrong source commit rejected in signature', () => { const d = metadata(fixture()); d.signatures[0].mobileCommit = '0'.repeat(40); assert.equal(evaluate(d).signatureMetadataValid, false); });
check('blocking review finding rejected', () => { const d = metadata(fixture()); d.signatures[0].findings.important.push('unresolved'); assert.equal(evaluate(d).signatureMetadataValid, false); });
check('malformed review date rejected', () => { const d = metadata(fixture()); d.signatures[0].reviewedAt = 'yesterday'; assert.equal(evaluate(d).signatureMetadataValid, false); });
check('calendar-invalid and historical metadata dates rejected', () => {
  for (const at of ['2026-09-31T12:00:00Z', '2026-09-04T23:59:59Z']) {
    const d = metadata(fixture()); d.signatures[0].reviewedAt = at; assert.equal(evaluate(d).signatureMetadataValid, false);
  }
});
check('no author roster rejected', () => { const d = fixture(); d.bundle.authors = []; resign(d); assert.ok(evaluate(d).invalidProofs.includes('author_roster_invalid')); });
check('declared PASS/hash cannot supply any unimplemented actual proof', () => {
  const d: any = fixture();
  for (const proof of policy.requiredProofs) d.bundle.proofClaims[proof.id] = { status: 'PASS', sha256: '0'.repeat(64), path: '/do/not/read/credentials' };
  resign(d); const r = evaluate(metadata(d));
  assert.equal(r.releaseReady, false); assert.equal(r.artifactProofComplete, false);
  for (const p of policy.requiredProofs) assert.ok(r.invalidProofs.includes(`proof_validator_not_implemented:${p.id}`));
  assert.deepEqual(r.missingVerifierCoverage, policy.requiredProofs.map((p: any) => p.id));
});
check('unknown proof cannot expand coverage or leak its arbitrary key', () => {
  const d: any = fixture(); d.bundle.proofClaims.SECRET_SENTINEL_ARBITRARY_KEY = {}; resign(d);
  const r = evaluate(d); assert.ok(r.invalidProofs.includes('unknown_proof_class'));
  assert.doesNotMatch(JSON.stringify(r), /SECRET_SENTINEL_ARBITRARY_KEY/u);
});
check('current file verification does not trust status/index suppression', () => {
  assert.equal(typeof api.verifyWorkingTreeEntries, 'function');
});
check('commit input cannot become a command or revision expression', () => {
  assert.throws(() => api.captureCommittedSource(backendRoot, 'backend', 'HEAD'));
  assert.throws(() => api.captureCommittedSource(backendRoot, 'backend', 'a'.repeat(40) + '; true'));
});
check('source records include complete normalized rename/mode/add/delete semantics', () => {
  const part = (oid: string, mode = '100644') => ({ mode, gitOid: oid.repeat(40), sha256: oid.repeat(64), bytes: 1 });
  const old = [{ path: 'old.txt', ...part('1') }, { path: 'mode.txt', ...part('2') }];
  const next = [{ path: 'new.txt', ...part('1') }, { path: 'mode.txt', ...part('2', '100755') }];
  const rows = api.diffTreeEntries(old, next);
  assert.deepEqual(rows.map((r: any) => [r.path, r.change]), [['mode.txt', 'modify'], ['new.txt', 'add'], ['old.txt', 'delete']]);
  assert.equal(rows[0].old.mode, '100644'); assert.equal(rows[0].new.mode, '100755');
});
check('unchanged controls really bind astronomy and legacy producers', () => {
  assert.ok(backend.controlsValid);
  assert.ok(policy.unchangedControls.some((c: any) => c.path === 'scripts/mobile-network-morning-push-cron.cjs'));
  assert.ok(policy.unchangedControls.some((c: any) => c.path === 'migrations/20260904_mobile_science_notifications_r8.sql'));
  const bad = clone(snapshots); bad.backend.controlsValid = false;
  assert.equal(api.evaluateEvidenceDocument(fixture(), bad).committedSourceBindingValid, false);
});
check('workspace drift is not misrepresented as current source readiness', () => {
  for (const key of ['workspaceClean', 'workspaceStable', 'workspaceHeadMatches', 'workspaceFilesVerified']) {
    const captures = clone(snapshots); captures.mobile[key] = false;
    const r = api.evaluateEvidenceDocument(fixture(), captures);
    assert.equal(r.committedSourceBindingValid, true); assert.equal(r.sourceBindingValid, false);
    assert.ok(r.workspaceIssues.some((reason: string) => reason.startsWith('mobile:')));
  }
});

const temporary = mkdtempSync(join(tmpdir(), 'hourkey-remediation-evidence-test-'));
const created: string[] = [];
try {
  check('raw tracked bytes, modes and absence cannot hide behind clean status', () => {
    const current = join(temporary, 'tracked-file.txt');
    writeFileSync(current, 'original', { mode: 0o600, flag: 'wx' }); created.push(current);
    const oid = createHash('sha1').update('blob 8\0').update('original').digest('hex');
    const entries = [{ path: 'tracked-file.txt', mode: '100644', gitOid: oid }];
    assert.equal(api.verifyWorkingTreeEntries(temporary, entries), true);
    writeFileSync(current, 'tampered');
    assert.equal(api.verifyWorkingTreeEntries(temporary, entries), false);
    writeFileSync(current, 'original');
    assert.equal(api.verifyWorkingTreeEntries(temporary, [{ ...entries[0], mode: '100755' }]), false);
    chmodSync(current, 0o700);
    assert.equal(api.verifyWorkingTreeEntries(temporary, entries), false);
    assert.equal(api.verifyWorkingTreeEntries(temporary, [{ ...entries[0], mode: '100755' }]), true);
    for (const mode of [0o601, 0o610]) {
      chmodSync(current, mode);
      assert.equal(api.verifyWorkingTreeEntries(temporary, [{ ...entries[0], mode: '100755' }]), false);
      assert.equal(api.verifyWorkingTreeEntries(temporary, entries), true);
    }
    chmodSync(current, 0o600);
    assert.equal(api.verifyWorkingTreeEntries(temporary, [{ ...entries[0], path: 'absent.txt' }]), false);
    const link = join(temporary, 'tracked-link.txt'); symlinkSync(current, link); created.push(link);
    assert.equal(api.verifyWorkingTreeEntries(temporary, [{ ...entries[0], path: 'tracked-link.txt' }]), false);
  });
  check('a growing descriptor is sampled with at most original length plus one byte', () => {
    const current = join(temporary, 'growing-file.txt');
    writeFileSync(current, 'original', { mode: 0o600, flag: 'wx' }); created.push(current);
    const oid = createHash('sha1').update('blob 8\0').update('original').digest('hex');
    const io = require('node:fs'), originalRead = io.readSync;
    const target = io.lstatSync(current, { bigint: true });
    let requested = 0, calls = 0;
    io.readSync = (fd: number, buffer: Buffer, offset: number, length: number, position: number) => {
      const opened = io.fstatSync(fd, { bigint: true });
      if (opened.dev === target.dev && opened.ino === target.ino) {
        requested += length; calls += 1;
        assert.ok(calls <= 3, 'reader must not follow a continually growing input');
        writeFileSync(current, 'original' + 'growth'.repeat(calls * 1024));
      }
      return originalRead(fd, buffer, offset, length, position);
    };
    try {
      assert.equal(api.verifyWorkingTreeEntries(temporary, [{ path: 'growing-file.txt', mode: '100644', gitOid: oid }]), false);
    } finally { io.readSync = originalRead; }
    assert.equal(calls, 2); assert.equal(requested, 9);
  });
  const dossier = join(temporary, 'synthetic-incomplete-test-only.json');
  writeFileSync(dossier, JSON.stringify(fixture()), { mode: 0o600, flag: 'wx' }); created.push(dossier);
  const cli = join(backendRoot, 'scripts/verify-notification-remediation-evidence.cjs');
  check('external dossier is read without following links or reading proof targets', () => {
    const result = api.inspectRemediationEvidence({ evidencePath: dossier, backendRoot, mobileRoot });
    assert.equal(result.releaseReady, false); assert.equal(result.committedSourceBindingValid, true);
    const linked = join(temporary, 'linked.json'); symlinkSync(dossier, linked); created.push(linked);
    assert.equal(api.inspectRemediationEvidence({ evidencePath: linked, backendRoot, mobileRoot }).committedSourceBindingValid, false);
  });
  check('in-source dossier and noncanonical path rejected before reading', () => {
    assert.equal(api.inspectRemediationEvidence({ evidencePath: modulePath, backendRoot, mobileRoot }).committedSourceBindingValid, false);
    assert.equal(api.inspectRemediationEvidence({ evidencePath: `${temporary}/./synthetic-incomplete-test-only.json`, backendRoot, mobileRoot }).committedSourceBindingValid, false);
  });
  check('read-only CLI reports incomplete and never release PASS', () => {
    const run = spawnSync(process.execPath, [cli, '--evidence', dossier, '--backend-root', backendRoot, '--mobile-root', mobileRoot], { encoding: 'utf8' });
    assert.equal(run.status, 2, run.stderr + run.stdout); const report = JSON.parse(run.stdout);
    assert.equal(report.releaseReady, false); assert.ok(report.missingVerifierCoverage.length >= 15);
  });
  check('CLI rejects absent, duplicate and unknown arguments', () => {
    for (const args of [[], ['--evidence', dossier], ['--evidence', dossier, '--evidence', dossier, '--backend-root', backendRoot, '--mobile-root', mobileRoot], ['--allow-unsigned']]) {
      const run = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); assert.equal(run.status, 1);
      assert.equal(JSON.parse(run.stdout).releaseReady, false);
    }
  });
  check('malformed and oversized dossier fails closed', () => {
    const malformed = join(temporary, 'malformed.json'); writeFileSync(malformed, '{'); created.push(malformed);
    assert.equal(api.inspectRemediationEvidence({ evidencePath: malformed, backendRoot, mobileRoot }).committedSourceBindingValid, false);
    const oversized = join(temporary, 'oversized.json'); writeFileSync(oversized, Buffer.alloc(2 * 1024 * 1024 + 1)); created.push(oversized);
    assert.ok(api.inspectRemediationEvidence({ evidencePath: oversized, backendRoot, mobileRoot }).invalidProofs.includes('file_not_single_regular_bounded_input'));
  });
  check('CLI error reports never echo malformed dossier content', () => {
    const sensitive = join(temporary, 'error-redaction.json'); writeFileSync(sensitive, 'SECRET_SENTINEL_DO_NOT_ECHO'); created.push(sensitive);
    const run = spawnSync(process.execPath, [cli, '--evidence', sensitive, '--backend-root', backendRoot, '--mobile-root', mobileRoot], { encoding: 'utf8' });
    assert.equal(run.status, 1); assert.doesNotMatch(run.stdout + run.stderr, /SECRET_SENTINEL_DO_NOT_ECHO/u);
    assert.ok(JSON.parse(run.stdout).invalidProofs.includes('dossier_or_source_read_failed'));
  });
  check('frozen policy cannot be changed by updating the dossier digest', () => {
    const copyModule = join(temporary, 'notification-remediation-release-evidence.cjs');
    const copyPolicy = join(temporary, 'notification-remediation-release-policy.json');
    writeFileSync(copyModule, readFileSync(modulePath), { flag: 'wx' }); created.push(copyModule);
    const forged = clone(policy); forged.references.backend.deltaRecords.pop();
    writeFileSync(copyPolicy, JSON.stringify(forged), { flag: 'wx' }); created.push(copyPolicy);
    assert.throws(() => require(copyModule).loadPolicy(), /frozen_policy_bytes_changed/u);
  });
  check('helper/CLI cannot import a DB/provider/build entrypoint or repurpose HOME', () => {
    const code = readFileSync(modulePath, 'utf8') + readFileSync(cli, 'utf8');
    assert.doesNotMatch(code, /require\(['"](?:pg|.*push-send|.*mobile-notification-delivery|.*test-notification-r8-final-gates)/u);
    assert.doesNotMatch(code, /(?:\bHOME\s*:|process\.env\.HOME\s*=|\bHOME\s*=)/u);
    assert.doesNotMatch(code, /git\(root,\s*\["status"/u);
    assert.match(code, /GIT_NO_LAZY_FETCH:\s*"1"/u);
    assert.match(code, /GIT_ALLOW_PROTOCOL:\s*""/u);
    assert.doesNotMatch(code, /fs\.readFileSync\(fd\)/u);
  });
} finally {
  for (const path of created.reverse()) unlinkSync(path);
  rmdirSync(temporary);
}
console.log(`notification remediation evidence: PASS (${checks} checks; no release approval; no DB/network/build/provider calls)`);
