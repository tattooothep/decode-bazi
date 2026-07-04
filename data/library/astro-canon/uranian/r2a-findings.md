# r2a — Findings: เป้า #1 (Svehla 1939) และ #2 (Regelwerk) — พบตัวจริงแต่ยังโหลดไม่ได้

รอบ 2 · 2026-07-03 · เทคนิคที่ใช้: archive.org advancedsearch API + metadata API + direct download probe,
Google Books API (โดน quota=0), Wayback CDX (domain query ต้อง auth), HathiTrust/Stanford (โดน anti-bot Cloudflare/F5),
WebSearch หลายชั้น

---

## เป้า #1 — Svehla "Rules for Planetary Pictures" 1939 (อังกฤษ)

### ที่พบ
1. **archive.org `rulesforplanetar00nigg`** — "Rules for planetary pictures (Uranian system): adapted from the teachings of Alfred Witte" — **แต่เป็นฉบับ Hans Niggemann 1959 ไม่ใช่ Svehla 1939**
   - collection: bostonpubliclibrary / inlibrary / printdisabled → **lending-locked**
   - มีไฟล์ `_djvu.txt`, `.pdf`, `_abbyy.gz` ในรายการ metadata แต่ **ลองโหลดตรงทุกทางแล้วได้ 401/403** (access-restricted-item: true)
   - URL: https://archive.org/details/rulesforplanetar00nigg
2. **ฉบับพิมพ์ซ้ำ 2014 "Historical Version 1939"** — ขายโดย Witte-Verlag (สำนักพิมพ์ทางการ) → https://www.witte-verlag.com/international-books/english/68-rules-for-planetary-pictures-historical-version-1939.html
   - ยืนยันโครงสร้างเล่ม: Book I Techniques (S.1–76), Book II Annual Horoscope (77–89), Book III Health (91–133), Book IV Horary (135–149)
   - Svehla แปล 1939 ที่ Cleveland, Ohio ("ONLY AUTHORIZED English collection")
3. **Scribd doc 684899647** "Rules for Planetary Pictures by Witte-Lefeldt" — เป็นฉบับ Witte-Lefeldt (หลังสงคราม มีลิขสิทธิ์) ไม่ใช่ Svehla 1939 · https://www.scribd.com/document/684899647

### สถานะลิขสิทธิ์ (ยังไม่คอนเฟิร์ม — ต้องยืนยันมือ)
- งานสหรัฐฯ ตีพิมพ์ 1939 พร้อม notice ต้อง **ต่ออายุปีที่ 28 (1966 หรือ 1967)** จึงจะยังคุ้มครอง — ถ้าไม่ต่อ = PD ตั้งแต่ 1968
- **ทีมรอบแรกอ้างว่า "PD US" แต่ผมยืนยันการ "ไม่ต่ออายุ" ไม่ได้** เพราะฐานข้อมูล renewal ที่เชื่อถือได้โดนบล็อกหมด:
  - Stanford Copyright Renewal DB → โดน anti-bot F5/TSPD (ทั้ง HTML และ .json endpoint)
  - HathiTrust catalog → โดน Cloudflare challenge
  - Google Books CCE full-text search → API quota = 0 (บล็อกสนิทไม่มี key)
- **สิ่งที่ต้องทำเพื่อปิดประเด็น:** เปิด https://exhibits.stanford.edu/copyrightrenewals ด้วยเบราว์เซอร์จริง ค้น "Svehla" / "planetary pictures" — หรือเปิด Catalog of Copyright Entries เล่ม Books-Renewals ปี 1966–1967 (มีสแกนบน archive.org/HathiTrust)

### สรุปเป้า #1
**ไม่มีสแกน full-text ของ Svehla 1939 เปิดให้โหลดที่ไหน** (มีแต่ Niggemann 1959 แบบ restricted + reprint ที่ขายอยู่)
แม้ยืนยันว่า PD ได้ ก็ยังต้องหาสแกนตัวเล่มมาอยู่ดี → ทางเดียวคือสแกนจากเล่มจริง หรือขอ ILL/print-disabled access ที่ archive.org

---

## เป้า #2 — Witte "Regelwerk für Planetenbilder" (เยอรมัน) ≤1935

