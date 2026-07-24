/**
 * เทสวงจรเชิญเพื่อน ฝั่งเครื่องแม่ข่าย (24 ก.ค. เวฟ 4)
 * รันด้วย: npx tsx scripts/test-invite-loop.mts
 *
 * ครอบ 6 ข้อที่เจ้านายสั่ง:
 *   1. โค้ดเดาไม่ได้ (สุ่มเข้ารหัส · ไม่ผูกกับ user id · ไม่ซ้ำ)
 *   2. เชิญตัวเองไม่ได้
 *   3. รับซ้ำไม่ได้
 *   4. จังหวะจ่ายยาม (ปรับ 24 ก.ค.): ยืนยันวันเกิด=ไม่จ่ายใคร · จ่ายสองฝั่งตอน "สมัครบัญชีจริง" เท่านั้น
 *   5. ชนเพดานแล้วบอกจำนวน
 *   6. ต้องกดยินยอมก่อน (ด้านกฎหมาย) + วันเกิดต้องสมเหตุสมผล
 */
import assert from "node:assert/strict";
import {
  DEFAULT_INVITE_SETTINGS,
  evaluateAcceptGuard,
  evaluateClaimGuard,
  evaluateCreateCap,
  evaluateRewardCap,
  friendRewardRef,
  generateInviteCode,
  inviteUrl,
  inviterRewardRef,
  normalizeInviteCode,
  parseInviteBirth,
  rewardsAtConfirm,
  rewardsAtSignup,
  sanitizeInviterAlias,
  type InviteRowState,
  type InviteSettings,
} from "../src/lib/invite.ts";

const S: InviteSettings = { ...DEFAULT_INVITE_SETTINGS };
const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();
let passed = 0;
function ok(label: string) { passed += 1; console.log(`  ✅ ${label}`); }

/* ── 1. โค้ดเดาไม่ได้ ─────────────────────────────────────────── */
{
  const codes = new Set<string>();
  for (let i = 0; i < 4000; i += 1) codes.add(generateInviteCode());
  assert.equal(codes.size, 4000, "โค้ด 4000 ใบต้องไม่ซ้ำกันเลย");
  ok("สุ่ม 4000 ใบ ไม่ชนกันสักใบ");

  const one = generateInviteCode();
  assert.match(one, /^[0-9A-HJKMNP-TV-Z]{14}$/, "ต้องเป็น base32 ตัดตัวสับสน 14 ตัว");
  ok("รูปแบบโค้ด 14 ตัว (≈70 บิต)");

  // ห้ามผูกกับ user id: สุ่มด้วย input เดียวกันต้องได้คนละค่า
  const a = generateInviteCode();
  const b = generateInviteCode();
  assert.notEqual(a, b, "โค้ดต้องไม่ derive จากอะไรที่คงที่");
  ok("โค้ดไม่ derive จากค่าคงที่ (เรียกซ้ำได้คนละค่า)");

  // การกระจายตัวอักษรต้องไม่กองอยู่ตัวเดียว (จับ bug modulo/บั๊กสุ่มพัง)
  const freq = new Map<string, number>();
  for (let i = 0; i < 2000; i += 1) for (const ch of generateInviteCode()) freq.set(ch, (freq.get(ch) || 0) + 1);
  assert.ok(freq.size >= 30, `ต้องใช้ตัวอักษรกระจายทั้งชุด แต่ใช้แค่ ${freq.size}`);
  ok("ตัวอักษรกระจายทั่วทั้งชุด (ไม่ใช่สุ่มพัง)");

  // ห้ามรับโค้ดสั้นๆ ที่เดาง่าย
  assert.equal(normalizeInviteCode("ABC"), null);
  assert.equal(normalizeInviteCode(""), null);
  assert.equal(normalizeInviteCode(null), null);
  assert.equal(normalizeInviteCode("ABCDEFGHIJ"), null, "ตัว I ไม่อยู่ในชุด ต้องปฏิเสธ");
  assert.equal(normalizeInviteCode("  abcdefghjk  "), "ABCDEFGHJK");
  ok("normalize ปฏิเสธโค้ดสั้น/นอกชุด และแปลงตัวใหญ่ให้");

  assert.ok(inviteUrl("ABCDEFGHJK234X", "https://hourkey.io").includes("invite=ABCDEFGHJK234X"));
  ok("ลิงก์เชิญชี้ไปหน้ารับเชิญพร้อมโค้ด");
}

