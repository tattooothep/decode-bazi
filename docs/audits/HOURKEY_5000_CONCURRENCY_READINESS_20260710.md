# Hourkey 5,000 Concurrent User Readiness

วันที่ตรวจ: 2026-07-10 (Asia/Bangkok)

Baseline: `r481-live-baseline-20260710` / commit `39d83ba`

## ขอบเขต

รายงานนี้ตีความเป้าหมายเป็นผู้ใช้ 5,000 คนที่ออนไลน์พร้อมกัน ไม่ใช่สมาชิกสะสม
5,000 คน โดยตรวจ source ของ release live, runtime topology, nginx, systemd,
PostgreSQL, Redis, logs, security, backup, monitoring และ benchmark บน Next.js
instance แยกจาก production

ไม่ได้ยิง load test ใส่ production และไม่ได้เขียนฐานข้อมูล production

## สรุป

สถานะรวม: **ยังไม่พร้อมสำหรับ 5,000 concurrent users ที่ใช้ทุกฟีเจอร์**

ระบบปัจจุบันมีพื้นฐานที่ดีสำหรับ traffic ระดับปัจจุบันและหน้า static จำนวนมาก แต่ยัง
ไม่มี capacity, fault isolation และ operational controls เพียงพอสำหรับ 5,000 คนที่
เรียก compute, database และ AI พร้อมกัน

| มิติ | คะแนน | สถานะ |
|---|---:|---|
| เครื่องและระบบปฏิบัติการ | 3/5 | มีทรัพยากรเหลือ แต่เป็น single host และไม่มี swap/resource caps |
| nginx และ web cluster | 3/5 | 4 instances + least_conn แต่ไม่มี CDN/active health check |
| Static/content delivery | 2/5 | `_next` cache ดี แต่ public assets/video เป็น `max-age=0` และผ่าน Next |
| Compute APIs | 2/5 | endpoint เบาผ่านระดับหนึ่ง แต่ latency เกินเป้าเมื่อ concurrency สูง |
| AI/Sifu/Fusion | 1/5 | 6 inflight + queue 60, synchronous 600-1300s, single AI instance |
| PostgreSQL | 2/5 | ข้อมูลยังเล็ก แต่ไม่มี HA, timeout, pooler, query insights และ index บางส่วน |
| Redis/cache/rate limit | 1/5 | Redis เปิดอยู่แต่แอปไม่ใช้, state สำคัญอยู่ใน memory ต่อ process |
| Security | 2/5 | TLS/firewall/edge limits ดี แต่ production dependencies มี high advisories |
| Monitoring/alerting | 1/5 | มี access timing logs แต่ cron uptime monitor พังและไม่มี metrics/APM |
| Backup/DR | 1/5 | backup อัตโนมัติสำรอง source เท่านั้น ไม่ได้สำรอง PostgreSQL |
| Deployment/rollback | 2/5 | release symlink และ systemd ดี แต่ยังไม่มี rolling/canary/automated gate |

## Runtime ที่ตรวจพบ

- Server: 8 vCPU, RAM 31 GiB, available ประมาณ 23 GiB
- ไม่มี swap
- Disk: 387 GiB, ใช้ 63%, ว่างประมาณ 145 GiB
- nginx: 8 workers โดยประมาณ, `worker_connections 4096`
- Next.js: 4 processes ที่ ports 3349-3352
- nginx upstream: `least_conn`
- PostgreSQL 16.13: single Docker container, database 114 MB
- Redis 7.4.8: single Docker container, 0 keys, แอปยังไม่ใช้
- ทุก component หลักอยู่บน host เดียว จึงยังมี single-host failure domain

## Benchmark

ทดสอบกับ production build เดียวกับ baseline บน `127.0.0.1:3360` ไม่ผ่าน nginx
และไม่ใช่ production process ตัวเลขจึงเป็น best-case ของ application server ไม่ใช่
ใบรับรอง capacity ของระบบจริง

