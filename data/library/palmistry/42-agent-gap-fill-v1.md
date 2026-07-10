# Hourkey Palm Canon v1.0 - Agent Gap Fill Supplement

รอบเติมตกหล่นจาก 10-lane audit: 6 subagents + 4 local audit lanes.

Status: operational supplement for AI Sifu runtime.

This file extends, but does not replace:

- `00-hourkey-palm-canon-v1.md`
- `02-feature-taxonomy-v1.md`
- `03-safety-guards-v1.md`
- `10-chinese-shouxiang-v1.md`
- `20-indian-samudrika-v1.md`
- `30-western-chiromancy-v1.md`
- `40-overlap-rules-v1.md`
- `41-triple-overlap-interpretation-matrix-v1.md`
- `50-sifu-topic-map-v1.md`

Every heading with `HK.PALM.V1.*` in this file is a valid runtime `source_id`.

## 0. Supplement Priority

- If this file conflicts with `03-safety-guards-v1.md`, the safety guard wins.
- If this file conflicts with a school pack, use the narrower school-specific rule.
- If this file conflicts with `palmistry-fusion-canon.md`, this file and canon v1 win.
- Do not promote any school-specific item to universal unless an overlap rule below explicitly allows it.

## 1. Source Trace Notes

### HK.PALM.V1.SRC.TRACE.01 - Indian Local OCR Paths

- source_id: `HK.PALM.V1.SRC.TRACE.01`
- tier: source-trace
- release_relative_paths:
  - `private/restricted-sources/vedic/public-domain/BrihatSamhitaDr.SurkantJha__brihat-samhita-surkant-jha_djvu.txt`
  - `private/restricted-sources/vedic/public-domain/in.ernet.dli.2015.351583__2015.351583.Brihat-Samhita_djvu.txt`
  - `private/restricted-sources/vedic/public-domain/izkq_bhava-kutuhala-mahidhari-bhasha-tika-commentator-mahidhar-sharma-sanskrit-a__Bhava-Kutuhala-Mahidhari-Bhasha-Tika-Commentator-Mahidhar-Sharma-Sanskrit-And-Hindi-Jyotish-Illustrated-Missing-Pages-Te_djvu.txt`
  - `private/restricted-sources/vedic/public-domain/ofdc_bhava-kutuhala-of-ganaka-jivanath-with-bhasha-commentary-1966-kshem-raj-sri-kris__Bhava-Kutuhala-Of-Ganaka-Jivanath-With-Bhasha-Commentary-1966-Kshem-Raj-Sri-Krishna-Das-Shreshti,-Mumbai_djvu.txt`
- use: local evidence trace for Indian palm, finger, wrist, fish, triangle, upward-line, yava/barley, and auspicious-sign rules.
- guard: no verbatim runtime quotation without scan review.

### HK.PALM.V1.SRC.TRACE.02 - Western And Chinese Web-Locator Status

- source_id: `HK.PALM.V1.SRC.TRACE.02`
- tier: source-trace
- Chinese status: `CN.GJTSJC.WS640`, `CN.SXQB.NLC`, `CN.MYXF.NLC`, `CN.LZXF.NLC` are runtime locators/source notes, not verified-local OCR in this release.
- Western status: `WE.BENHAM.1900`, `WE.CHEIRO.LOH`, `WE.CHEIRO.PFA.1916`, `WE.DESBARROLLES.1862`, `WE.SAINTGERMAIN.1897` are source-map locators/web witnesses, not verified-local OCR in this release.
- guard: for Chinese/Western detail, use paraphrased operational rules and source IDs; do not claim local OCR verification.

## 2. Chinese Gap Fill

### HK.PALM.V1.T3.CN.09 - Hand And Finger Form

- source_id: `HK.PALM.V1.T3.CN.09`
- tier: T3-cn, supports `HK.PALM.V1.T1.05`
- dimension: hand/finger form
- evidence_sources: `CN.SXQB.NLC`, `CN.GJTSJC.WS640`, `CN.MYXF.NLC`
- safe_reading: Chinese physiognomy reads hand and finger form as part of bodily signs. Long/refined fingers support sensitivity, craft, and mental refinement; thick/rough fingers support direct action and pressure-bearing style.
- Thai Sifu use: "ตามสายจีน รูปนิ้วช่วยบอกวิธีใช้ปัญญาและแรงงาน ถ้านิ้วเรียวให้เน้นความละเอียด ถ้านิ้วหนาให้เน้นการลงมือจริงและต้องมีระบบเช็คงาน"
- guard: do not use harsh classical class/status language.

### HK.PALM.V1.T3.CN.10 - Line Density And Order

- source_id: `HK.PALM.V1.T3.CN.10`
- tier: T3-cn, supports `HK.PALM.V1.T2.05`
- dimension: line density/order
- evidence_sources: `CN.SXQB.NLC`, `CN.GJTSJC.WS640`
- safe_reading: Many fine/confused lines suggest scattered qi, mental load, and need for order. Few but clear lines suggest directness and simplicity, but still need context from major lines.
- Thai Sifu use: "เส้นย่อยมากแปลว่ารับเรื่องรอบตัวเยอะ ต้องจัดระบบพักและจัดลำดับ ส่วนเส้นน้อยต้องดูว่าเส้นหลักชัดหรือไม่ ก่อนสรุปว่าเจ้าตัวเรียบง่ายหรือภาพไม่ชัด"
- guard: check photo clarity first; do not call the person unlucky, poor, or empty.