/* ── 2. เชิญตัวเองไม่ได้ ───────────────────────────────────────── */
{
  const row: InviteRowState = {
    status: "pending", expires_at: future,
    inviter_user_id: "user-A", friend_user_id: null, accepted_at: null,
  };
  assert.deepEqual(evaluateAcceptGuard(row, "user-A"), { ok: false, error: "self_invite" });
  ok("คนเชิญเปิดลิงก์ตัวเองแล้วกรอก = ถูกปฏิเสธ (ชั้นรับเชิญ)");

  assert.deepEqual(
    evaluateClaimGuard({ ...row, status: "confirmed", accepted_at: new Date().toISOString(), friend_reward_hours: 0 }, "user-A", false),
    { ok: false, error: "self_invite" },
  );
  ok("คนเชิญกดรับยามฝั่งเพื่อนเอง = ถูกปฏิเสธ (ชั้นรับยาม)");

  assert.deepEqual(evaluateAcceptGuard(row, "user-B"), { ok: true });
  ok("คนอื่นรับเชิญได้ตามปกติ");
}

/* ── 3. รับซ้ำไม่ได้ ───────────────────────────────────────────── */
{
  const used: InviteRowState = {
    status: "confirmed", expires_at: future,
    inviter_user_id: "user-A", friend_user_id: "user-B", accepted_at: new Date().toISOString(),
  };
  assert.deepEqual(evaluateAcceptGuard(used, null), { ok: false, error: "already_accepted" });
  ok("คำเชิญที่ยืนยันแล้ว กรอกซ้ำไม่ได้");

  const pendingButAccepted: InviteRowState = { ...used, status: "pending" };
  assert.deepEqual(evaluateAcceptGuard(pendingButAccepted, null), { ok: false, error: "already_accepted" });
  ok("มี accepted_at แล้วถือว่ารับไปแล้ว แม้สถานะยังค้าง pending");

  assert.deepEqual(
    evaluateClaimGuard({ ...used, friend_reward_hours: 3 }, "user-B", false),
    { ok: false, error: "already_claimed" },
  );
  ok("เพื่อนคนเดิมกดรับยามซ้ำไม่ได้");

  assert.deepEqual(
    evaluateClaimGuard({ ...used, friend_reward_hours: 0 }, "user-C", false),
    { ok: false, error: "already_claimed" },
  );
  ok("คนอื่นมาสวมรับยามของคำเชิญที่มีเจ้าของแล้วไม่ได้");

  assert.deepEqual(
    evaluateClaimGuard({ ...used, friend_user_id: null, friend_reward_hours: 0 }, "user-C", true),
    { ok: false, error: "friend_already_invited" },
  );
  ok("1 บัญชี รับเชิญได้ครั้งเดียวตลอดกาล");

  assert.deepEqual(evaluateAcceptGuard({ ...used, status: "revoked", accepted_at: null }, null), { ok: false, error: "invite_revoked" });
  assert.deepEqual(evaluateAcceptGuard({ ...used, status: "pending", accepted_at: null, expires_at: past }, null), { ok: false, error: "invite_expired" });
  assert.deepEqual(evaluateAcceptGuard(null, null), { ok: false, error: "invite_not_found" });
  ok("ยกเลิก/หมดอายุ/ไม่มีจริง ถูกปฏิเสธครบ");
}

