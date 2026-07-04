# r2c-source — หลักฐานที่มา + ลิขสิทธิ์ (Uranian Canon Hunt รอบ 2)

> วันที่: 2026-07-03 · ผู้ค้น: canon-hunt round-2 agent
> **ผลรอบ 2 = พบของจริง** — ได้ **ตัวบท Alfred Witte verbatim ครบทั้งคลัง 47 บทความ (1913–1925)**
> เป็นสแกนจาก **วารสารต้นฉบับ** (Astrologische Rundschau / Astrologische Blätter) = เนื้อ Witte ล้วน
> รอบ 1 หาไม่เจอ (archive.org/HathiTrust/DNB/Google Books ไม่มี) — รอบ 2 เจอที่ **astrax.de** (สมาคม Kulturgut Astrologie e.V., Freiburg)

---

## 1. แหล่งที่พบ (provenance)

**เว็บ:** www.astrax.de — "Astrologie-Schule WSL Freiburg" ในสังกัด **Kulturgut Astrologie e. V.** (สมาคมจดทะเบียน, Freiburg)
- หน้ารวมคลัง: `https://www.astrax.de/Alfred-Witte-Artikel.html` (หัวข้อ "Alfred Witte • 47 Artikel — Die Astrologie von morgen")
- ไฟล์ PDF: `https://www.astrax.de/pdf/<ชื่อไฟล์>.pdf`
- ค้นเจอผ่าน forum เดียวกันที่รอบ 1 อ้าง Werkverzeichnis (`astrologiewslforum.astrax.de/viewtopic.php?t=8`) แต่รอบ 1 **ไม่ได้ตามลิงก์ดาวน์โหลด** — รอบนี้ตามจนถึงตัวไฟล์

**คำระบุที่มาบนหน้าเว็บ (verbatim):**
> "1913-1925 · Quelle: **Originalzeitschriften aus der Bibliothek des Vereins.**
> Alle nachstehend aufgelisteten 47 Artikel von Alfred Witte sind 1975 nachgedruckt worden … zusammengefasst in dem Buch 'Alfred Witte: Der Mensch eine Empfangsstation kosmischer Suggestionen'. Mit Kommentaren von Hermann Sporner. … Ludwig Rudolph (WITTE-Verlag), Hamburg, 1975, ISBN 3-920807-11-1."

→ **สแกนชุดนี้มาจากวารสารต้นฉบับโดยตรง** (ไม่ใช่หน้าจากหนังสือรวมเล่ม 1975 ที่มีคอมเมนต์ Sporner) = **เนื้อ Witte ล้วน ไม่มีคอมเมนต์ภายหลัง**

---

## 2. การวิเคราะห์ลิขสิทธิ์ (ต่อยอดจาก 00-source-policy.md ของรอบ 1)