### HK.PALM.V1.T3.CN.11 - Mark Location Within Chinese Regions

- source_id: `HK.PALM.V1.T3.CN.11`
- tier: T3-cn
- dimension: Chinese region/context
- evidence_sources: `CN.LZXF.NLC`, `CN.GJTSJC.WS640`, `CN.SXQB.NLC`
- safe_reading: Chinese marks must be read by visible shape plus their Chinese region/context. A fish, cross, well, or Chuan-like pattern modifies the region where it appears.
- Thai Sifu use: "เครื่องหมายจีนห้ามอ่านลอย ๆ ต้องดูว่าตกบริเวณใดและสัมพันธ์กับเส้นอะไร จึงแปลเป็นแรงเสริม แรงปะทะ หรือกรอบคุ้มกัน"
- guard: do not map Chinese regions to Western planetary mounts.

### HK.PALM.V1.T3.CN.12 - Chuan Pattern Boundary

- source_id: `HK.PALM.V1.T3.CN.12`
- tier: T3-cn
- dimension: line separation pattern
- evidence_sources: `CN.GJTSJC.WS640`, `CN.SXQB.NLC`
- safe_reading: A clear 川字紋-like separation can show independence, self-direction, or separation between thinking, feeling, and action.
- Thai Sifu use: "ถ้าเส้นแยกตัวชัดแบบ川 ให้อ่านเป็นคนตัดสินใจเองสูง ไม่ชอบถูกบังคับ แต่ต้องระวังคิด-รู้สึก-ลงมือแยกกันจนคนรอบตัวตามไม่ทัน"
- guard: no lifespan, spouse, or disaster prediction.

## 3. Indian Samudrika Gap Fill

### HK.PALM.V1.T3.IN.11 - Indian Line Density

- source_id: `HK.PALM.V1.T3.IN.11`
- tier: T3-in, supports `HK.PALM.V1.T2.05`
- dimension: line density
- evidence_sources: `IN.BS.SURKANT.LOCAL`, `IN.BS.DLI.LOCAL`
- safe_reading: Too many small lines or very sparse lines can be used as symbolic evidence for mental load, scattered energy, directness, or need for external structure.
- Thai Sifu use: "เส้นแน่นมากให้แปลว่าภาระใจและสิ่งรบกวนเยอะ ต้องจัดระบบ ลดงานย่อย และพักให้เป็น ส่วนเส้นน้อยให้แปลว่าเดินตรง แต่ควรสร้าง checklist กันพลาดรายละเอียด"
- guard: do not translate into poverty, low merit, or fixed fate.

### HK.PALM.V1.T3.IN.12 - Indian Continuous Main Lines

- source_id: `HK.PALM.V1.T3.IN.12`
- tier: T3-in, supports `HK.PALM.V1.T1.02`
- dimension: main-line continuity
- evidence_sources: `IN.BS.SURKANT.LOCAL`
- safe_reading: Long, clear, continuous main lines support continuity of effort, stable direction, and carrying capacity in that topic.
- Thai Sifu use: "เส้นหลักยาวต่อเนื่องให้อ่านเป็นแรงต่อเนื่องและความสามารถพยุงเรื่องนั้นได้นาน"
- guard: never convert continuous life/foundation line into lifespan.

### HK.PALM.V1.T3.IN.13 - Indian Long/Slender Fingers

- source_id: `HK.PALM.V1.T3.IN.13`
- tier: T3-in, supports `HK.PALM.V1.T1.05`
- dimension: finger form
- evidence_sources: `IN.BS.SURKANT.LOCAL`, `IN.BS.DLI.LOCAL`
- safe_reading: Long/slender fingers support refinement, observation, and work requiring care.
- Thai Sifu use: "นิ้วยาวหรือเพรียวชัดให้อ่านเป็นคนละเอียด สังเกตดี เหมาะกับงานวิเคราะห์ งานประณีต งานที่ต้องคิดก่อนลงมือ"
- guard: do not say superior, noble, or inherently better.

### HK.PALM.V1.T3.IN.14 - Indian Thick/Rough Fingers

- source_id: `HK.PALM.V1.T3.IN.14`
- tier: T3-in, supports `HK.PALM.V1.T1.05`
- dimension: finger form
- evidence_sources: `IN.BS.SURKANT.LOCAL`, `IN.BS.DLI.LOCAL`
- safe_reading: Thick/rough fingers support practical action, physical persistence, and pressure-bearing style.
- Thai Sifu use: "นิ้วหนาหรือหนักมือให้อ่านเป็นแรงลงมือจริง อึดกับงานตรงหน้า แต่ควรเติมระบบวางแผนและตรวจรายละเอียด"
- guard: no insult, class judgment, or moral judgment.

### HK.PALM.V1.T3.IN.15 - Indian Red/Lac Palm Tone

- source_id: `HK.PALM.V1.T3.IN.15`
- tier: T3-in, supports `HK.PALM.V1.T2.01`
- dimension: color
- evidence_sources: `IN.BS.SURKANT.LOCAL`, `IN.BS.DLI.LOCAL`
- safe_reading: Under reliable light, red/lac-like tone supports active vitality and readiness to act.
- Thai Sifu use: "ถ้าแสงเชื่อถือได้ ฝ่ามือแดงสดหรือคล้ายครั่งให้ใช้เป็นตัวเสริมว่าพลังพร้อมลงมือ"
- guard: no diagnosis, no guaranteed luck or wealth.