| Scenario | Concurrency | Requests | Failed | Throughput | p95 |
|---|---:|---:|---:|---:|---:|
| Static `pricing.html` | 100 | 10,000 | 0 | 3,759 req/s | 37 ms |
| Static `pricing.html` | 500 | 20,000 | 0 | 3,769 req/s | 151 ms |
| Static `pricing.html` | 1,000 | 20,000 | 0 | 2,841 req/s | 389 ms |
| Static `pricing.html` | 1,250 | 25,000 | 0 | 2,835 req/s | 493 ms |
| Compute `/api/today` | 100 | 5,000 | 0 | 625 req/s | 201 ms |
| Compute `/api/today` | 500 | 10,000 | 0 | 763 req/s | 696 ms |
| Compute `/api/fengshui-snapshot` | 50 | 2,000 | 0 | 569 req/s | 103 ms |

ข้อสรุปจาก benchmark:

- Static บน process เดียวเริ่มแตะเพดานเป้า p95 500ms ที่ concurrency 1,250
- การคูณผลด้วย 4 processes ตรง ๆ ทำไม่ได้ เพราะทุก process แบ่ง CPU, disk และ network
  ของ host เดียวกัน
- Compute API เกิน p95 500ms ตั้งแต่ concurrency 500 บน process เดียว
- ยังไม่ได้ทดสอบ traffic mix ที่มี auth, DB writes, payment, upload, export และ AI

## Live Latency

จาก nginx API logs ปัจจุบันและไฟล์ก่อนหน้า รวม 1,990 requests:

- Overall p50: 15 ms
- Overall p95: 751 ms
- Overall p99: 5.725 s
- Maximum: 114.661 s
- `/api/chart` p50: 799 ms, p95: 7.330 s
- `/api/today` p50: 490 ms, p95: 589 ms
- `/api/auth/login` p50: 343 ms, p95: 382 ms

Traffic sample ปัจจุบันยังต่ำมากเมื่อเทียบกับ 5,000 concurrent users จึงใช้ยืนยัน
ความพร้อมระดับเป้าหมายไม่ได้

## P0 Blockers

### 1. AI capacity และ architecture

- nginx ส่ง AI routes ทั้งหมดไป port 3349 ตัวเดียว
- Sifu semaphore เป็น memory ต่อ process
- Default capacity คือ 6 inflight และ queue 60
- Request timeout ยาว 600-1300 วินาที
- มีการ spawn Claude/Codex/Grok CLI จาก web request
- Queue ไม่ durable และไม่แชร์ผ่าน Redis

ที่ 5,000 AI requests พร้อมกัน capacity นี้รองรับได้เพียงส่วนน้อย ต้องเปลี่ยนเป็น
durable job queue + worker pool + provider API quotas + status/poll/SSE ที่แยกจาก web
process ก่อน

### 2. ไม่มี automated database backup

`/root/backup-decode.sh` สำรอง `/root/decode-app` และส่ง R2 ทุกคืน แต่ไม่มี
`pg_dump`, WAL archive หรือ snapshot ของ PostgreSQL volume การสำรอง DB ที่พบเป็น
manual snapshots ตามงาน และไม่มี restore drill ที่ยืนยันแล้ว

ต้องมีอย่างน้อย daily encrypted DB backup, off-host retention, restore test และ RPO/RTO
ที่ระบุชัด ก่อนเพิ่ม traffic

### 3. Monitoring cron พัง

crontab เรียก `/root/decode-app/scripts/monitor/uptime-check.mjs` ทุก 5 นาที แต่ไฟล์
ไม่มีอยู่จริง log จึงเป็น `MODULE_NOT_FOUND` ต่อเนื่อง ไม่มี alert ที่เชื่อถือได้เมื่อ
web, DB, AI หรือ payment ล้ม

### 4. Shared state ยังไม่พร้อม horizontal scale