| องค์ประกอบ | สถานะ | เหตุผล |
|---|---|---|
| **ตัวบทความ Witte 1913–1925 (ทั้ง 47)** | ✅ **PD ไทย + EU/เยอรมนี** | Witte †1941 · ไทย life+50 → PD ตั้งแต่ 1992 · EU life+70 → PD ตั้งแต่ 1 ม.ค. 2012 · ตัวบทวารสาร = Witte เขียนเองล้วน ไม่ผสม Rudolph/Lefeldt |
| **สแกน/ดิจิไทซ์เอง (การถ่ายสำเนา)** | ✅ ใช้ได้ | การสแกนงาน PD แบบซื่อตรง (faithful reproduction) ไม่สร้างลิขสิทธิ์ใหม่ (หลัก *Bridgeman v. Corel* / EU DSM Art.14 งานทัศนศิลป์ PD ที่ reproduce แล้วยัง PD) |
| **หน้าปก/ภาพถ่าย Witte** จาก Regelwerk 3.Aufl 1934 บนหน้าเว็บ | ⚪ ไม่โหลด | เป็นภาพประกอบเว็บ ไม่จำเป็น |
| **หนังสือรวมเล่ม 1975 + คอมเมนต์ Hermann Sporner** | ❌ ไม่ PD | Sporner คอมเมนต์ = งานใหม่ · **ไม่ได้ใช้ไฟล์นี้** (เราได้สแกนวารสารต้นฉบับแทน) |
| **KEN2008_12 (reprint แบบเรียงพิมพ์ใหม่ + คอมเมนต์ Karsten F. Kröncke)** | ⚠️ ผสม | ตัวอ้าง Witte (ในเครื่องหมาย „…") = PD · คอมเมนต์ Kröncke = © 2008 Kröncke · ท้ายไฟล์ระบุ "**Nachdruck mit Quellenangabe erlaubt**" (พิมพ์ซ้ำได้ถ้าอ้างที่มา) · ใช้เฉพาะส่วนอ้าง Witte เท่านั้น |

**สรุป:** ทั้ง 47 บทความ (สแกนวารสารต้นฉบับ) = **PD ตามกฎหมายไทยและ EU ใช้ได้เต็มที่บน hourkey.io**

---

## 3. รายการไฟล์ที่โหลดลงดิสก์ (48 PDF + 1 reprint text-layer)

ทั้งหมดอยู่ใน `data/library/astro-canon/uranian/` ขึ้นต้น `r2c-src-witte-`
สแกนเป็น **ภาพ Fraktur** (ไม่มี text layer — pdftotext = 0 อักษร) · เครื่องนี้มี tesseract แต่ **มีแค่ภาษา eng ไม่มี deu/Fraktur** → **ยังไม่ได้ OCR** (OCR Fraktur ด้วย eng = ขยะ ผิดกฎ "ห้ามเดา") — เก็บเป็นภาพต้นฉบับ authoritative ไว้ก่อน

| # | ไฟล์ r2c-src-witte-… | ชื่อบทความ (verbatim) | ที่มา | น. |
|---|---|---|---|---|
| 00 | 00-witte-alfred-artikel-1913-1925-liste | *Werkverzeichnis* (สารบัญ 47 บทความ + หนังสือ) | รวบรวมโดยสมาคม | 8 |
| 01 | 01-betrachtungen-zahl-farbe-ton | Betrachtungen über Farbe, Zahl und Ton | AR 4.Jg 1913/14 H.1 S.4-10 | |
| 02 | 02-sensitive-punkte-… | Sensitive Punkte | AR 10.Jg 1919 H.1/3 S.23-29 | 8 |
| 03 | 03-… | Leichte Berechnung der Deklinationen … | AR 10.Jg 1920 H.4/6 S.57-60 | |
| 04 | 04-… | Die magnetischen Farben der Tierkreiszeichen | AR 10.Jg 1920 H.7/9 S.123-126 | |
| 05 | 05-… | Noch einmal ein oder das Horoskop des Exkaisers | AR 10.Jg 1920 H.10/12 S.161-166 | |
| 06 | 06-… | Das horoskopische System des Planeten Erde | AR 11.Jg 1920 H.3/4 S.44-48 | |
| 07 | 07-… | Das Tageshoroskop mit dem persönlichen Meridian | AR 11.Jg 1921 H.7/8 S.108-111 | |
| 08 | 08-… | Die Auswertung des Erdhoroskops … sensitiven Punkte (1) | AR 11.Jg 1921 H.9/10 S.137-145 | |
| 09 | 09-… | Die Auswertung des Erdhoroskops … sensitiven Punkte (2) | AR 11.Jg 1921 H.11/12 S.168-177 | |
| 10 | 10-… | Die Ereignisse mit anderen Menschen … Radixhoroskop | AR 11.Jg 1921 H.11/12 S.180-182 | |
| 11 | 11-… | Die Bestimmung der unbekannten Geburtszeit | AR 12.Jg 1922 H.1/2 S.9-17 | |
| 11a | 11a-… | …Geburtszeit (Leserbrief) | AR 12.Jg 1922 H.1/2 | |
| 12 | 12-13-14-… | **Die Auswertung eines aktuellen Planetenbildes** | AR 12.Jg 1921/22 H.3/4 S.42-48 | |
| 13 | 13-… | Das Jahreshoroskop der Erde | AR 12.Jg 1921/22 H.3/4 S.48-52 | |
| 14 | 14-… | Die Synodische Lunation | AR 12.Jg 1921/22 H.3/4 S.52-55 | |
| 15 | 15-… | Die Profektion und die Lunation | AR 12.Jg 1921/22 H.5/6 S.85-89 | |
| 16 | 16-… | Das Verhältnis der sensitiven Punkte zueinander | AR 12.Jg 1921/22 H.9/10 S.148-151 | |
| 17 | 17-… | Sterntafel des Uranus und Neptun | AR 12.Jg 1921/22 H.11/12 S.185-188 | |
| 18 | 18-… | Zum Artikel „Unbekannte Geburtszeit" | AR 13.Jg 1922/23 H.1/2 S.11-18 | |
| 19 | 19-… | Der erste Transneptunplanet Cupido? | AB 5.Jg Jul 1923 H.4 S.49-54 | |
| 20 | 20-… | Tafel des Planeten Neptun für alle Zeiten | AB 5.Jg Aug 1923 H.5 S.71 | |
| 21 | 21-… | Synodischer Lauf des Planeten Neptun | AB 5.Jg Aug 1923 H.5 S.72-73 | |
| 22 | 22-… | Synodischer Lauf des Planeten Cupido | AB 5.Jg Aug 1923 H.5 S.74-75 | |
| 23 | 23-… | Berechnung der Deklination mit Hilfe zweier Tabellen | AB 5.Jg Sep 1923 H.6 S.99-104 | |
| 24 | 24-… | Berechnung einer Konstante für Tage des progr. Horoskops | AB 5.Jg Nov 1923 H.8 S.183-184 | |
| 25 | 25-… | Tafel des Planeten „Uranus" für alle Zeiten | AB 5.Jg Nov 1923 H.8 S.185-187 | |
| 26 | 26-… | Der progressive Meridian während eines Jahres | AR 15.Jg 1923 H.2 S.34-37 | |
| 27 | 27-… | Der 4. Transneptunplanet „Kronos" | AR 15.Jg Jan 1924 H.4 S.93-97 | |
| 28 | 28-… | Das Erdhoroskop | AB 5.Jg Jan 1924 H.10 S.202-207 | |
| 29 | 29-… | Aktuelle, chronologisch geordnete Horoskope | AB 5.Jg Feb 1924 H.11 S.244-247 | |
| **30** | 30-planetenbilder-und-sensitive-punkte | **Planetenbilder und sensitive Punkte** ⭐ | AR 15.Jg Mär 1924 H.6 S.171-173 | 4 |
| **31** | 31-das-planetenbild-… | **Das Planetenbild** ⭐ | AB 6.Jg Apr 1924 H.1 S.15-19 | 6 |
| 32 | 32-… | Die Häuser des Aszendenten | AB 6.Jg Apr 1924 H.1 S.21-23 | |
| 33 | 33-… | Das Tageshoroskop | AB 6.Jg Apr 1924 H.1 S.26-28 | |
| 34 | 34-35-… | Die Differenzierung der Radixsonne … | AR 16.Jg Apr 1924 H.1 S.13-16 | |
| 35 | 35-… | Die Differenzierung der Planeten | AR 16.Jg Apr 1924 H.1 S.16-20 | |
| 36 | 36-… | Jahr, Monat und Stunde | AR 16.Jg Mai 1924 H.2 S.41-45 | |
| 37 | 37-… | Das progressive Jahreshoroskop | AB 6.Jg Mai 1924 H.2 S.37-40 | |
| 38 | 38-… | Die Häuser des Geburtsmeridians | AB 6.Jg Mai 1924 H.2 S.55-60 | |
| 39 | 39-… | Wahrscheinlicher Lauf … „Hades" | AB 6.Jg Jun 1924 H.3 S.76-79 | |
| 40 | 40-… | Der 2. Transneptun-Planet „Hades" | AR 16.Jg Jun 1924 H.3 S.73-79 | |
| 41 | 41-… | Die Häuser der Planeten | AB 6.Jg Jul 1924 H.4 S.119-121 | |
| **42** | 42-vergleichende-astrologie-… | **Vergleichende Astrologie** (synastry) ⭐ | AR 16.Jg 1924 H.5 S.137-140 | 5 |
| 43 | 43-… | Das Lunarhoroskop eines Tages | AB 6.Jg Sep 1924 H.6 S.187-188 | |
| **44** | 44-direktionen-und-planetenbilder | **Direktionen und Planetenbilder** ⭐ | AR 17.Jg Mai 1925 H.2 S.52-55 | |
| 45 | 45-… | Der Lauf der Erde (Sonnenbogen) … | AR 17.Jg Jul 1925 H.3 S.87-88 | |
| 46/47 | 46-…-1-2 | Ein Beitrag zur kriminalistischen Studie. Deklinationen | AB 7.Jg 1925 H.3/4 + H.5 | |

**เพิ่ม (text-layer):** `r2c-src-witte-30-reprint-ken2008-kroncke-textlayer.pdf` = ฉบับเรียงพิมพ์ใหม่ของบทที่ 30 (KEN 12/2008, มีคอมเมนต์ Kröncke) — ใช้เป็นแหล่ง **text ที่ก็อปได้** ของบทที่ 30 (ดู r2c-witte-30-…verbatim-de.md)

⭐ = บทที่เกี่ยวกับ "ภาพดาว / Planetenbild" โดยตรง (ทฤษฎี + ตัวอย่างการตีความ)

---

## 4. ข้อจำกัด/ความซื่อตรง (ต้องบอก)

- สแกนเป็น **Fraktur image** ยังไม่มี text layer → ต้อง OCR ด้วย model Fraktur (เช่น tesseract `deu_frak`/`frak2021` หรือ Transkribus) ในเครื่องที่มี trained data — **เครื่องนี้ยังไม่มี** จึงยังไม่แปลงเป็นข้อความ (เลี่ยงการสร้างข้อความมั่ว)
- ตัวบทเป็น **ภาษาเยอรมัน** → ถ้าจะทำ "ศาสตร์ที่ 6" ต้องแปลไทยภายหลัง (แปลได้ตามกฎหมายเพราะต้นฉบับ PD) แต่ **ห้ามให้ AI แต่งความหมายเอง** — ต้องแปลจากตัวบท verbatim นี้เท่านั้น
- **หมายเหตุสำคัญเรื่อง "ความหมายภาพดาว":** 47 บทความนี้ = **methodology + สูตร half-sum + ตัวอย่างตีความจริง** (เช่น ดวง Kaiser Wilhelm II, การตายของ Kaiserin Viktoria) แต่ **ไม่ใช่** พจนานุกรมความหมายภาพดาวแบบ A–Z (Sun/Moon=…, Mars/Saturn=… ครบทุกคู่) — พจนานุกรมนั้นอยู่ใน **หนังสือ Regelwerk (1928–1935)** ซึ่งยังติดปัญหาลิขสิทธิ์ผสม (บทนำ Rudolph) และ **ยังหาสแกน PD ไม่เจอ** (ตรงกับผลรอบ 1) · แต่ **แก่นทฤษฎีภาพดาว + วิธีตีความ + ตัวอย่าง** ครบใน 47 บทนี้แล้ว