### HK.PALM.V1.T3.IN.16 - Indian Rough/Dry/Dull Palm Surface

- source_id: `HK.PALM.V1.T3.IN.16`
- tier: T3-in, supports `HK.PALM.V1.T1.06`
- dimension: texture/color
- evidence_sources: `IN.BS.SURKANT.LOCAL`, `IN.BS.DLI.LOCAL`
- safe_reading: Rough, dry, dull surface supports strain, heavy workload, or need to rebuild energy rhythm.
- Thai Sifu use: "ผิวฝ่ามือหยาบ แห้ง หรือหม่นให้แปลว่าฐานพลังต้องดูแล ต้องลดภาระซ้ำ ๆ และวางรอบพัก"
- guard: no illness or permanent bad fate claim.

### HK.PALM.V1.T3.IN.17 - Wrist / Manibandha Visibility

- source_id: `HK.PALM.V1.T3.IN.17`
- tier: T3-in
- dimension: wrist lines
- evidence_sources: `IN.BS.SURKANT.LOCAL`
- safe_reading: When visible, wrist/manibandha lines support foundation, support rhythm, early base, and stability reading.
- Thai Sifu use: "ถ้าเห็นข้อมือชัด ให้อ่านเป็นฐานรองรับชีวิตและจังหวะพื้นฐาน ถ้าภาพ crop ไม่ถึงข้อมือให้ไม่อ่าน"
- guard: no lifespan count.

### HK.PALM.V1.T3.IN.18 - Wrist Weakness Or Break Guard

- source_id: `HK.PALM.V1.T3.IN.18`
- tier: T3-in
- dimension: wrist-line quality
- evidence_sources: `IN.BS.SURKANT.LOCAL`
- safe_reading: Faint/broken wrist lines can support "foundation needs rhythm and care" only.
- Thai Sifu use: "รอยข้อมือจางหรือสะดุดให้แปลว่าฐานรองรับต้องจัดใหม่ เช่น ตารางพัก งานพื้นฐาน และคนช่วย"
- guard: no disease, accident, or age prediction.

### HK.PALM.V1.T3.IN.19 - Yava/Barley Location And Clarity

- source_id: `HK.PALM.V1.T3.IN.19`
- tier: T3-in
- dimension: yava/barley mark
- evidence_sources: `IN.BHAVA.KUTUHALA.IZKQ`, `IN.BHAVA.KUTUHALA.OFDC`
- safe_reading: A clear barley/yava mark on thumb/finger area indicates seed potential, stored capacity, and gain through cultivation.
- Thai Sifu use: "yava คือศักยภาพแบบเมล็ดพันธุ์ ต้องเพาะด้วยวินัย เวลา และระบบ ไม่ใช่ผลสำเร็จลอย ๆ"
- guard: no fertility, child, or lineage prediction.

### HK.PALM.V1.T3.IN.20 - Indian Leadership Symbols

- source_id: `HK.PALM.V1.T3.IN.20`
- tier: T3-in
- dimension: auspicious symbols
- evidence_sources: `IN.BS.SURKANT.LOCAL`, `IN.BHAVA.KUTUHALA.IZKQ`, `IN.BHAVA.KUTUHALA.OFDC`
- symbols: conch, wheel, lotus, flag, svastika-like auspicious signs where legally/safely framed as an Indic symbol.
- safe_reading: Clear leadership symbols support recognition, duty, responsibility, public role, or ability to carry visible work.
- Thai Sifu use: "ถ้าสัญลักษณ์กลุ่มนี้ชัด ให้อ่านเป็นแรงยอมรับและหน้าที่นำ แต่ต้องสร้างด้วยผลงาน ไม่ใช่ชะตาสูงส่งโดยกำเนิด"
- guard: no royalty, caste, political power, or fixed rank claim.

### HK.PALM.V1.T3.IN.21 - Indian Resource And Protection Symbols

- source_id: `HK.PALM.V1.T3.IN.21`
- tier: T3-in
- dimension: auspicious/protective symbols
- evidence_sources: `IN.BS.SURKANT.LOCAL`, `IN.BHAVA.KUTUHALA.IZKQ`, `IN.BHAVA.KUTUHALA.OFDC`
- symbols: pot, goad, rope/garland, altar, temple, well, makara.
- safe_reading: These signs can support resources, protection, helpful systems, or capacity to organize life.
- Thai Sifu use: "กลุ่มหม้อ เชือก แท่น วัด บ่อน้ำ หรือ makara ให้อ่านเป็นทรัพยากร ระบบคุ้มกัน หรือคนช่วยที่ต้องรักษาด้วยวินัย"
- guard: no guaranteed wealth, patron, or rescue.

### HK.PALM.V1.T3.IN.22 - Indian Tool/Weapon Marks

- source_id: `HK.PALM.V1.T3.IN.22`
- tier: T3-in
- dimension: tool/weapon marks
- evidence_sources: `IN.BS.SURKANT.LOCAL`
- symbols: bow, sword, spear, and similar clear tool/weapon forms.
- safe_reading: Tool/weapon marks can support courage, technical skill, defense, and problem-solving under pressure.
- Thai Sifu use: "ถ้าเห็นเป็นรูปเครื่องมือหรืออาวุธชัด ให้อ่านเป็นความกล้าและทักษะเฉพาะทางในการแก้ปัญหา"
- guard: no violence, war, legal conflict, or harm prediction.