- Rate limiter เป็น `Map` ใน memory ต่อ process
- Yongshen/dictionary/settings caches อยู่ใน memory ต่อ process
- AI semaphore/queue อยู่ใน memory ของ port 3349
- Redis เปิดอยู่แต่มี 0 keys และ source ไม่มี Redis client
- Mobile uploads ใช้ local disk จึงไม่พร้อมขยายข้ามหลาย host

ต้องย้าย rate limit, shared cache, idempotency/locks และ queue ไป Redis หรือบริการที่
เทียบเท่า และย้าย uploads/assets ไป shared object storage

### 5. Production dependency advisories

`npm audit --omit=dev` พบ 9 vulnerabilities:

- High: 2
- Moderate: 6
- Low: 1
- Direct high dependency: Next.js 16.2.4

ต้องอัปเกรดและรัน regression/security tests ก่อน campaign หรือ public scale event

### 6. Static delivery ไม่มี CDN

- `public/` ประมาณ 110 MB
- วิดีโอรายไฟล์สูงสุดประมาณ 7.3 MB
- Public images/videos ตอบ `Cache-Control: public, max-age=0`
- หน้า HTML หลักตอบ `no-store`
- Static ผ่าน Next.js แล้ว nginx proxy อีกชั้น
- nginx logs พบ response ใหญ่ถูก buffer ลง temporary files

ต้องย้าย immutable assets/video ไป CDN/object storage, ตั้ง versioned cache 1 ปี และ
กำหนด cache policy สำหรับ public HTML ที่ไม่ปนข้อมูลส่วนตัว

## PostgreSQL Findings

- App pool: max 10 ต่อ process, รวมสูงสุดประมาณ 40 connections สำหรับ 4 processes
- PostgreSQL `max_connections=100`
- `statement_timeout=0`
- `idle_in_transaction_session_timeout=0`
- ไม่มี PgBouncer
- ไม่มี `pg_stat_statements`
- ไม่มี slow-query logging (`log_min_duration_statement=-1`)
- พบ foreign keys 48 รายการที่ไม่มี supporting index ตาม prefix
- Login ใช้ `lower(email)` แต่มีเฉพาะ index บน `email`; query plan เป็น sequential scan
- DB container ไม่มี CPU/memory limit และไม่มี replica

ข้อดี:

- Database ปัจจุบันเล็ก 114 MB
- Cache hit ratio ปัจจุบันสูง
- ไม่พบ deadlock หรือ invalid index
- Hot profile query ใช้ index ได้
- Payment credit path ใช้ transaction, row lock และ idempotency guards

## Security Findings

ข้อดี:

- TLS, HSTS, CSP, X-Frame-Options และ X-Content-Type-Options เปิดใช้งาน
- UFW default deny incoming
- PostgreSQL/Redis bind เฉพาะ localhost
- nginx มี rate limits แยก AI/compute/auth/API
- Sensitive backup extensions และ hidden paths ถูกปิดที่ nginx

ความเสี่ยง:

- App-level rate limit ไม่แชร์ข้าม 4 processes
- Next.js มี direct high advisories จาก npm audit
- Ports 8090 และ 8443 เปิด public ต้องยืนยันความจำเป็นและเจ้าของระบบ
- ไม่มี WAF/CDN/DDoS absorption layer ที่ตรวจพบ
- ไม่มี dependency/security gate ใน release flow ที่พิสูจน์ได้

## Observability Findings

ข้อดี:

- nginx API log มี request time, upstream time, upstream address และ limit status
- systemd restart policy เปิดทุก Next process
- Docker health check มีสำหรับ PostgreSQL และ decode-api

สิ่งที่ขาด:

- uptime cron ใช้งานไม่ได้
- ไม่มี Prometheus/Grafana/APM/Sentry ที่ตรวจพบสำหรับ Hourkey
- ไม่มี alert จาก p95, error rate, DB pool wait, queue depth หรือ provider quota
- `/api/health` ตรวจ engine และ qimen แต่ไม่ตรวจ PostgreSQL, disk, queue, provider หรือ
  readiness ของ instance
