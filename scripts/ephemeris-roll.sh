#!/bin/bash
# ephemeris-roll.sh · 5 ก.ค. 2026 (r412 datepick fix)
# Cron รายวัน 03:20 (เลี่ยงชน backup ตี 2-3): เติม aj_ephemeris_cache แบบ catch-up
# จาก max(date)+1 ใน DB → วันนี้+365 · ใช้ build-ephemeris.cjs (UPSERT · qimen กลางยาม 9 วัง)
# Log: /var/log/ephemeris-roll.log
set -u
cd /root/decode-app || exit 1

TS() { date '+%Y-%m-%d %H:%M:%S'; }
echo "[$(TS)] ── ephemeris-roll start ──"

# 1) หา max(date) ใน cache
MAXDATE=$(docker exec decode-postgres psql -U decode_user -d decode_db -A -t \
  -c "SELECT COALESCE(max(date), CURRENT_DATE - 1) FROM aj_ephemeris_cache;" 2>&1)
if ! [[ "$MAXDATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "[$(TS)] ERROR: อ่าน max(date) ไม่ได้: $MAXDATE"
  exit 1
fi

# 2) เป้าหมาย = วันนี้ + 365 (คำนวณเป็น UTC ให้ตรงกับ build-ephemeris.cjs)
TARGET=$(date -u -d "+365 days" '+%Y-%m-%d')
FROM=$(date -u -d "$MAXDATE + 1 day" '+%Y-%m-%d')

if [[ "$FROM" > "$TARGET" ]]; then
  echo "[$(TS)] cache เต็มถึง $MAXDATE (เป้า $TARGET) — ไม่ต้องเติม"
  exit 0
fi

DAYS=$(( ( $(date -u -d "$TARGET" +%s) - $(date -u -d "$FROM" +%s) ) / 86400 + 1 ))
echo "[$(TS)] เติม $FROM → $TARGET ($DAYS วัน · $((DAYS*12)) slots)"

# 3) เช็ค qimen-api ก่อนยิง — ถ้าตาย ห้ามรัน (กัน status error ทั้ง batch)
if ! curl -sf -o /dev/null --max-time 5 http://localhost:4090/healthz; then
  echo "[$(TS)] ERROR: qimen-api (:4090) ไม่ตอบ — ยกเลิกรอบนี้ (รอ cron รอบถัดไป)"
  exit 1
fi

# 4) รันจริง
/usr/bin/node scripts/build-ephemeris.cjs --days "$DAYS" --from "$FROM"
RC=$?
if [[ $RC -ne 0 ]]; then
  echo "[$(TS)] ERROR: build-ephemeris exit=$RC (มี slot ล้มเหลว — ดู log ด้านบน)"
  exit $RC
fi

echo "[$(TS)] ── ephemeris-roll done ──"