### HK.PALM.V1.T3.IN.23 - Indian Mark Clarity And Location Guard

- source_id: `HK.PALM.V1.T3.IN.23`
- tier: T3-in, supports `HK.PALM.V1.T1.07`
- dimension: mark clarity
- evidence_sources: `IN.BS.SURKANT.LOCAL`, `IN.BHAVA.KUTUHALA.IZKQ`
- safe_reading: Indian marks must be visually clear, complete enough, and located on palm/finger/wrist before interpretation.
- Thai Sifu use: "ถ้าเครื่องหมายไม่ชัด ให้บอกตรง ๆ ว่ายังยืนยันไม่ได้ อย่าเติมรูปมงคลจากเส้นตัดกันแบบสุ่ม"
- guard: low clarity means no sacred-symbol reading.

## 4. Western Chiromancy Gap Fill

### HK.PALM.V1.T3.WE.11 - Western Hand Type Detail

- source_id: `HK.PALM.V1.T3.WE.11`
- tier: T3-west
- dimension: hand type
- evidence_sources: `WE.BENHAM.1900`, `WE.CHEIRO.LOH`, `WE.CHEIRO.PFA.1916`, `WE.SAINTGERMAIN.1897`, `WE.DESBARROLLES.1862`
- covered forms:
  - elementary/heavy hand: practical, physical, endurance-oriented.
  - square hand: order, rules, reliability, procedure.
  - spatulate hand: experiment, movement, applied invention.
  - conic/artistic hand: taste, service, persuasion, design.
  - philosophic hand: analysis, principles, teaching, research.
  - psychic/refined hand: intuition, imagination, sensitivity, need for grounding.
  - mixed hand: adaptability and multi-role capacity.
- Thai Sifu use: "รูปมือแบบตะวันตกใช้เป็น T3-west เพื่อบอกสไตล์งานและวิธีคิด ไม่ใช่แก่นสากลโบราณของทุกสาย"
- guard: do not present modern hand-type names as Chinese/Indian doctrine.

### HK.PALM.V1.T3.WE.12 - Mount Development State

- source_id: `HK.PALM.V1.T3.WE.12`
- tier: T3-west
- dimension: planetary mounts
- evidence_sources: `WE.BENHAM.1900`, `WE.CHEIRO.LOH`, `WE.SAINTGERMAIN.1897`
- safe_reading: A well-developed mount shows available energy in that domain; overfull or flat presentation suggests imbalance, underuse, or need for regulation.
- Thai Sifu use: "เนินเต็มพอดีคือพลังด้านนั้นใช้ได้ดี เนินล้น/แฟบให้แปลเป็นสมดุลที่ต้องปรับ ไม่ใช่คำตัดสินดีร้าย"
- guard: always label as Western T3; never map to Chinese bagua/nine-palace.

### HK.PALM.V1.T3.WE.13 - Mars Zones Split

- source_id: `HK.PALM.V1.T3.WE.13`
- tier: T3-west
- dimension: Mars zones
- evidence_sources: `WE.BENHAM.1900`, `WE.CHEIRO.LOH`
- safe_reading: Lower Mars supports initiating courage; Upper Mars supports endurance under attack/pressure; Plain of Mars supports how pressure is processed in the palm center.
- Thai Sifu use: "อังคารล่างคือแรงเริ่มสู้ อังคารบนคือความอดทน พื้นราบอังคารคือการรับแรงกดดันกลางชีวิต"
- guard: no violence or conflict prediction.

### HK.PALM.V1.T3.WE.14 - Western Line Variant Detail

- source_id: `HK.PALM.V1.T3.WE.14`
- tier: T3-west
- dimension: line variants
- evidence_sources: `WE.BENHAM.1900`, `WE.CHEIRO.LOH`, `WE.CHEIRO.PFA.1916`
- safe_reading:
  - life line arc/sister line: vitality rhythm, roots, support; no lifespan.
  - head line start/slope: caution/independence, practical reasoning, imagination.
  - heart line endpoint/curve: emotional expectations, warmth, standards, boundaries.
  - fate line origin: self-built path, family/root influence, outside/customer/network influence.
  - sun line: recognized output and visible craft.
  - mercury line: communication, trade, analysis; no health diagnosis.
  - branch/fork/tassel: growth, split focus, leakage, or need to gather energy.
- Thai Sifu use: "เส้นตะวันตกต้องอ่านตำแหน่ง จุดเริ่ม จุดจบ และคุณภาพ ไม่ใช่อ่านชื่อเส้นอย่างเดียว"
- guard: no exact timing, disease, divorce, or guaranteed promotion.

### HK.PALM.V1.T3.WE.15 - Thumb Balance, Angle, And Flexibility

- source_id: `HK.PALM.V1.T3.WE.15`
- tier: T3-west
- dimension: thumb
- evidence_sources: `WE.BENHAM.1900`, `WE.CHEIRO.LOH`
- safe_reading: Upper/lower phalange balance suggests will versus reasoning; thumb angle/flexibility suggests openness, independence, caution, or decision rhythm.
- Thai Sifu use: "นิ้วโป้งกางและสมดุลให้พูดถึงวินัยกับเหตุผลไปด้วยกัน นิ้วโป้งชิด/แข็งให้แนะนำจังหวะตัดสินใจและการเปิดรับข้อมูล"
- guard: if thumb is cropped/hidden, omit.

