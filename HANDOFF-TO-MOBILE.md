# Backend-to-Mobile Handoff Pack — 2026-07-14

เอกสารนี้เป็นใบรับช่วงจากทีม backend ไปยังจาวิสสำหรับ release `r515` และการเตรียม iOS ผ่าน EAS เท่านั้น จาวิสเป็นเจ้าของแอพมือถือทั้งหมด ทีม backend ไม่แก้, stage หรือ commit ใน `/root/worktrees/hourkey-mobile-p0-network-sifu`.

ทั้งสอง shared worktrees อาจมีงานของทีมอื่นค้างอยู่ ห้ามใช้ `git clean`, `git reset --hard`, bulk `git checkout`/`git restore`, `git add .` หรือคำสั่งใดที่ลบ/กลบงานเดิม. จาวิสอ่าน `/root/decode-app` ได้แต่ไม่มีสิทธิ์ checkout, reset, generate, stage หรือ commit ที่นี่; หากต้องการรันหลักฐานเองให้ใช้ disposable clone ที่แยกจาก shared worktree.

## สถานะส่งมอบ

| ชิ้นงาน                            | Commit SHA                                 | หลักฐานรับงาน                                                                                           |
| ---------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `pland.md` และ decision log ล่าสุด | `ded8de165a825381bf7b5d2ed691eea54167afec` | blob `2c3c2d629e5358b7f76b5fe3b48ab618a17894ee`; `git show` ตรงไฟล์ปัจจุบันทุกไบต์                      |
| เขตงานถาวรและคำเคาะ 14 ก.ค.        | `32744b1e0db1aa6224d4bd1e29461a36f13e4652` | มี `TEAM-SPLIT-20260714.md`; entitlement ยังแช่และ production ต้องรอเจ้าของเคาะ                         |
| Mobile r515 sanitized fixtures     | `7cb4edb5b3c9399de9a3da23e2aa1f62a0d8fc1d` | 30 fixtures, full checks 570, privacy checks 131, reviewer 0 Critical/Important/Minor                   |
| EAS iOS handoff pack               | `2fbabbd9f96c51ca0fd3669fbedde87dcd590337` | checks 188, JSON/YAML/Bash/Prettier ผ่าน, adoption simulation ผ่าน, reviewer 0 Critical/Important/Minor |

`pland.md` มีหมุดฐานเดิมใน `32744b1...` และมี commit ต่อท้าย `ded8de1...` เพื่อเก็บคำเคาะล่าสุดเรื่องแถบในหน้า/หน้าย่อยพร้อม decision-log row โดยไม่ทับประวัติเดิม ให้ใช้ `ded8de1...` เป็น SHA รับงานของไฟล์ล่าสุด.

## Verification workspace สำหรับจาวิส

ก่อนรัน code block ใดในเอกสารนี้ จาวิสต้องสร้าง clean disposable clone ก่อน ห้ามชี้ `DECODE_REPO` กลับมาที่ shared `/root/decode-app`:

```bash
set -euo pipefail
umask 077
DECODE_PARENT="$(mktemp -d "${TMPDIR:-/tmp}/hourkey-decode-handoff.XXXXXX")"
git clone --no-hardlinks /root/decode-app "$DECODE_PARENT/decode-app"
export DECODE_REPO="$DECODE_PARENT/decode-app"
test "$(realpath -m "$DECODE_REPO")" != "/root/decode-app"
cd "$DECODE_REPO"
test -z "$(git status --porcelain --untracked-files=all)"
```

ทุกบล็อกด้านล่างถือว่า `DECODE_REPO` มาจากขั้นตอนนี้. การ clone อ่าน shared repository แต่ไม่เปลี่ยน checkout/index/worktree ของทีม backend.

## 1. แผนและเขตงาน

ไฟล์:

- `pland.md` — source of truth ของแผน, 12 route UI reference, release gates และ decision log ล่าสุด
- `TEAM-SPLIT-20260714.md` — จาวิสเป็นเจ้าของ mobile worktree; ทีม backend เป็นเจ้าของ `decode-app` และเส้น API

ตรวจ byte binding:

```bash
set -euo pipefail
: "${DECODE_REPO:?Create the clean disposable clone first}"
test "$(realpath -m "$DECODE_REPO")" != "/root/decode-app"
cd "$DECODE_REPO"
test -z "$(git status --porcelain --untracked-files=all)"
PLAN_SHA=ded8de165a825381bf7b5d2ed691eea54167afec
git show "$PLAN_SHA:pland.md" | cmp - pland.md
test "$(git rev-parse "$PLAN_SHA:pland.md")" = "$(git hash-object pland.md)"
```

