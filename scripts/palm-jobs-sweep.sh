#!/bin/bash
# palm-jobs-sweep.sh · ล้างรูปฝ่ามือ (biometric) ค้าง + reconcile job ค้าง + TTL palm_jobs
# เหตุ: async job (r479) · ถ้า process ตาย/OOM หรือ user ปิดแอปไม่ poll ต่อ → รูปค้าง /var/tmp + row running ค้าง
# ไม่มี cron ล้าง = ดิสก์เต็มช้าๆ + รูป biometric ค้างถาวร (ขัดคำโฆษณา "ลบทันที")
# ตั้ง cron รายชั่วโมง · path ถาวร (ไม่อยู่ใน release ที่เปลี่ยนตอน cut)
set -u
JOBS_ROOT="/var/tmp/palm-jobs"
LOG="/var/log/palm-jobs-sweep.log"
TS="$(date '+%Y-%m-%d %H:%M:%S')"

# 1) ลบโฟลเดอร์รูปเก่ากว่า 60 นาที (orphan จาก process ตาย / ไม่ poll ต่อ)
DIRS=0
if [ -d "$JOBS_ROOT" ]; then
  DIRS=$(find "$JOBS_ROOT" -mindepth 1 -maxdepth 1 -type d -mmin +60 2>/dev/null | wc -l)
  find "$JOBS_ROOT" -mindepth 1 -maxdepth 1 -type d -mmin +60 -exec rm -rf {} + 2>/dev/null
fi

# 2) DB: route poll performs billing-safe reconciliation. Sweeper only expires
# old rows; never mark a reserved job error here because that would skip refund.
SQL="DELETE FROM palm_jobs
       WHERE created_at < now() - interval '7 day'
         AND billing_status IN ('settled','refunded','legacy');"
DBOUT=$(docker exec -i decode-postgres psql -U decode_user -d decode_db -tc "$SQL" 2>&1 | tr '\n' ' ')

echo "$TS · dirs_removed=$DIRS · db=[$DBOUT]" >> "$LOG"