### HK.PALM.V1.T3.WE.16 - Individual Fingers, Tips, Joints, And Spacing

- source_id: `HK.PALM.V1.T3.WE.16`
- tier: T3-west
- dimension: fingers
- evidence_sources: `WE.BENHAM.1900`, `WE.CHEIRO.LOH`, `WE.SAINTGERMAIN.1897`
- safe_reading:
  - index/Jupiter finger: leadership, dignity, ambition.
  - middle/Saturn finger: responsibility, seriousness, patience.
  - ring/Apollo finger: creativity, performance, visible output.
  - little/Mercury finger: speech, trade, negotiation, quick analysis.
  - tips/joints: intuitive, practical, experimental, or analytical processing style.
  - spacing: independence, caution, openness, or resource boundaries if hand posture is natural.
- Thai Sifu use: "นิ้วแต่ละนิ้วเป็นหลักฐานเสริมเรื่องงานและคน ต้องจับคู่กับเส้นสมอง/เส้นงานก่อนสรุป"
- guard: if fingers are posed, cropped, or forced open/closed, do not read spacing.

### HK.PALM.V1.T3.WE.17 - Western Minor Lines

- source_id: `HK.PALM.V1.T3.WE.17`
- tier: T3-west
- dimension: minor lines
- evidence_sources: `WE.BENHAM.1900`, `WE.CHEIRO.LOH`
- safe_reading:
  - Girdle of Venus: emotional sensitivity, refined taste, need for boundaries.
  - Line of Intuition: pattern reading, atmosphere reading, advisory/insight capacity.
  - Ring of Solomon: teaching, guidance, mentoring.
  - Ring of Saturn: depth/seriousness, but avoid isolation.
  - influence/union/travel lines: relationship/customer/network/foreign influence; no marriage/divorce certainty.
  - wrist/rascette lines: foundation and support rhythm; no lifespan count.
- Thai Sifu use: "เส้นรองใช้เมื่อเห็นชัดเท่านั้น และต้องเป็นตัวเสริม ไม่ใช่ตัวตัดสินทั้งชีวิต"
- guard: no health, divorce, or lifespan prediction.

### HK.PALM.V1.T3.WE.18 - Western Micro Marks

- source_id: `HK.PALM.V1.T3.WE.18`
- tier: T3-west
- dimension: marks
- evidence_sources: `WE.BENHAM.1900`, `WE.CHEIRO.LOH`, `WE.SAINTGERMAIN.1897`
- safe_reading:
  - trident: three-way expansion of skill, visibility, or opportunity.
  - dot/circle/bar: pressure point, pause, or need for careful handling.
  - tassel: scattered ending, diffusion, or need to gather energy.
- Thai Sifu use: "เครื่องหมายเล็กต้องเห็นชัดและอยู่บนเส้น/เนินที่ระบุได้ ถ้าไม่ชัดให้ไม่อ่าน"
- guard: no extreme event claim.

### HK.PALM.V1.T3.WE.19 - Mark By Location Rule

- source_id: `HK.PALM.V1.T3.WE.19`
- tier: T3-west
- dimension: mark location
- evidence_sources: `WE.BENHAM.1900`, `WE.CHEIRO.LOH`, `WE.SAINTGERMAIN.1897`
- safe_reading: Western marks modify the line or mount where they appear. A star, cross, square, island, grille, trident, dot, or fork has no standalone meaning without location.
- Thai Sifu use: "เครื่องหมายคือเครื่องขยายเสียงของพื้นที่นั้น ต้องบอกว่ามันอยู่บนเส้นไหนหรือเนินไหนก่อนแปล"
- guard: no reading marks from blur or random scratches.

## 5. Feature Taxonomy Supplements

### HK.PALM.V1.FEAT.SUPP.01 - Expanded Line Modifiers

- source_id: `HK.PALM.V1.FEAT.SUPP.01`
- inspect: depth, continuity, island, chain, fork/split, upward branch, downward branch, crossing, start, end, origin.
- safe use: modifiers change the domain of the line they sit on.
- guard: exact position requires clear photo; no exact dates.

### HK.PALM.V1.FEAT.SUPP.02 - Individual Finger Emphasis

- source_id: `HK.PALM.V1.FEAT.SUPP.02`
- inspect: index, middle, ring, little finger length/proportion/tip/joint/spacing.
- safe use: leadership, responsibility, visible output, communication style.
- guard: use as supporting evidence only, not a full life conclusion.

### HK.PALM.V1.FEAT.SUPP.03 - Nail Reading Guard

- source_id: `HK.PALM.V1.FEAT.SUPP.03`
- inspect: visible nail length/shape/color only when the nails are clear and lighting reliable.
- safe use: refinement, pressure-bearing style, detail habit.
- guard: no medical diagnosis, deficiency claim, disease claim, or substance-use inference.

### HK.PALM.V1.FEAT.SUPP.04 - Mark By Location

- source_id: `HK.PALM.V1.FEAT.SUPP.04`
- inspect: mark shape plus location on line, region, finger, thumb, or wrist.
- safe use: mark modifies that location.
- guard: if location is unknown, mark stays "not confirmed."

