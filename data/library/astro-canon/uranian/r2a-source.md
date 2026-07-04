# r2a — Uranian Canon DEEP hunt รอบ 2 — แหล่งที่มา + หลักฐาน PD

รอบ 2 เน้น "ดึง full-text จริงลงดิสก์" (รอบแรกได้แค่ metadata)

## ผลรวม
- **เป้า #3 (บทความ Witte ในวารสาร 1913–1925) = สำเร็จเต็ม** — ดาวน์โหลด **47 บทความต้นฉบับ + 1 สารบัญผลงาน = 48 ไฟล์ PDF จริง** ลงดิสก์
- เป้า #1 (Svehla 1939 อังกฤษ) = ไม่มีสแกนเปิดให้โหลด (มีแต่ 1959 Niggemann บน archive.org แบบ restricted + ฉบับพิมพ์ซ้ำ 2014 ที่ยังขายอยู่) — ดู r2a-findings.md
- เป้า #2 (Regelwerk für Planetenbilder เยอรมัน 1928/1932/1935) = ยังไม่พบสแกนดิจิทัลเปิดที่ไหน — ดู r2a-findings.md

---

## แหล่งที่ดึงได้จริง: astrax.de (Kulturgut Astrologie e.V., Freiburg)

**URL หน้ารายชื่อ:** https://www.astrax.de/Alfred-Witte-Artikel.html
**URL ไฟล์:** https://www.astrax.de/pdf/<ชื่อไฟล์>  (โฮสต์เปิด ไม่ล็อก)
**ผู้เผยแพร่:** สมาคม "Kulturgut Astrologie e.V." (สมาคมอนุรักษ์มรดกโหราศาสตร์) สแกนจาก
"Originalzeitschriften aus der Bibliothek des Vereins" (วารสารต้นฉบับในห้องสมุดสมาคม) และเปิดให้ดาวน์โหลดฟรี
**ดึงเมื่อ:** 2026-07-03

### สถานะลิขสิทธิ์ = สาธารณสมบัติ (PD) ชัดเจน
- Alfred Witte เกิด 02.03.1878 เสียชีวิต 04.08.1941
- **เยอรมนี:** life+70 → PD ตั้งแต่ 1 ม.ค. 2012
- **สหรัฐฯ:** งานตีพิมพ์ต่างประเทศก่อนปี 1929 = PD ในสหรัฐฯ ทั้งหมด — บทความชุดนี้ทั้งหมดตีพิมพ์ **1913–1925** (ก่อน 1929) → PD ในสหรัฐฯ ด้วย
- สรุป: โหลดและใช้ verbatim ได้เต็มสิทธิ์ทุกเขต