/* ── 4. จังหวะจ่ายยาม: ยืนยันวันเกิด=ไม่จ่ายใคร · จ่ายตอน "สมัครบัญชีจริง" ── */
{
  const base = { expires_at: future, inviter_user_id: "user-A", friend_user_id: null, accepted_at: null, friend_reward_hours: 0 };

  // (ก) เฟส "ยืนยันวันเกิด" ยังไม่จ่ายยามใครทั้งสิ้น — กฎใหม่ที่เจ้านายเคาะ
  assert.deepEqual(rewardsAtConfirm(), { inviter: false, friend: false });
  ok("เพื่อนยืนยันวันเกิดแล้ว → ยังไม่จ่ายยามใคร (คนเชิญก็ยังไม่ได้)");

  // (ข) เฟส "สมัครบัญชีจริง" จ่ายทั้งสองฝั่ง
  assert.deepEqual(rewardsAtSignup([]), { inviter: true, friend: true });
  ok("เพื่อนสมัครบัญชีจริง → จ่ายยามทั้งสองฝั่ง");

  // (ค) สมัครแต่ยืนยันด้วยอุปกรณ์เดียวกับคนเชิญ → เพื่อนได้ แต่คนเชิญไม่ได้ (กันปั่น)
  assert.deepEqual(rewardsAtSignup(["same_device_as_inviter"]), { inviter: false, friend: true });
  ok("อุปกรณ์เดียวกับคนเชิญ → คนเชิญไม่ได้ยาม (กันเชิญตัวเอง)");

  // (ง) ด่าน claim: ต้อง confirmed ก่อน (แค่ pending/revoked จ่ายไม่ได้)
  assert.deepEqual(evaluateClaimGuard({ ...base, status: "pending" }, "user-B", false), { ok: false, error: "not_confirmed" });
  assert.deepEqual(evaluateClaimGuard({ ...base, status: "revoked" }, "user-B", false), { ok: false, error: "not_confirmed" });
  ok("แค่ส่งลิงก์/ยกเลิก (ยังไม่ยืนยันวันเกิด) จ่ายยามไม่ได้");

  // (จ) เพื่อนไม่สมัครเลย = คำเชิญค้างที่ confirmed · ไม่มี friend_user_id · ไม่มีใครได้ยาม
  //     (ผ่านด่านได้=พร้อมจ่าย แต่จะจ่ายก็ต่อเมื่อมี user มา claim ตอน signup เท่านั้น)
  assert.deepEqual(
    evaluateClaimGuard({ ...base, status: "confirmed", accepted_at: new Date().toISOString() }, "user-B", false),
    { ok: true },
  );
  ok("ยืนยันแล้วแต่ยังไม่มีใครสมัคร = พร้อมจ่าย รอ user มา claim ตอน signup");

  // (ฉ) จ่ายไปแล้ว (status=rewarded, friend ผูกแล้ว) → สมัคร/claim ซ้ำไม่ได้
  assert.deepEqual(
    evaluateClaimGuard(
      { ...base, status: "rewarded", friend_user_id: "user-B", accepted_at: new Date().toISOString(), friend_reward_hours: 3 },
      "user-B",
      false,
    ),
    { ok: false, error: "already_claimed" },
  );
  ok("จ่ายยามไปแล้ว (rewarded) รับซ้ำไม่ได้ (idempotent)");

  // กุญแจกันจ่ายซ้ำระดับ DB ต้องแยกฝั่ง และผูกกับใบเชิญใบนั้น
  const id = "11111111-2222-4333-8444-555555555555";
  assert.equal(inviterRewardRef(id), `invite:${id}:inviter`);
  assert.equal(friendRewardRef(id), `invite:${id}:friend`);
  assert.notEqual(inviterRewardRef(id), friendRewardRef(id));
  ok("กุญแจกันจ่ายซ้ำ (ref_payment_id) แยกสองฝั่ง + ผูกกับใบเชิญ");
}

/* ── 5. ชนเพดานแล้วบอกจำนวน ───────────────────────────────────── */
{
  const under = evaluateCreateCap(3, S);
  assert.equal(under.ok, true);
  assert.equal(under.remaining, S.daily_create_max - 3);
  ok(`ยังไม่ชนเพดาน บอกเหลืออีก ${under.remaining} ลิงก์`);

  const hit = evaluateCreateCap(S.daily_create_max, S);
  assert.equal(hit.ok, false);
  assert.equal(hit.reason, "daily_cap");
  assert.equal(hit.used, S.daily_create_max);
  assert.equal(hit.limit, S.daily_create_max);
  assert.equal(hit.remaining, 0);
  ok(`ชนเพดานสร้างลิงก์ บอกครบทั้ง used=${hit.used} limit=${hit.limit} remaining=0`);

  const over = evaluateCreateCap(S.daily_create_max + 7, S);
  assert.equal(over.ok, false);
  assert.equal(over.remaining, 0);
  ok("เกินเพดานไปแล้วก็ยังบอกจำนวน ไม่ติดลบ");

  const rewardDaily = evaluateRewardCap(S.daily_reward_max, 0, S);
  assert.equal(rewardDaily.ok, false);
  assert.equal(rewardDaily.reason, "daily_cap");
  assert.equal(rewardDaily.limit, S.daily_reward_max);
  ok(`ชนเพดานจ่ายยามต่อวัน (${S.daily_reward_max}) บอกจำนวน`);

  const rewardLife = evaluateRewardCap(0, S.lifetime_reward_max, S);
  assert.equal(rewardLife.ok, false);
  assert.equal(rewardLife.reason, "lifetime_cap");
  assert.equal(rewardLife.limit, S.lifetime_reward_max);
  ok(`ชนเพดานจ่ายยามตลอดกาล (${S.lifetime_reward_max}) บอกจำนวน`);

  assert.equal(evaluateRewardCap(0, 0, S).ok, true);
  ok("ยังไม่ชนเพดาน จ่ายยามได้");
}