### HK.PALM.V1.FEAT.SUPP.05 - Topic Coverage Evidence

- source_id: `HK.PALM.V1.FEAT.SUPP.05`
- inspect: whether each A-H topic has at least one visible evidence item and one topic-level matrix source.
- safe use: allows low-confidence but complete Sifu reading without inventing unseen details.
- guard: weak evidence must be stated as weak.

## 6. Overlap Additions

### HK.PALM.V1.OVL.12 - Line Depth

- source_id: `HK.PALM.V1.OVL.12`
- match_type: triple-direct
- evidence_sources: `HK.PALM.V1.T1.02`, `HK.PALM.V1.T1.03`, `HK.PALM.V1.FEAT.MOD.DEPTH`, `HK.PALM.V1.T3.CN.02`, `HK.PALM.V1.T3.IN.02`, `HK.PALM.V1.T3.WE.01`, `HK.PALM.V1.T3.WE.02`, `HK.PALM.V1.T3.WE.03`, `HK.PALM.V1.T3.WE.04`
- safe_reading: Line depth controls how strongly a domain can express.
- guard: a deep line is not guaranteed success; a shallow line is not doom.

### HK.PALM.V1.OVL.13 - Continuity

- source_id: `HK.PALM.V1.OVL.13`
- match_type: triple-direct
- evidence_sources: `HK.PALM.V1.T1.02`, `HK.PALM.V1.T1.04`, `HK.PALM.V1.T3.CN.02`, `HK.PALM.V1.T3.CN.03`, `HK.PALM.V1.T3.IN.02`, `HK.PALM.V1.T3.IN.03`, `HK.PALM.V1.T3.WE.01`, `HK.PALM.V1.T3.WE.02`, `HK.PALM.V1.T3.WE.03`, `HK.PALM.V1.T3.WE.04`
- safe_reading: Continuity supports stable flow; interruption supports redirection or pressure management.
- guard: no disaster or exact age.

### HK.PALM.V1.OVL.14 - Islands

- source_id: `HK.PALM.V1.OVL.14`
- match_type: triple-analog, western-explicit
- evidence_sources: `HK.PALM.V1.T1.03`, `HK.PALM.V1.T1.07`, `HK.PALM.V1.FEAT.MOD.ISLAND`, `HK.PALM.V1.T3.WE.09`, `HK.PALM.V1.T3.CN.02`, `HK.PALM.V1.T3.CN.03`, `HK.PALM.V1.T3.IN.02`, `HK.PALM.V1.T3.IN.03`
- safe_reading: An island can indicate a pocket of stuck energy, delay, or repeated stress in the line domain.
- guard: Western-explicit; no illness claim.

### HK.PALM.V1.OVL.15 - Chained Lines

- source_id: `HK.PALM.V1.OVL.15`
- match_type: triple-analog, western-explicit
- evidence_sources: `HK.PALM.V1.T1.03`, `HK.PALM.V1.FEAT.MOD.CHAIN`, `HK.PALM.V1.T3.WE.09`, `HK.PALM.V1.T3.CN.02`, `HK.PALM.V1.T3.IN.02`
- safe_reading: Chained lines suggest sensitivity, repeated small pressures, or rhythm that needs stabilization.
- guard: do not call it weakness.

### HK.PALM.V1.OVL.16 - Forks And Splits

- source_id: `HK.PALM.V1.OVL.16`
- match_type: triple-analog weak, western-explicit
- evidence_sources: `HK.PALM.V1.FEAT.MOD.FORK`, `HK.PALM.V1.T3.WE.09`, `HK.PALM.V1.T1.04`, `HK.PALM.V1.T3.CN.03`, `HK.PALM.V1.T3.CN.07`, `HK.PALM.V1.T3.IN.03`, `HK.PALM.V1.T3.IN.08`
- safe_reading: A fork/split suggests dual direction, divided interest, or need to integrate two roles.
- guard: no prediction that life "breaks apart."

### HK.PALM.V1.OVL.17 - Branch Direction

- source_id: `HK.PALM.V1.OVL.17`
- match_type: upward=two-school, downward=school-specific-west with analog caution
- evidence_sources: `HK.PALM.V1.T2.04`, `HK.PALM.V1.FEAT.MOD.BRANCH_UP`, `HK.PALM.V1.FEAT.MOD.BRANCH_DOWN`, `HK.PALM.V1.T3.IN.08`, `HK.PALM.V1.T3.WE.09`
- safe_reading: Upward branches show constructive rise; downward branches suggest energy leakage, distraction, or burden that needs management.
- guard: upward does not guarantee promotion; downward does not doom.

### HK.PALM.V1.OVL.18 - Crossings

- source_id: `HK.PALM.V1.OVL.18`
- match_type: triple-analog
- evidence_sources: `HK.PALM.V1.T1.04`, `HK.PALM.V1.T3.CN.08`, `HK.PALM.V1.T3.IN.03`, `HK.PALM.V1.T3.WE.09`
- safe_reading: A crossing means two forces meet, creating pressure, decision, or obstruction in the affected domain.
- guard: no automatic bad-luck reading.

### HK.PALM.V1.OVL.19 - Line Start, End, And Origin

