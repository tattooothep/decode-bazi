# r2d — Uranian Canon: เจาะสถาบันเยอรมันโดยตรง (DEDICATED German-institution deep dive)

> วันที่ค้น: 2026-07-03 · ผู้ค้น: r2d agent (hourkey.io astro-canon)
> โจทย์เจ้านาย: "ทำไมไม่หาที่เยอรมันโดยตรง" — เจาะหอสมุด/สถาบันเยอรมันเฉพาะทาง
> เป้า: ต้นฉบับเยอรมัน Alfred Witte ≤1935 (Regelwerk ฉบับแรก หรือบทความในวารสาร) เป็นสแกน/ข้อความ PD
> ⚠️ Witte เกิด 02.03.1878 ตาย 04.08.1941 → PD ใน EU/DE ตั้งแต่ 1 ม.ค. 2012 (life+70)

---

## บทสรุปตรง (TL;DR)

1. **บทความวารสาร Witte 1913–1925 (47 ชิ้น) = ได้ครบแล้ว** จากรอบก่อน (r2a/r2c ดึงจาก astrax.de)
   — สถาบันเยอรมันเฉพาะทางที่เผยแพร่ของ PD จริง = **astrax.de / Kulturgut Astrologie e.V. (Freiburg)** ไม่ใช่หอสมุดรัฐ
2. **หอสมุดรัฐเยอรมัน/ออสเตรีย ทุกแห่งที่เจาะรอบนี้ = ไม่มี digitalisat เปิดออนไลน์** ของทั้ง Regelwerk (หนังสือ) และวารสาร 2 ฉบับ
   — SBB Berlin digital, SUB Hamburg, MDZ, DDB, Europeana, ANNO, EOD/books2ebooks, ZDB → มีแต่ **catalog/metadata** เข้าถึงตัวเล่มออนไลน์ไม่ได้
3. **Regelwerk für Planetenbilder ฉบับ ≤1935 (หนังสือ) = ยังไม่ถูก digitize ที่ไหนเลย** แต่ **มีตัวเล่มจริง** ทั้งในหอสมุดชาติ (DNB) และร้านโบราณ (ZVAB €29.50)
4. **เส้นทางสะอาดที่สุดเพื่อได้สแกนหนังสือ = สั่งสแกนจาก DNB (Digitalisierungsservice on Demand)** — งาน PD ได้ digitalisat ฟรี + PDF เต็มเล่ม → ดู `r2d-request-guide.md`
5. **ไม่ได้ดาวน์โหลดไฟล์ใหม่ในรอบนี้** (ไม่มี PD scan ของหนังสือให้โหลด · วารสารมีครบแล้วจากรอบก่อน) — ไม่มี r2d-src-*

---

## หลักฐานจาก catalog หอสมุดชาติเยอรมัน (DNB SRU API — machine-readable, เชื่อถือได้)

**Endpoint:** `https://services.dnb.de/sru/dnb` และ `.../sru/zdb` (ดึง 2026-07-03)

### ฉบับ Regelwerk für Planetenbilder ที่ DNB ถือครองจริง (ตามลำดับปี)
verbatim ชื่อจาก catalog (ห้ามแก้):

| ปี | รายการ (verbatim) | สถานะ PD |
|---|---|---|
| **1929** | *Regelwerk für Planetenbilder : [Die Astrologie von morgen] / Alfred Witte. Mit e. Einf. von Ludwig Rudolph* — Witte-Verlag, Hamburg 22, Flotowstr. 37 | ✅ เนื้อ Witte = PD (⚠️ Einf. Rudolph ยังไม่ PD ถึง 2053) |
| **1932** | *Regelwerk für Planetenbilder : [Die Astrologie von morgen] / Alfred Witte. Mit e. Einf. von Ludwig Rudolph* — Witte Verlag, Hamburg 22, Flotowstr. 37 (2. verb. Aufl., 407 S.) | ✅ เช่นเดียวกัน |
| **1935** | *Regelwerk für Planetenbilder : [Die Astrologie von morgen] / Alfred Witte. Bearb. u. hrsg. von Ludwig Rudolph* — Witte-Verlag, Hamburg | ✅ เช่นเดียวกัน |
| **1935** | *Immerwährende Ephemeride für Mondknoten, Uranus, Neptun, Cupido, Hades, Zeus u. Kronos ... / **Alfred Witte*** — Witte-Verlag, Hamburg | ✅✅ **Witte เขียนคนเดียว = PD 100%** (ไม่มี Rudolph) |