/* ── 6. ยินยอม + วันเกิดสมเหตุสมผล ───────────────────────────── */
{
  const good = { birth_date: "1984-12-31", birth_time: "13:15", gender: "M", consent: true };
  const r = parseInviteBirth(good);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.value.timeKnown, true);
  assert.equal(r.ok && r.value.gmtOffsetHours, 7);
  ok("วันเกิดครบถ้วน + ยินยอม = ผ่าน (4 เสา)");

  assert.deepEqual(parseInviteBirth({ ...good, consent: undefined }), { ok: false, error: "consent_required" });
  assert.deepEqual(parseInviteBirth({ ...good, consent: false }), { ok: false, error: "consent_required" });
  ok("ไม่กดยินยอม = ปฏิเสธ (ด้านกฎหมาย)");

  const noTime = parseInviteBirth({ birth_date: "1984-12-31", consent: true });
  assert.equal(noTime.ok && noTime.value.timeKnown, false);
  ok("ไม่รู้เวลาเกิดก็ยังผ่าน (อ่านแบบ 3 เสา)");

  assert.deepEqual(parseInviteBirth({ consent: true }), { ok: false, error: "birth_date_required" });
  assert.deepEqual(parseInviteBirth({ birth_date: "1984-02-31", consent: true }), { ok: false, error: "birth_date_invalid" });
  assert.deepEqual(parseInviteBirth({ birth_date: "1899-01-01", consent: true }), { ok: false, error: "birth_date_out_of_range" });
  assert.deepEqual(parseInviteBirth({ birth_date: "2999-01-01", consent: true }), { ok: false, error: "birth_date_out_of_range" });
  assert.deepEqual(parseInviteBirth({ birth_date: "1984-12-31", birth_time: "99:99", consent: true }), { ok: false, error: "birth_time_invalid" });
  ok("วันเกิดพัง/อนาคต/เวลาพัง ถูกปฏิเสธครบ");

  const tz = parseInviteBirth({ birth_date: "1990-05-05", birth_tz_offset: 99, consent: true });
  assert.equal(tz.ok && tz.value.gmtOffsetHours, 7, "เขตเวลานอกช่วง ต้องตกกลับ +7");
  ok("เขตเวลานอกช่วงตกกลับค่าปลอดภัย");

  // ชื่อเล่น: ห้ามอีเมล ห้ามอักขระควบคุม/แท็ก
  assert.equal(sanitizeInviterAlias("boss@example.com"), null);
  const tagStripped = sanitizeInviterAlias("<script>x</script>") || "";
  assert.ok(!/[<>]/.test(tagStripped), `ต้องไม่เหลือ < > แต่ได้ ${tagStripped}`);
  assert.equal(sanitizeInviterAlias("a bc"), "abc");
  assert.equal(sanitizeInviterAlias("   "), null);
  assert.equal(sanitizeInviterAlias("พี่หนึ่ง"), "พี่หนึ่ง");
  assert.equal((sanitizeInviterAlias("ก".repeat(80)) || "").length, 40);
  ok("ชื่อเล่นที่โชว์: กันอีเมล กันแท็ก ตัดความยาว");
}

console.log(`\n[invite loop · server] ${passed}/${passed} passed`);