- source_id: `HK.PALM.V1.OVL.19`
- match_type: triple-analog, western-explicit detail
- evidence_sources: `HK.PALM.V1.T1.01`, `HK.PALM.V1.FEAT.LINE.LIFE`, `HK.PALM.V1.FEAT.LINE.HEAD`, `HK.PALM.V1.FEAT.LINE.HEART`, `HK.PALM.V1.FEAT.LINE.FATE`, `HK.PALM.V1.T3.CN.01`, `HK.PALM.V1.T3.IN.01`, `HK.PALM.V1.T3.WE.01`, `HK.PALM.V1.T3.WE.02`, `HK.PALM.V1.T3.WE.03`, `HK.PALM.V1.T3.WE.04`
- safe_reading: Origin shows source of momentum; ending shows how a domain releases or completes its expression.
- guard: no exact date or deterministic outcome.

### HK.PALM.V1.OVL.20 - Line Density Expanded

- source_id: `HK.PALM.V1.OVL.20`
- match_type: two-school plus western support
- evidence_sources: `HK.PALM.V1.T2.05`, `HK.PALM.V1.FEAT.PALM.02`, `HK.PALM.V1.T3.CN.10`, `HK.PALM.V1.T3.IN.11`, `HK.PALM.V1.T3.WE.09`
- safe_reading: Many small lines suggest sensitivity, mental load, or scattered attention; very few lines suggest directness or need for external structure.
- guard: first check photo clarity.

## 7. Matrix Additions

### HK.PALM.V1.MATRIX.37 - Line Depth As Strength Of Expression

- match_type: triple-direct
- linked_overlap: `HK.PALM.V1.OVL.12`
- common prediction: deep/clear line means the domain is easier to express; shallow/faint line means the domain needs support before it becomes reliable.
- expanded Sifu meaning: "ถ้าเส้นเรื่องใดลึกและเรียบ ให้พูดว่าเรื่องนั้นมีช่องพลังชัด ใช้ได้ต่อเนื่อง ถ้าเส้นจาง ให้แนะนำสร้างระบบพยุง เช่น ตาราง งานซ้ำ วินัย หรือคนช่วย"
- use in topics: A/B/C/D/E/H.
- guard: no value judgment.

### HK.PALM.V1.MATRIX.38 - Continuity As Life Rhythm

- match_type: triple-direct
- linked_overlap: `HK.PALM.V1.OVL.13`
- common prediction: continuous line suggests steady rhythm; interrupted line suggests a point requiring adjustment.
- expanded Sifu meaning: "เส้นต่อเนื่องคือจังหวะไหล ถ้าเส้นสะดุดให้พูดถึงการเปลี่ยนวิธี ไม่ใช่เคราะห์ตายตัว"
- use in topics: B/C/E/G/H.
- guard: no death, illness, accident, divorce, or exact timing.

### HK.PALM.V1.MATRIX.39 - Islands As Stuck Pockets

- match_type: triple-analog, western-explicit
- linked_overlap: `HK.PALM.V1.OVL.14`
- common prediction: island indicates a pocket of stuck or diffused energy in the affected domain.
- expanded Sifu meaning: "เกาะบนเส้นงานคือเรื่องค้าง/แรงกดดันในงาน เกาะบนเส้นสมองคือภาระคิด เกาะบนเส้นหัวใจคืออารมณ์ค้าง ต้องแปลเป็นเรื่องที่คลี่ด้วยระบบและการพัก"
- use in topics: B/C/E/G/H.
- guard: no illness claim.

### HK.PALM.V1.MATRIX.40 - Chains As Repeated Small Pressure

- match_type: triple-analog, western-explicit
- linked_overlap: `HK.PALM.V1.OVL.15`
- common prediction: chained line indicates repeated small disturbances, sensitivity, or unstable rhythm.
- expanded Sifu meaning: "เส้นลูกโซ่คือเรื่องนั้นถูกรบกวนบ่อย ทำหลายรอบกว่าจะนิ่ง จึงควรใช้ checklist, boundary, และรอบพัก"
- use in topics: B/C/E/H.
- guard: do not shame sensitivity.

### HK.PALM.V1.MATRIX.41 - Forks And Splits As Dual Direction

- match_type: triple-analog weak, western-explicit
- linked_overlap: `HK.PALM.V1.OVL.16`
- common prediction: fork/split indicates dual interest, branching direction, or need to integrate two paths.
- expanded Sifu meaning: "ปลายเส้นแยกคือทางเลือกสองด้าน ถ้าอยู่เส้นสมองคือคิดได้หลายมุม ถ้าอยู่เส้นหัวใจคือความคาดหวังสองแบบ ถ้าอยู่เส้นงานคือบทบาทหรือเส้นทางงานสองทาง"
- use in topics: A/C/E/G/H.
- guard: no deterministic separation or breakup.

### HK.PALM.V1.MATRIX.42 - Branch Direction As Growth Or Leakage

- match_type: upward=two-school, downward=school-specific-west with analog caution
- linked_overlap: `HK.PALM.V1.OVL.17`
- common prediction: upward branches show improvement effort; downward branches show leakage, distraction, or burden.
- expanded Sifu meaning: "กิ่งขึ้นคือจังหวะยกระดับ ต้องตั้ง milestone ให้เห็นผล กิ่งลงคือพลังไหลออก ต้องปิดรูรั่ว เช่น เวลา เงิน อารมณ์ หรือคนที่ดึงแรง"
- use in topics: B/C/D/F/G/H.
- guard: no promotion or loss guarantee.