- ไม่มี nginx status endpoint/dashboard ที่ใช้งานจริง

## Deployment และ Failure Domain

- มี release directory, symlink rollback และ systemd services
- มี web cluster 4 processes แต่ทั้งหมดอยู่ host เดียว
- Port 3349 ใช้ service ชื่อ `hourkey-decode.service`; 3350-3352 ใช้ template services
- มี template instance 3349 ซ้ำที่ inactive ทำให้เคยเกิด restart loop จาก EADDRINUSE
- ไม่มี rolling deployment health gate หรือ canary ที่ตรวจพบ
- ไม่มี second host, DB replica หรือ automatic failover
- systemd/Docker ไม่มี memory/CPU caps; workload หนึ่งสามารถแย่งทรัพยากรทั้ง host

## Acceptance Gates สำหรับ 5,000 Concurrent Users

ห้ามประกาศพร้อมจนผ่านทุกข้อ:

1. ทดสอบ traffic mix 5,000 virtual users ใน staging ที่ topology ใกล้ production
2. Public/static p95 < 500ms และ error rate < 0.5%
3. Auth/read APIs p95 < 500ms และ DB pool wait ไม่สะสม
4. Compute APIs มี per-route SLO และไม่ block event loop
5. AI เปลี่ยนเป็น durable async queue พร้อม backpressure และ capacity plan
6. Redis/shared state ผ่าน failover/restart test
7. DB backup restore สำเร็จและมี RPO/RTO
8. ไม่มี high/critical production dependency advisory ที่ยังไม่ได้ยอมรับความเสี่ยง
9. Alerting ตรวจ web, DB, queue, AI provider, payment, disk และ certificate
10. Rolling deploy และ rollback drill ผ่านโดยไม่มี downtime

## ลำดับดำเนินการ

### Phase P0 - ป้องกันข้อมูลและ outage

1. ทำ automated PostgreSQL backup + restore drill
2. ซ่อม uptime monitor และเพิ่ม external alert
3. อัปเกรด Next.js/production dependencies
4. ใส่ DB statement/idle transaction timeouts และเปิด query observability
5. เพิ่ม index `lower(email)` และ audit supporting indexes ตาม query จริง

### Phase P1 - ลดโหลดและแชร์ state

1. ต่อ Redis ให้ rate limit, cache, queue และ locks
2. ย้าย videos/public immutable assets ไป CDN/object storage
3. เปลี่ยน public asset cache policy เป็น versioned immutable
4. ลด API fan-out ต่อ page และ cache session/account reads ที่ปลอดภัย
5. แยก file uploads และ PDF/export jobs ออกจาก web process

### Phase P2 - Scale architecture

1. แยก AI workers และ durable queue ออกจาก Next.js
2. ใช้ PgBouncer และ capacity-test pool/queries
3. แยก second application host หรือ container scheduler
4. ใช้ managed/replicated PostgreSQL พร้อม failover
5. เพิ่ม rolling/canary deployment และ automated health gates

### Phase P3 - Prove 5,000

1. สร้าง anonymized staging dataset และ realistic user journeys
2. Warm-up, ramp, steady-state และ spike tests
3. วัด p50/p95/p99, errors, saturation, queue depth, DB waits และ cost
4. ทดสอบ failure injection: kill app, Redis, DB failover, provider 429 และ disk pressure
5. เก็บ signed capacity report ก่อนเปิด campaign

## Final Decision

**NO-GO สำหรับ 5,000 concurrent users แบบ full-feature ณ วันที่ตรวจ**

หน้า static มี performance พื้นฐานที่ดี แต่ไม่มี headroom/CDN ที่พิสูจน์แล้ว ส่วน compute,
database operations, AI, shared state, monitoring และ disaster recovery ยังมี P0 blockers
ต้องแก้และผ่าน load test แบบ traffic mix ก่อน