ผลที่ต้องได้คือ exit code `0` ทั้งสองคำสั่ง โดย blob ปัจจุบันคือ `2c3c2d629e5358b7f76b5fe3b48ab618a17894ee`.

## 2. Mobile r515 sanitized fixtures

แหล่งหลัก:

- `test-fixtures/mobile-r515/manifest.json`
- `test-fixtures/mobile-r515/README.md`
- `scripts/build-mobile-r515-fixtures.mjs`
- `scripts/lib/mobile-r515-fixture-contract.mjs`
- `scripts/test-mobile-r515-fixtures.mjs`
- `scripts/data/mobile-r515-*.json` จำนวน 6 ไฟล์ — deterministic sanitized source material ที่ generator ต้องใช้; ไม่ใช่ raw production capture

Manifest SHA-256:

```text
d4e85120b540ecec836df8dc26a2073c667bf4bbec2c9d852a832d6bccdff66c
```

ชุดไฟล์ 30 รายการ:

- Today: `today.sanitized.json`, `today-hours.sanitized.json`, `today-directions.sanitized.json`, `today-goals.sanitized.json`
- Chart: `chart.sanitized.json`
- Calendar: `calendar.sanitized.json`
- Network: `network.sanitized.json`, `network-sifu.sanitized.json`, `network-bulk.sanitized.json`
- Qimen: `qimen-basic.sanitized.json`, `qimen-professional.sanitized.json`, `qimen-search.sanitized.json`, `qimen-sifu.sanitized.json`
- Datepick + saved dates: `datepick.sanitized.json`, `datepick-save.sanitized.json`, `datepick-saved.sanitized.json`, `datepick-delete.sanitized.json`
- Luopan: `luopan-rings.sanitized.json`, `luopan-bootstrap.sanitized.json`, `luopan-rings-w4.sanitized.json`, `luopan-analysis.sanitized.json`, `luopan-snapshot.sanitized.json`, `luopan-measurements-get.sanitized.json`, `luopan-measurements-post.sanitized.json`, `luopan-sifu.sanitized.json`, `luopan-vision.sanitized.json`
- Sifu: `sifu-chat.sanitized.json`, `sifu-chat-stream.sanitized.json`, `sifu-history.sanitized.json`, `sifu-group.sanitized.json`

Fixtures ครอบคลุม 27 route paths และ method/alias/plan variants ที่ประกาศใน manifest. ข้อมูลเป็น synthetic deterministic contract: identity เป็น `null` หรือชื่อ fixture ที่ allowlist ไว้; UUID คงที่ใช้เฉพาะ saved-date และ Luopan measurement round-trip; ไม่มี token, email, เบอร์โทร,ชื่อจริง, profile ID จริง, private conversation, exact location หรือ secret.

คำสั่งสร้างและตรวจ:

บล็อกนี้เป็นคำสั่งของ backend operator ใน task-owned checkout หรือของจาวิสใน disposable clone เท่านั้น เพราะ generator เขียนทับ exact files ใต้ `test-fixtures/mobile-r515`. ห้ามจาวิสรันใน shared `/root/decode-app`.

```bash
set -euo pipefail
: "${DECODE_REPO:?Create the clean disposable clone first}"
test "$(realpath -m "$DECODE_REPO")" != "/root/decode-app"
cd "$DECODE_REPO"
test -z "$(git status --porcelain --untracked-files=all)"
node scripts/build-mobile-r515-fixtures.mjs --output-dir test-fixtures/mobile-r515
node scripts/test-mobile-r515-fixtures.mjs --privacy-only
node scripts/test-mobile-r515-fixtures.mjs
sha256sum test-fixtures/mobile-r515/manifest.json
test -z "$(git status --porcelain --untracked-files=all)"
```

ผลรับงานล่าสุด:

```text
MOBILE_R515_FIXTURES_BUILT count=30 manifest_sha256=d4e85120b540ecec836df8dc26a2073c667bf4bbec2c9d852a832d6bccdff66c
MOBILE_R515_FIXTURE_PRIVACY_OK checks=131
MOBILE_R515_FIXTURES_OK checks=570 count=30
```

ขั้นตอนรับช่วงของจาวิส:

1. อ่าน commit `7cb4edb...` หรือใหม่กว่าจาก shared `/root/decode-app` โดยไม่เปลี่ยน checkout; หากต้องรัน generator/tests ให้ clone commit นั้นไป disposable path ที่ clean ก่อน.
2. รัน privacy-only และ full suiteใน disposable clone ก่อนอ่าน fixtures เข้า mobile tests.
3. อ่าน `manifest.json` เพื่อ bind filename กับ endpoint, method, alias, variant และ synthetic plan; อย่าเดาจากชื่อไฟล์อย่างเดียว.
4. ปรับ fixture allowlist/test importer ใน mobile worktree ด้วย commit ของจาวิสเอง. ทีม backend ไม่ copy หรือ commit ให้.
5. หาก contract ฝั่งแอพไม่ตรง ให้เปิด finding พร้อม endpoint + JSON pointer; ห้ามแก้ fixture ให้ผ่านด้วยการลดข้อมูล science หรือปิด privacy gate.

Wire authority คือ immutable deployed release `/root/releases/decode-app-r515-mobile-api`, declared source commit `f1c849bd74dcfa6998e44553f2591f3789ac3429`, source head `cb1fb9e9815d25eccb9f29048f24d0a46a22c310`. Frozen entitlement overlay ไม่ใช่ authority ของ fixture ชุดนี้.

## 3. EAS iOS handoff

ไฟล์ทั้งหมดอยู่ใน `/root/decode-app`:

- `handoff/mobile/eas-ios/eas.json.template.json`
- `handoff/mobile/eas-ios/app-config.ios.template.json`
- `handoff/mobile/eas-ios/eas-ios-build.workflow.yml`
- `docs/mobile/EAS-IOS-HANDOFF.md`
- `docs/mobile/EAS-IOS-OWNER-CHECKLIST.md`
- `scripts/test-eas-ios-handoff.mjs`

เริ่มที่ `docs/mobile/EAS-IOS-OWNER-CHECKLIST.md` แล้วทำ `docs/mobile/EAS-IOS-HANDOFF.md` ตามลำดับ ห้าม copy template ทับ config เดิมทั้งไฟล์.

ข้อมูล non-secret 5 ค่าเจ้าของต้องกรอก:

```text
OWNER_INPUT_EXPO_OWNER
OWNER_INPUT_EAS_PROJECT_ID
OWNER_INPUT_IOS_BUNDLE_IDENTIFIER
OWNER_INPUT_APPLE_TEAM_ID
OWNER_INPUT_IOS_BUILD_NUMBER
```

สิ่งที่เจ้าของ/credential operator ต้องเตรียม:

1. Apple Developer membership, agreements, Team ID และสิทธิ์ Certificates, Identifiers & Profiles.
2. App Store Connect record/role, bundle ID/App ID, capabilities, build-number state และข้อมูล store/legal ที่ checklist ระบุ.
3. Expo owner และ EAS project UUID ที่ยืนยันว่าเป็นโปรเจกต์เดียว; ถ้ายังไม่มีให้ใช้ disposable-copy branch ใน checklist เพียงครั้งเดียว.
4. Apple Distribution certificate, App Store profile, Ad Hoc profile + UDIDs และ APNs key ผ่าน EAS-managed remote credentials.
5. Expo Robot user `Developer` role เป็นทางเลือกหลัก หรือ personal-token fallback ที่เจ้าของยอมรับขอบเขตอย่างชัดเจน; ใส่ค่า token โดยตรงใน mobile repository secret ชื่อ `EXPO_TOKEN`.

ลำดับรับช่วงของจาวิส:

1. เลือก mobile commit ที่เจ้าของอนุมัติและต้อง clean.
2. กรอก 5 ค่า non-secret แล้วใช้ merge block ใน runbook; ตรวจทั้ง `expo config --type public` และ `--type introspect` ก่อน stage.
3. หาก dynamic `app.config.js` กลบค่า ให้แก้โดยคง incoming config ตาม runbook แล้ว review/stage/commit ด้วยจาวิสเอง.
4. Credential operator ทำ interactive bootstrap หนึ่งครั้ง, ตรวจ device list แบบ pagination, ผูก remote signing และทำ preview/production build เพื่อพิสูจน์ credentials.
5. เพิ่ม `EXPO_TOKEN` ใน secret store และ copy workflow ด้วย commit ของจาวิสเอง.
6. ใช้ question-free build ด้วย `eas-cli@21.0.0`, `--non-interactive --freeze-credentials --wait --json`.
7. เก็บ JSON receipt นอก Git แล้วหยุดก่อน submission.

ตรวจ pack:

```bash
set -euo pipefail
: "${DECODE_REPO:?Create the clean disposable clone first}"
test "$(realpath -m "$DECODE_REPO")" != "/root/decode-app"
cd "$DECODE_REPO"
test -z "$(git status --porcelain --untracked-files=all)"
node scripts/test-eas-ios-handoff.mjs
npx --yes prettier@3.6.2 --check \
  handoff/mobile/eas-ios/eas.json.template.json \
  handoff/mobile/eas-ios/app-config.ios.template.json \
  handoff/mobile/eas-ios/eas-ios-build.workflow.yml \
  docs/mobile/EAS-IOS-HANDOFF.md \
  docs/mobile/EAS-IOS-OWNER-CHECKLIST.md \
  scripts/test-eas-ios-handoff.mjs
test -z "$(git status --porcelain --untracked-files=all)"
```

ผลรับงานล่าสุด:

```text
EAS_IOS_HANDOFF_OK checks=188 files=5
```

Pack ผ่าน JSON, YAML, Bash/Node syntax, Prettier, EAS 21 schema/CLI flag checks และ merge simulation กับ temporary copy ของ mobile config. `EXPO_TOKEN` ถูก scope เฉพาะสอง EAS command steps; `npm ci` ไม่เห็น token. ไม่มี submit, deploy, credential repair หรือ secret value ใน Git.

ยังไม่มีการสั่ง EAS build จริงใน goal นี้ เพราะต้องใช้บัญชี, Apple 2FA, remote credentials, UDIDs และคำอนุมัติของเจ้าของ. iOS native จึงยังเป็น `OPEN/UNPROVEN` จนจาวิสและ credential operator ทำ runbook สำเร็จ.

## 4. Working-tree safety และ recovery

- Shared `/root/decode-app` มี unrelated dirty work ได้เสมอ. ก่อนทุกคำสั่งเขียนให้ตรวจ `git status --short`; stage เฉพาะ literal task paths และหยุดหาก path เป้าหมายมีงานคนอื่นทับอยู่.
- จาวิสไม่มีขั้นตอนเขียนใน `/root/decode-app`. การทดลอง fixtures ต้องทำใน disposable clone; การรวม fixtures/config/workflow ต้องเป็น commit ของจาวิสใน mobile worktree ตามขอบเขตของเขา.
- หากจาวิสต้องย้อนการรับเข้าแอพ ให้ revert เฉพาะ mobile adoption commit ที่จาวิสสร้าง ห้าม reset shared mobile worktree และห้ามแก้ backend history.
- หาก backend owner สั่งถอน handoff pack ให้ backend operator ใช้ clean isolated checkout, ตรวจ SHA/diff แล้วสร้าง explicit `git revert` commit สำหรับ exact handoff commit ที่อนุมัติเท่านั้น. ห้าม `reset`, force-push หรือ clean shared worktree.
- ไม่มี production rollback สำหรับ goal นี้ เพราะไม่มี deploy, restart, tag, entitlement activation, submission หรือ EAS build เกิดขึ้น. Production state จึงไม่ถูกเปลี่ยน.

## 5. ข้อจำกัดที่ยังมีผล

- Entitlement foundation แช่ต่อ ห้าม deploy จนเจ้าของสั่ง.
- ห้าม deploy, restart, tag, เปลี่ยน production, EAS Update, AASA หรือ entitlement ใน handoff นี้.
- Production ทุกครั้งต้องได้รับคำเคาะจากเจ้าของก่อน.
- App Store submission, TestFlight distribution และธุรกรรมจริงเป็น goal แยก.
- ทีม backend ห้ามแก้, stage หรือ commit ใน `/root/worktrees/hourkey-mobile-p0-network-sifu`; จาวิสเป็นผู้รวม fixtures/config/workflow เข้าแอพ.
- API ชุดถัดไปไม่อยู่ใน goal นี้ ต้องรอ brief จากจาวิส.
- ห้าม commit `.p8`, `.p12`, provisioning profile, Apple password/2FA, Expo token, private key, raw production capture หรือ build receipt.

## 6. Reviewer receipts

- Fixture reviewer: 0 Critical / 0 Important / 0 Minor; full 570, privacy 131, manifestและ six sanitized sourcesตรง hash.
- EAS reviewer: 0 Critical / 0 Important / 0 Minor; checks 188, CLI/schema/JSON/YAML/Bash/formattingผ่าน,ไม่มี submit/deploy path.

หากจาวิสพบความคลาดเคลื่อนหลังรับช่วง ให้เปิดงานใหม่โดยอ้าง commit SHA, endpoint หรือ EAS step ที่ผิด และแนบ evidence จาก command ปัจจุบัน. อย่าแก้ production หรือ entitlement โดยไม่มีคำเคาะใหม่จากเจ้าของ.