### HK.PALM.V1.MATRIX.43 - Crossings As Colliding Forces

- match_type: triple-analog
- linked_overlap: `HK.PALM.V1.OVL.18`
- common prediction: crossing shows two forces meeting and requiring decision.
- expanded Sifu meaning: "เส้นตัดไม่ใช่ร้ายเสมอ แต่คือจุดที่แรงสองทางชนกัน ต้องดูว่าเส้นไหนถูกตัดและหนักแค่ไหน แล้วแปลเป็นการจัดลำดับหรือวางขอบเขต"
- use in topics: B/C/E/G/H.
- guard: no fear language.

### HK.PALM.V1.MATRIX.44 - Line Origin And Endpoint

- match_type: triple-analog, western-explicit detail
- linked_overlap: `HK.PALM.V1.OVL.19`
- common prediction: starting point reveals source of momentum; ending point reveals how a domain resolves or expresses.
- expanded Sifu meaning: "จุดเริ่มเส้นงานจากเส้นชีวิตเน้นสร้างเองหรือครอบครัวช่วย จุดเริ่มจากจันทร์/ขอบมือเน้นลูกค้า คนไกล เครือข่าย จุดจบของเส้นสมอง/หัวใจช่วยแปลวิธีคิดและความรัก"
- use in topics: A/C/D/E/F/G.
- guard: label Western when using exact Western line-origin vocabulary.

### HK.PALM.V1.MATRIX.45 - Line Density As Load Or Simplicity

- match_type: two-school plus western support
- linked_overlap: `HK.PALM.V1.OVL.20`
- common prediction: dense minor lines show high input load; sparse lines show directness or need for structure.
- expanded Sifu meaning: "เส้นย่อยมากคือรับข้อมูลและความรู้สึกเยอะ เงิน งาน และความรักจึงต้องมีขอบเขต เส้นน้อยคือเดินตรงแต่ต้องมีระบบภายนอกช่วยเก็บรายละเอียด"
- use in topics: A/B/D/E/H.
- guard: first verify the image is not washed out or blurred.

## 8. Mandatory A-H Topic Contract

### HK.PALM.V1.TOPIC.CONTRACT.01 - A-H Must Be Complete

- source_id: `HK.PALM.V1.TOPIC.CONTRACT.01`
- tier: runtime-contract
- rule: AI Sifu must output all eight A-H sections in order, even when confidence is low.
- topic_source_ids:
  - A personality: `HK.PALM.V1.MATRIX.29`
  - B energy_stress: `HK.PALM.V1.MATRIX.30`
  - C career: `HK.PALM.V1.MATRIX.31`
  - D money: `HK.PALM.V1.MATRIX.32`
  - E relationship: `HK.PALM.V1.MATRIX.33`
  - F supporters: `HK.PALM.V1.MATRIX.34`
  - G turning_points: `HK.PALM.V1.MATRIX.35`
  - H personal_advice: `HK.PALM.V1.MATRIX.36`
- safe_reading: A-H completeness is not permission to invent evidence. Weak evidence sections must state what is missing and give advice from visible evidence plus topic-level matrix only.
- guard: no omitted sections, no merged sections, no empty advice.

### HK.PALM.V1.TOPIC.CONTRACT.02 - Expanded Topic Routing

- source_id: `HK.PALM.V1.TOPIC.CONTRACT.02`
- A personality: use hand form, finger length/shape, thumb, head line, texture, density, `MATRIX.37`, `MATRIX.41`, `MATRIX.44`, `MATRIX.45`.
- B energy_stress: use life/foundation line, texture/color if reliable, chains/islands, line density, downward branches, `MATRIX.37`, `MATRIX.38`, `MATRIX.39`, `MATRIX.40`, `MATRIX.42`, `MATRIX.45`.
- C career: use fate/work verticality, head line, thumb, upward branches, Sun/Mercury if Western, triangles/squares, `MATRIX.41`, `MATRIX.42`, `MATRIX.44`.
- D money: use work-line quality, Mercury/business, Sun/recognition, fish/triangle/square, upward/downward branches, texture, density, `MATRIX.37`, `MATRIX.42`, `MATRIX.45`.
- E relationship: use heart line depth/curve/endpoint, Venus/warmth if Western-labeled, finger spacing, chains/islands/forks/crossings, `MATRIX.37`, `MATRIX.38`, `MATRIX.39`, `MATRIX.40`, `MATRIX.41`, `MATRIX.43`, `MATRIX.44`.
- F supporters: use fate origin, Moon/outer influence if Western-labeled, fish/support marks, square/protection, upward branches, `MATRIX.42`, `MATRIX.44`.
- G turning_points: use breaks, cuts, islands/chains ending, forks, branch direction, crossings, line origin/direction changes, `MATRIX.38`, `MATRIX.39`, `MATRIX.40`, `MATRIX.41`, `MATRIX.42`, `MATRIX.43`, `MATRIX.44`.
- H personal_advice: convert the strongest visible modifier into one action: stabilize rhythm, reduce leakage, choose one path, clarify boundaries, build visible milestones, or ask for support.
- guard: if evidence is missing, say "จากภาพยังยืนยันไม่ได้" for the missing feature, but still provide safe practical advice grounded in confirmed features.