### ที่พบ (ข้อมูลบรรณานุกรม)
- **1. Auflage 1928** (194 หน้า) · **2. Auflage 1932** (407 หน้า) · **3. Auflage 1935** (417 หน้า) — ทั้ง 3 = **ตัวจริงในเป้าหมาย ≤1935**
- Witte เสีย 1941 → **PD ในเยอรมนีตั้งแต่ 2012** และ 1928/1935 อาจยังไม่ PD ในสหรัฐฯ (ตีพิมพ์ 1928 = ก่อน 1929 → PD US; แต่ 1932/1935 = ยังไม่ PD US จนถึงกลางทศวรรษ 2020s–2030s ขึ้นกับปี)
  - **1. Auflage 1928 = PD ทั้งเยอรมนีและสหรัฐฯ แน่นอน** ← ตัวที่ควรล่าที่สุด
- ฉบับหลังสงคราม (4. Aufl. 1950, 5./7. Aufl. โดย Hermann Lefeldt เพิ่ม Pluto + Transneptun ของ Sieggrün) = **มีลิขสิทธิ์ Lefeldt/Rudolph** ห้ามโหลด — ขายโดย Witte-Verlag EUR 35.95/38.95

### ที่ค้นแล้วไม่พบสแกนเปิด
- archive.org: `title:(planetenbilder)` = 0, `title:(regelwerk)` = เจอแต่เกม/เอกสารเยอรมันอื่น ไม่เกี่ยว
- HathiTrust / Google Books: เข้าไม่ได้ (บล็อก/quota) — **ยังไม่ตัดทิ้ง ต้องลองด้วยเบราว์เซอร์**
- ไม่พบใน booklooker/ZVAB นอกจากขายเล่มกระดาษ

### ที่ควรลองต่อ (รอบหน้า / ด้วยเบราว์เซอร์จริง)
- **MDZ (Münchener DigitalisierungsZentrum)** digitale-sammlungen.de — รอบแรกโดน 429, ลองใหม่ช้า ๆ
- **HathiTrust** ค้น "Regelwerk Planetenbilder" ตรง (catalog โดน Cloudflare ผ่าน curl แต่เบราว์เซอร์จริงเปิดได้)
- **annas-archive / libgen** — ดู md5 ของ 1928 1st ed ว่ามี PD scan mirror ไหม (โหลดเฉพาะที่ยืนยัน PD 1928)
- **witte-verlag.com** เก็บสแกนภาพหน้าปก 3. Auflage 1934/35 อยู่ (ใช้เป็นรูปประกอบ) — อาจติดต่อขอ facsimile

### สรุปเป้า #2
**ยังไม่พบสแกนดิจิทัลเปิดของ Regelwerk ฉบับใด ≤1935** — ตัว 1. Auflage 1928 คือเป้าที่คุ้มค่าล่าที่สุด (PD ทุกเขต) แต่ต้องใช้เบราว์เซอร์จริง/แหล่งเยอรมันที่ curl เข้าไม่ถึง

---

## แหล่งอ้างอิงรอง (ฟรี แต่ = งานสมัยใหม่มีลิขสิทธิ์ — ไม่เก็บเข้า canon)
- Michael Feist, "The Hamburg School — History of Uranian Astrology": https://uraniansociety.com/USIG_articles/article_history_of_uranian_astrology_michael_feist.pdf
- witte-verlag.com บทความรำลึก 100 ปี Cupido (Feist): https://witte-verlag.com/?catid=45&id=201:1923-der-erste-transneptunplanet-cupido
- astro.com Astrowiki (Alfred Witte, Astrologische Rundschau, Ernst Tiede) — สรุปบรรณานุกรม
- astrologiewslforum.astrax.de/viewtopic.php?t=8 — Werkverzeichnis Witte 1913–1935 (เราโหลด PDF สารบัญตัวจริงแล้ว = r2a-src-witte-_Witte_Alfred_Artikel_1913-1925_Liste.pdf)

## เครื่องมือที่ติดตั้งเพิ่มจะปลดล็อก text ได้
- `apt install tesseract-ocr-deu tesseract-ocr-frak` → OCR บทความ Witte 47 ชิ้น (Fraktur) เป็น text ได้ (ตอนนี้เป็น image-only)