### ลักษณะไฟล์ (ข้อจำกัดสำคัญ)
- เป็น **สแกนภาพหน้ากระดาษวารสารต้นฉบับ (image-only PDF ไม่มี text layer)**
- วารสารเยอรมันยุคนั้นพิมพ์ด้วยฟอนต์ **Fraktur (blackletter)**
- เครื่องนี้มี tesseract แต่ **ไม่มี language pack เยอรมัน/Fraktur** (มีแค่ eng/chi/tha) → OCR แล้วจะเละ
- ตามกฎ "ห้ามแต่งเนื้อ Witte เอง" จึง **ไม่ทำ OCR คุณภาพต่ำ** — เก็บ PDF ต้นฉบับเป็น verbatim primary source ไว้ก่อน
- **ถ้าต้องการ text:** ติดตั้ง `tesseract-ocr-deu` + `tesseract-ocr-frak` (หรือ Fraktur model ของ Transkribus/OCR4all) แล้วแปลงภายหลัง
- ไฟล์สารบัญ (`Liste`) มี text layer แต่ font-mapping เพี้ยน (n→ช่องว่าง, m→#, o→!, z→') อ่านได้แต่ต้องถอดรหัส

---

## รายการไฟล์ทั้งหมดที่ลงดิสก์ (prefix: r2a-src-witte-)

ทุกไฟล์อ้างอิงจากวารสาร Astrologische Rundschau (Theosophisches Verlagshaus Dr. H. Vollrath, Leipzig)
หรือ Astrologische Blätter (Linser-Verlag, Berlin)

| # | ชื่อบทความ | วารสาร / ปี / Heft / หน้า |
|---|---|---|
| — | Werkverzeichnis (สารบัญผลงาน 1913–1935) | รายการอ้างอิงทั้งหมด 8 หน้า |
| 1 | Betrachtungen über Farbe, Zahl und Ton | Astr. Rundschau 4.Jg 1913/14, H.1, S.4–10 |
| 2 | Sensitive Punkte | Astr. Rundschau 10.Jg 1919, H.1/3, S.23–29 |
| 3 | Leichte Berechnung der Deklinationen von vorgeschobenen Planeten | Astr. Rundschau 10.Jg 1920, H.4/6, S.57–60 |
| 4 | Die magnetischen Farben der Tierkreiszeichen | Astr. Rundschau 10.Jg 1920, H.7/9, S.123–126 |
| 5 | Noch einmal ein oder das Horoskop des Exkaisers | Astr. Rundschau 10.Jg 1920, H.10/12, S.161–166 |
| 6 | Das horoskopische System des Planeten Erde | Astr. Rundschau 11.Jg 1920, H.3/4, S.44–48 |
| 7 | Das Tageshoroskop mit dem persönlichen Meridian | Astr. Rundschau 11.Jg 1921, H.7/8, S.108–111 |
| 8 | Die Auswertung des Erdhoroskops und die Auslösung seiner sensitiven Punkte | Astr. Rundschau 11.Jg 1921, H.9/10, S.137–145 |
| 9 | Die Auswertung des Erdhoroskops … (ต่อ) | Astr. Rundschau 11.Jg 1921, H.11/12, S.168–177 |
| 10 | Die Ereignisse mit anderen Menschen aus dem eigenen Radixhoroskop | Astr. Rundschau 11.Jg 1921, H.11/12, S.180–182 |
| 11 | Die Bestimmung der unbekannten Geburtszeit | Astr. Rundschau 12.Jg 1922, H.1/2, S.9–17 |
| 11a | Die Bestimmung der unbekannten Geburtszeit (Leserbrief) | Astr. Rundschau 12.Jg 1922, H.1/2 |
| 12 | Die Auswertung eines aktuellen Planetenbildes | Astr. Rundschau 12.Jg 1921/22, H.3/4, S.42–48 |
| 13 | Das Jahreshoroskop der Erde | Astr. Rundschau 12.Jg 1921/22, H.3/4, S.48–52 |
| 14 | Die Synodische Lunation | Astr. Rundschau 12.Jg 1921/22, H.3/4, S.52–55 |
| 15 | Die Profektion und die Lunation | Astr. Rundschau 12.Jg 1921/22, H.5/6, S.85–89 |
| 16 | Das Verhältnis der sensitiven Punkte zueinander | Astr. Rundschau 12.Jg 1921/22, H.9/10, S.148–151 |
| 17 | Sterntafel des Uranus und Neptun | Astr. Rundschau 12.Jg 1921/22, H.11/12, S.185–188 |
| 18 | Zum Artikel „Unbekannte Geburtszeit" | Astr. Rundschau 13.Jg 1922/23, H.1/2, S.11–18 |
| 19 | **Der erste Transneptunplanet Cupido?** | Astr. Blätter 5.Jg Juli 1923, H.4, S.49–54 |
| 20 | Tafel des Planeten Neptun für alle Zeiten | Astr. Blätter 5.Jg Aug 1923, H.5, S.71 |
| 21 | Synodischer Lauf des Planeten Neptun | Astr. Blätter 5.Jg Aug 1923, H.5, S.72–73 |
| 22 | Synodischer Lauf des Planeten Cupido | Astr. Blätter 5.Jg Aug 1923, H.5, S.74–75 |
| 23 | Berechnung der Deklination mit Hilfe zweier Tabellen | Astr. Blätter 5.Jg Sep 1923, H.6, S.99–104 |
| 24 | Berechnung einer Konstante für Tage des progressiven Horoskops | Astr. Blätter 5.Jg Nov 1923, H.8, S.183–184 |
| 25 | Tafel des Planeten „Uranus" für alle Zeiten | Astr. Blätter 5.Jg Nov 1923, H.8, S.185–187 |
| 26 | Der progressive Meridian während eines Jahres | Astr. Rundschau 15.Jg Nov 1923, H.2, S.34–37 |
| 27 | Der 4. Transneptunplanet „Kronos" | Astr. Rundschau 15.Jg Jan 1924, H.4, S.93–97 |
| 28 | Das Erdhoroskop | Astr. Blätter 5.Jg Jan 1924, H.10, S.202–207 |
| 29 | Aktuelle, chronologisch geordnete Horoskope | Astr. Blätter 5.Jg Feb 1924, H.11, S.244–247 |
| 30 | **Planetenbilder und sensitive Punkte** | Astr. Rundschau 15.Jg März 1924, H.6, S.171–173 |
| 31 | **Das Planetenbild** | Astr. Blätter 6.Jg Apr 1924, H.1, S.15–19 |
| 32 | Die Häuser des Aszendenten | Astr. Blätter 6.Jg Apr 1924, H.1, S.21–23 |
| 33 | Das Tageshoroskop | Astr. Blätter 6.Jg Apr 1924, H.1, S.26–28 |
| 34/35 | Die Differenzierung der Radixsonne und die des unteren Geburtsmeridians | Astr. Rundschau 16.Jg Apr 1924, H.1, S.13–16 |
| 35 | Die Differenzierung der Planeten | Astr. Rundschau 16.Jg Apr 1924, H.1, S.16–20 |
| 36 | Jahr, Monat und Stunde | Astr. Rundschau 16.Jg Mai 1924, H.2, S.41–45 |
| 37 | Das progressive Jahreshoroskop | Astr. Blätter 6.Jg Mai 1924, H.2, S.37–40 |
| 38 | Die Häuser des Geburtsmeridians | Astr. Blätter 6.Jg Mai 1924, H.2, S.55–60 |
| 39 | Wahrscheinlicher Lauf des 2. Transneptun-Planeten „Hades" | Astr. Blätter 6.Jg Juni 1924, H.3, S.76–79 |
| 40 | Der 2. Transneptun-Planet „Hades" | Astr. Rundschau 16.Jg Juni 1924, H.3, S.73–79 |
| 41 | Die Häuser der Planeten | Astr. Blätter 6.Jg Juli 1924, H.4, S.119–121 |
| 42 | Vergleichende Astrologie | Astr. Rundschau 16.Jg 1924, H.5, S.137–140 |
| 43 | Das Lunarhoroskop eines Tages | Astr. Blätter 6.Jg Sep 1924, H.6, S.187–188 |
| 44 | Direktionen und Planetenbilder | Astr. Rundschau 17.Jg Mai 1925, H.2, S.52–55 |
| 45 | Der Lauf der Erde (Sonnenbogen) in Tagen vom Geburtstage an | (1925) |
| 46 | Ein Beitrag zur kriminalistischen Studie (Deklinationen) 1+2 | (1925) |

**บทความแกน Uranian ที่สำคัญสุดต่อ engine:** #2 Sensitive Punkte · #30 Planetenbilder und sensitive Punkte · #31 Das Planetenbild · #12 Die Auswertung eines aktuellen Planetenbildes · #16 Das Verhältnis der sensitiven Punkte zueinander · #44 Direktionen und Planetenbilder · #19/27/40 การค้นพบ Transneptun (Cupido/Kronos/Hades)

**หมายเหตุ:** ทั้ง 47 บทความนี้ถูกพิมพ์ซ้ำในเล่ม "Alfred Witte: Der Mensch — eine Empfangsstation kosmischer Suggestionen" (Hermann Sporner บรรณาธิการ, Witte-Verlag 1975, ISBN 3-920807-11-1) — เล่ม 1975 ยังมีลิขสิทธิ์ แต่ **ตัวบทความต้นฉบับ 1913–1925 = PD** ที่เราถือสแกนแล้ว