**ฉบับที่ต้องทิ้ง (มีลิขสิทธิ์ — Lefeldt/Sieggrün/Rudolph/Sporner/Knupfer/Feist):**
- 1957 *Lexikon für Planetenbilder* (Schnitzler/Lefeldt) · 1959 ฉบับ 5 (เพิ่ม Pluto + Apollon/Admetos/Vulkanus/Poseidon โดย Lefeldt/Sieggrün) · 1974 *Rules for planetary-pictures* (Witte-Lefeldt, transl. Knupfer) · 1977 (Sporner) · 2012/2014/2015/2016/2018/2020 ฉบับพิมพ์ซ้ำ+แปล (มีคำนำ/แปลใหม่ = ลิขสิทธิ์)
- ⚠️ **แยกให้ขาด:** ฉบับ ≥1946 ทั้งหมด = ไม่ PD

### วารสารต้นฉบับ (ยืนยันจาก ZDB)
| วารสาร (verbatim) | ช่วงปี | หมายเหตุ |
|---|---|---|
| *Astrologische Rundschau : Zeitschr. für astrolog. Forschung* | **1910–1937** | บทความ Witte 1913–1925 อยู่ในนี้ (มีสแกนแล้วจาก astrax.de) |
| *Astrologische Blätter : Monatsschr. ... Organ d. Berliner u. Hamburger Astrologischen Gesellschaft* | **1914–1927** | บทความ Witte 1923–1925 อยู่ในนี้ (มีสแกนแล้ว) |

→ ทั้งสองอยู่ใน public domain (บทความ Witte) แต่ **หอสมุดยังไม่เปิด digitalisat ออนไลน์** — ที่ได้มาแล้วมาจาก astrax.de (ห้องสมุดสมาคม)

---

## Log สถาบันเยอรมัน/ออสเตรียที่เจาะรอบนี้ (ผลจริงแต่ละแห่ง)

| # | สถาบัน | สิ่งที่ทำ | ผล |
|---|---|---|---|
| 1 | **Staatsbibliothek zu Berlin — digital.staatsbibliothek-berlin.de** | ค้น "Planetenbilder Witte", "Astrologische Rundschau" | ❌ ไม่มี digitalisat ของ Witte/วารสารโหราฯ (สตริง "witte" ที่เจอเป็น nav ไม่ใช่ผลค้น) |
| 2 | **SBB — ZEFYS (หนังสือพิมพ์ประวัติศาสตร์)** | ตรวจว่ามีวารสารโหราฯ ไหม | ❌ ไม่ครอบคลุมวารสารโหราฯ ต้นศตวรรษ 20 |
| 3 | **SUB Hamburg — katalogplus + Hamburger Kulturgut Digital** | ค้น Witte Planetenbilder | ⚠️ catalog ถูก bot-protection บล็อก (Anubis) · เว็บทางการ = "Kulturgut Digital" ไม่ปรากฏ Witte/วารสารโหราฯ ใน digitized objects |
| 4 | **MDZ / digitale-sammlungen.de (BSB München)** | (รอบก่อนยืนยัน) + ค้นซ้ำ | ❌ ไม่มี Astrologische Rundschau/Blätter/Regelwerk |
| 5 | **Deutsche Digitale Bibliothek (DDB)** | ค้น Astrologische Rundschau/Blätter | ⚠️ เจอ "Astrologisches Blatt" = **ภาพแกะไม้ (Holzschnitt)** ในคอลเลกชันศิลปะ Marburg คนละเรื่อง · Regelwerk = มีแต่ Inhaltsverzeichnis (รอบก่อน) |
| 6 | **Europeana (europeana.eu)** | ค้น Astrologische Rundschau | ❌ HTTP 403 (บล็อก) + web search ไม่พบ digitized ของวารสาร/Witte |
| 7 | **ANNO (anno.onb.ac.at, ออสเตรีย)** | ค้น Astrologische Rundschau/Blätter/Zenit | ❌ ไม่พบ (หน้า JS-rendered · web search ไม่ยืนยันว่ามี) |
| 8 | **EOD / books2ebooks.eu** | ค้น Regelwerk Planetenbilder ในเครือข่าย | ❌ ไม่พบ record ที่พร้อม digitize-on-demand · (แต่หลักการ EOD = ถ้าห้องสมุดสมาชิกถือตัวเล่ม PD สั่งสแกนได้ — ดู request-guide) |
| 9 | **de.wikisource.org / projekt-gutenberg.de** | ค้น Witte / Astrologische Rundschau | ❌ ไม่มี (Wikisource มีแต่บทความ "Astrologie" ทั่วไป ไม่ใช่ Witte) |
| 10 | **ZVAB / booklooker / abebooks.de (ร้านโบราณ)** | หาตัวเล่ม + full-text preview | ✅ **มีตัวเล่มจริงขาย** (ดูล่าง) แต่ไม่มี full-text preview ออนไลน์ |
| 11 | **ZDB / DNB SRU (catalog machine API)** | ยืนยันการถือครอง + ปีพิมพ์ | ✅ ยืนยันฉบับ 1929/1932/1935 + วารสารทั้งสอง (ตารางด้านบน) |
| 12 | **astrax.de / Kulturgut Astrologie e.V.** | ตรวจว่ามีสแกน "หนังสือ" Regelwerk ไหม | ⚠️ **มีแต่บทความวารสาร 47 ชิ้น (ได้แล้ว)** · ไม่มีสแกนหนังสือ Regelwerk · ห้องสมุดสมาคมถือหนังสือ 1898+ / วารสาร 1909+ (อาจถือตัวเล่ม แต่ไม่เปิดสแกนหนังสือ) |

---

## ตัวเล่มจริงที่ซื้อได้ (ร้านโบราณ — เพื่อสแกนเอง ถ้าเลือกทางนี้)

จาก ZVAB (ค้น 2026-07-03) — **ฉบับ PD ≤1935:**
- **1932, 2. verbesserte Auflage, 407 S., ผ้าปกทอง** — €29.50 (Chiemgauer Internet Antiquariat, DE) / €35.00 (Peter Kardos, CH)
- ฉบับ ≥1950 (4./5. Aufl.) มีขายเช่นกัน แต่ **ห้ามใช้** (มี Lefeldt/Sieggrün)

วารสารต้นฉบับ (ถ้าอยากได้เล่มกระดาษ): abebooks มี *Astrologische Rundschau XV. Jhg. 1923-24 [kmpl.]* (Versandantiquariat Hans-Jürgen Lange) — แต่ **บทความ Witte ในเล่มนี้เรามีสแกนครบแล้ว**

---

## สรุปสถานะลิขสิทธิ์ (ยืนยัน)

- **บทความวารสาร Witte 1913–1925:** PD ไทย/EU/US (ตีพิมพ์ก่อน 1929) — **ถือครบแล้ว 47 ชิ้น** ✅
- **Regelwerk ≤1935 (ตัวกฎ Planetenbilder ของ Witte):** PD ไทย/EU ✅ · แต่ **"Einführung von Ludwig Rudolph" ในเล่ม = ยังไม่ PD (Rudolph †1982 → 2053)** → ตอนสกัดต้องตัดบทนำ Rudolph ทิ้ง เอาเฉพาะตารางกฎของ Witte
- **Immerwährende Ephemeride 1935 (Witte เดี่ยว):** PD 100% ✅ (แต่เป็นตาราง ephemeris ไม่ใช่คำอธิบายความหมาย)

**ข้อสรุปเชิงกลยุทธ์:** สถาบันเยอรมัน "หอสมุดรัฐ" ไม่มีของ digitize เปิดฟรี — ที่ digitize จริงคือ **สมาคมเฉพาะทาง astrax.de** (ได้วารสารครบแล้ว) · หนังสือ Regelwerk ต้อง **สั่งสแกน (DNB DoD) หรือซื้อ+สแกนเอง** → `r2d-request-guide.md`
