# Hourkey Palm Canon v1.0 Source Map

This file defines source IDs used by Hourkey Palm Canon v1.0.

## Source Reliability Classes

- `verified-local`: OCR/text exists locally and was inspected.
- `verified-web`: source page or scan locator was checked online.
- `source-note`: project source-hunt note identifies the source, but runtime has no clean local OCR.
- `bibliographic`: useful for future acquisition only.
- `derived-summary`: Hourkey synthesis from cited sources; not a verbatim ancient text.

## Chinese Sources

### CN.GJTSJC.WS640

- title: 《欽定古今圖書集成》博物彙編 藝術典 第640卷
- class: verified-web
- locator: `https://zh.wikisource.org/zh-hant/欽定古今圖書集成/博物彙編/藝術典/第640卷`
- relevance: lists and preserves 相術部 material including 《神相全編十》, 論手, 玉掌圖, 相手, 許負相手篇, 論掌紋, 相指掌, 相氣色.
- use: source locator and vocabulary authority for Chinese palm sections.
- caution: Wikisource text should be checked against scan when exact wording matters.

### CN.SXQB.NLC

- title: 《神相全編》
- class: verified-web/source-note
- locator: `https://commons.wikimedia.org/wiki/File:NLC416-13jh001662-59167_神相全編.pdf`
- alternate locator: `https://ctext.org/wiki.pl?chapter=905153&if=gb`
- relevance: broad Chinese physiognomy collection including hand sections.
- use: Chinese line vocabulary, palm signs, qi-color, hand/finger language.
- caution: ctext is a lookup/collation locator only. Do not bulk-download. For runtime, use paraphrased rules unless local OCR is prepared.

### CN.MYXF.NLC

- title: 《麻衣相法》
- class: verified-web/source-note
- locator: Wikimedia Commons category/files `NLC416-12jh002690-44091` and `NLC416-12jh002690-44092`
- relevance: major Chinese physiognomy text with hand sections.
- use: Chinese cross-check for hand, palm, and line vocabulary.
- caution: multiple recensions; do not overclaim exact source without page check.

### CN.LZXF.NLC

- title: 《柳莊相法》
- class: verified-web/source-note
- locator: `https://commons.wikimedia.org/wiki/File:NLC416-13jh001257-42702_柳莊相法.pdf`
- alternate locator: `https://ctext.org/wiki.pl?chapter=734947&if=gb`
- relevance: Chinese physiognomy, includes body/hand sign material and bagua-style mapping in project notes.
- use: Chinese-only region and qi-color support.
- caution: use only as T3-cn until exact hand passages are locally OCR-verified.

## Indian Sources

### IN.BS.KERN.1865

- title: The Brihat Samhita of Varaha Mihira, H. Kern edition, 1865
- class: verified-web
- locator: `https://archive.org/details/wg1077`
- relevance: public-domain Sanskrit witness for Varahamihira's encyclopedic omen/physiognomy tradition.
- use: bibliographic anchor for Brihat Samhita.
- caution: r470 does not import this OCR; use as locator.

### IN.BS.SURKANT.LOCAL

- title: Brihat Samhita, Surkant Jha Hindi/Sanskrit OCR
- class: verified-local
- local path: `/root/decode-app/private/restricted-sources/vedic/public-domain/BrihatSamhitaDr.SurkantJha__brihat-samhita-surkant-jha_djvu.txt`
- relevance: inspected local OCR index includes hand/palm/wrist/finger/marks sections such as हस्त, करतल, मणिबन्ध, मीन, त्रिकोण, ऊर्ध्व रेखा.
- use: Indian Samudrika operational witness.
- caution: modern edition/commentary; avoid verbatim long text without copyright and scan check.

### IN.BS.DLI.LOCAL

- title: Brihat Samhita DLI OCR
- class: verified-local
- local path: `/root/decode-app/private/restricted-sources/vedic/public-domain/in.ernet.dli.2015.351583__2015.351583.Brihat-Samhita_djvu.txt`
- relevance: second witness, lower OCR quality.
- use: cross-check only.
- caution: do not quote without scan verification.

### IN.BHAVA.KUTUHALA.IZKQ

- title: Bhava Kutuhala, Mahidhari Bhasha Tika witness
- class: verified-local
- local path: `/root/decode-app/private/restricted-sources/vedic/public-domain/izkq_bhava-kutuhala-mahidhari-bhasha-tika-commentator-mahidhar-sharma-sanskrit-a__Bhava-Kutuhala-Mahidhari-Bhasha-Tika-Commentator-Mahidhar-Sharma-Sanskrit-And-Hindi-Jyotish-Illustrated-Missing-Pages-Te_djvu.txt`
- relevance: local OCR contains sāmudrika-like hand/foot sign material and marks.
- use: Indian signs, upward lines, barley/yava, auspicious marks.
- caution: OCR and edition must be checked for verbatim.

### IN.BHAVA.KUTUHALA.OFDC

- title: Bhava Kutuhala of Ganaka Jivanath with Bhasha commentary, 1966 witness
- class: verified-local
- local path: `/root/decode-app/private/restricted-sources/vedic/public-domain/ofdc_bhava-kutuhala-of-ganaka-jivanath-with-bhasha-commentary-1966-kshem-raj-sri-kris__Bhava-Kutuhala-Of-Ganaka-Jivanath-With-Bhasha-Commentary-1966-Kshem-Raj-Sri-Krishna-Das-Shreshti,-Mumbai_djvu.txt`
- relevance: second local witness for hand lines and sāmudrika sections.
- use: cross-check Indian-specific signs.
- caution: modern print; no verbatim in runtime canon.

### IN.SAMUDRIKA.MSS

- title: Samudrika manuscript group
- class: bibliographic
- locators: archive.org manuscript records and DAV Chandigarh Samudrikam noted in project source hunt.
- relevance: future primary source expansion.
- use: not runtime source until local OCR is added.
- caution: do not cite as evidence for a rule until verified.

## Runtime Evidence Alias Map

These aliases are not separate books. They are compact runtime evidence handles used by the canon rules so AI Sifu can cite a precise evidence family without mixing school ontologies.

### Chinese Evidence Aliases

- `CN.LINE.3CORE`: mapped to `CN.GJTSJC.WS640`, `CN.SXQB.NLC`; use for Chinese main line axes such as 天紋/人紋/地紋.
- `CN.LINE.QUALITY`: mapped to `CN.GJTSJC.WS640`, `CN.SXQB.NLC`; use for clear/deep/fine versus shallow/rough/confused lines.
- `CN.LINE.BROKEN`: mapped to `CN.SXQB.NLC`; use for broken/scattered/cut line patterns.
- `CN.LINE.DENSITY`: mapped to `CN.GJTSJC.WS640`, `CN.SXQB.NLC`; use for too many/few small lines and ordered/disordered line field.
- `CN.FINGER.LENGTH`: mapped to `CN.GJTSJC.WS640`, `CN.SXQB.NLC`, `CN.MYXF.NLC`; use for hand/finger form.
- `CN.PALM.TEXTURE`: mapped to `CN.GJTSJC.WS640`, `CN.SXQB.NLC`; use for palm softness/roughness/fineness.
- `CN.COLOR.QISE`: mapped to `CN.GJTSJC.WS640`, `CN.SXQB.NLC`, `CN.LZXF.NLC`; use for 氣色 only when photo color is reliable.
- `CN.MARKS`: mapped to `CN.GJTSJC.WS640`, `CN.SXQB.NLC`; use for Chinese marks generally.
- `CN.MARK.FISH`: mapped to `CN.GJTSJC.WS640`, `CN.SXQB.NLC`; use for 魚紋.

### Indian Evidence Aliases

- `IN.LINE.3FIRST`: mapped to `IN.BS.SURKANT.LOCAL`, `IN.BHAVA.KUTUHALA.IZKQ`; use for foundational palm lines.
- `IN.LINE.QUALITY`: mapped to `IN.BS.SURKANT.LOCAL`, `IN.BS.DLI.LOCAL`; use for clear/deep/ordered line quality.
- `IN.LINE.BREAKCUT`: mapped to `IN.BS.SURKANT.LOCAL`; use for cut/broken line caution.
- `IN.LINE.DENSITY`: mapped to `IN.BS.SURKANT.LOCAL`, `IN.BS.DLI.LOCAL`; use for many/few line density framing.
- `IN.LINE.UPWARD`: mapped to `IN.BHAVA.KUTUHALA.IZKQ`, `IN.BHAVA.KUTUHALA.OFDC`; use for upward-line rules.
- `IN.PALM.TEXTURE_COLOR`: mapped to `IN.BS.SURKANT.LOCAL`, `IN.BS.DLI.LOCAL`; use for texture/color symbolic vitality.
- `IN.FINGER.LENGTH`: mapped to `IN.BS.SURKANT.LOCAL`, `IN.BS.DLI.LOCAL`; use for finger-form rules.
- `IN.SYMBOL.SACRED`: mapped to `IN.BS.SURKANT.LOCAL`, `IN.BHAVA.KUTUHALA.IZKQ`, `IN.BHAVA.KUTUHALA.OFDC`; use for sacred auspicious symbols.
- `IN.MARK.FISH`: mapped to `IN.BS.SURKANT.LOCAL`, `IN.BHAVA.KUTUHALA.IZKQ`; use for matsya/fish.
- `IN.MARK.TRIANGLE`: mapped to `IN.BS.SURKANT.LOCAL`; use for triangle.

### Western Evidence Aliases

- `WE.LINE.MAJOR4`: mapped to `WE.BENHAM.1900`, `WE.CHEIRO.LOH`, `WE.CHEIRO.PFA.1916`; use for Life/Head/Heart/Fate major-line frame.
- `WE.LINE.QUALITY`: mapped to `WE.BENHAM.1900`, `WE.CHEIRO.LOH`; use for depth, continuity, breaks, chains, islands, forks.
- `WE.LINE.FATE`: mapped to `WE.BENHAM.1900`, `WE.CHEIRO.LOH`; use for Fate/Saturn/work-line readings.
- `WE.BRANCH.UPWARD`: mapped to `WE.BENHAM.1900`, `WE.CHEIRO.LOH`; use for upward branches.
- `WE.PALM.TEXTURE`: mapped to `WE.BENHAM.1900`, `WE.CHEIRO.LOH`, `WE.SAINTGERMAIN.1897`; use for texture and firmness.
- `WE.FINGER.PROPORTION`: mapped to `WE.BENHAM.1900`, `WE.CHEIRO.LOH`, `WE.SAINTGERMAIN.1897`; use for fingers/thumb/hand form.
- `WE.MARKS`: mapped to `WE.BENHAM.1900`, `WE.CHEIRO.LOH`, `WE.SAINTGERMAIN.1897`; use for Western marks generally.
- `WE.MARK.CROSS`: mapped to `WE.BENHAM.1900`, `WE.CHEIRO.LOH`, `WE.SAINTGERMAIN.1897`; use for cross/crossing logic.

Alias guard: aliases inherit the reliability class of their mapped sources. Chinese and Western aliases are not verified-local in this release; Indian aliases have local OCR witnesses where their mapped source is `verified-local`.

## Mesopotamian / Babylonian Sources

### MESO.ALAMDIMMU.BOECK.2000

- title: Barbara Boeck, Die babylonisch-assyrische Morphoskopie, 2000
- class: bibliographic / critical-edition anchor
- locator: `https://cdli.earth/publications/164591`
- relevance: source anchor for Alamdimmu as Babylonian-Assyrian physiognomic omen literature.
- use: source-map authority only unless exact passages are locally acquired.
- caution: do not quote or derive precise hand rules without passage inspection.

### MESO.BOECK.OIS6.2010

- title: Barbara Boeck, "Physiognomy in Ancient Mesopotamia and Beyond: From Practice to Handbook"
- class: verified-web
- locator: `https://isac.uchicago.edu/sites/default/files/uploads/shared/docs/ois6.pdf`
- relevance: academic overview of Mesopotamian physiognomy as sign-interpretation handbook material.
- use: historical frame for Alamdimmu and physiognomic omens.
- caution: not a palm-line manual.

### MESO.ZYSK.OAPEN.2016

- title: Kenneth Zysk, "Mesopotamian and Indian physiognomy"
- class: verified-web
- locator: `https://library.oapen.org/bitstream/20.500.12657/23215/1/1006939.pdf`
- alternate locator: `https://archive.org/stream/dli.doa.078/078_djvu.txt`
- relevance: compares Mesopotamian and Indian physiognomy; discusses blemishes, body lines, lines on the forehead, lines on hands, and later Indian palm/sole transmission.
- use: strongest support for body-line / hand-line historical layer and Mesopotamia-India parallel.
- caution: does not prove a one-to-one identity between Babylonian omens and later palmistry systems.

### MESO.CAMS.P348742

- title: CAMS/GKAB P348742, SpTU 4, 149 / W 23286, "Summa sinnistu qaqqada rabat 4"
- class: verified-web / local-shell-verified
- locator: `https://oracc.museum.upenn.edu/cams/gkab/P348742`
- relevance: Oracc CAMS/GKAB female physiognomic omen witness with direct hand-feature material, including lines on hands, fingers, fingernails, and hand veins.
- use: direct source-map support that Alamdimmu-related material includes hand-line and hand-feature signs.
- caution: gendered/female subseries and omen apodoses are not runtime law; do not output raw claims about widowhood, sorcery, poverty, lifespan, or fate.

### MESO.EBL.ND4405.10

- title: eBL ND.4405.10, Summa liptu witness
- class: agent-audited eBL/CDLI locator
- locators: `https://www.ebl.lmu.de/library/ND.4405.10`, `https://www.ebl.lmu.de/api/fragments/ND.4405.10`, `https://cdli.earth/P363490`, `https://oracc.museum.upenn.edu/cams/gkab/P363490/`
- relevance: source witness for a mark over or on fingers, using finger vocabulary such as SU.SI / ubanu and urashu-mark context.
- use: support for visible finger-mark tagging only.
- caution: not palm-line evidence; do not map to palm mounts, Life/Head/Heart/Fate, or timing.

### MESO.EBL.BM45886

- title: eBL BM.45886, Summa liptu parallel
- class: agent-audited eBL/CDLI locator
- locators: `https://www.ebl.lmu.de/library/BM.45886`, `https://www.ebl.lmu.de/api/fragments/BM.45886`, `https://cdli.earth/P558389`
- relevance: parallel witness for finger marks with SU.SI-MES and urashu/IB context, though damaged.
- use: secondary support for visible finger-mark tagging.
- caution: fragmentary; do not use as standalone palm interpretation.

### MESO.EBL.K105

- title: eBL K.105, Alamdimmu broad/ahu witness
- class: agent-audited eBL/CDLI locator
- locators: `https://www.ebl.lmu.de/library/K.105`, `https://www.ebl.lmu.de/api/fragments/K.105`, `https://cdli.earth/P393755`
- relevance: source witness for fingers of both hands and finger/interdigital morphology.
- use: support for visible finger proportion, spacing, and morphology as body-feature context.
- caution: not palm-line or mount doctrine.

### MESO.EBL.BM35173

- title: eBL BM.35173, Summa sinnistu witness
- class: agent-audited eBL/CDLI locator
- locators: `https://www.ebl.lmu.de/library/BM.35173`, `https://www.ebl.lmu.de/api/fragments/BM.35173`, `https://cdli.earth/P562696`
- relevance: source witness with finger, nail/supru, and skin-mark/umsatu material in a female physiognomic context.
- use: support for visible fingers, nails, and hand-area mark caution.
- caution: gendered body-sign material; do not turn into modern palm-line rules.

### MESO.EBL.BM69492

- title: eBL BM.69492, Summa sinnistu witness
- class: agent-audited eBL/CDLI locator
- locators: `https://www.ebl.lmu.de/library/BM.69492`, `https://www.ebl.lmu.de/api/fragments/BM.69492`, `https://cdli.earth/P480099`
- relevance: source witness for fingers of both hands, with nearby toe material that must remain separated.
- use: support for hand-finger context only when locus explicitly indicates hands.
- caution: do not import toe/foot lines into palm reading.

### MESO.EBL.BM35499.BM39079

- title: eBL BM.35499 and BM.39079, Summa sinnistu witnesses
- class: agent-audited eBL/CDLI locator
- locators: `https://www.ebl.lmu.de/library/BM.35499`, `https://cdli.earth/P562765`, `https://www.ebl.lmu.de/library/BM.39079`, `https://cdli.earth/P564201`
- relevance: source witnesses for body marks/umsatu and nail/supru material.
- use: support for nail and clear skin-mark caution only.
- caution: palm surface and named palm lines are not directly established by these witnesses.

### MESO.BOECK.SEFARAD.2004

- title: Barbara Boeck, "Weitere Texte physiognomischen Inhalts", Sefarad 64.2, 2004
- class: source-note
- locator: `https://sefarad.revistas.csic.es/index.php/sefarad/article/view/518`
- relevance: noted source for additional physiognomic texts and hand-area skin-mark material.
- use: future verification of hand/wrist/finger mark passages.
- caution: do not use operationally until exact passage/scan is inspected.

### MESO.BOECK.SEFARAD.2002

- title: Barbara Boeck, "Physiognomie und Schicksal?", Sefarad 62.2, 2002
- class: source-note
- locator: `https://sefarad.revistas.csic.es/index.php/sefarad/article/view/557`
- relevance: context for social use of Alamdimmu-style physiognomy.
- use: historical context only.
- caution: not palm-runtime material.

### MESO.FINCKE.KASKAL.2025

- title: Jeanette C. Fincke, "One Joined Cuneiform Tablet and Two New Names for Parts of the Human Body"
- class: verified-web
- locator: `https://edizionicafoscari.unive.it/editorial-files/journals/000028/2025/000724/ef_art_002446_kaskal_2_2025_fincke_28677_2026-03-17_14-05-20.html`
- relevance: publishes joins to an umsatu skin-mark tablet of the Alamdimmu series and demonstrates body-part sequencing and right/left/top/bottom location logic.
- use: supports "location first, interpretation second" and the guard against reading skin marks medically or deterministically.
- caution: mostly face/body/arm material; do not import as palm-line doctrine.

### MESO.SCHMIDTCHEN.UPLOPEN.2018

- title: Eric Schmidtchen, "Esagil-kin-apli's Catalogue of Sakikku and Alamdimmu"
- class: verified-web
- locator: `https://uplopen.com/chapters/e/10.1515/9781501504914-007`
- relevance: peer-reviewed open-access catalogue chapter for Sakikku and Alamdimmu.
- use: source-map support for the Alamdimmu series/corpus frame.
- caution: catalogue/corpus frame only, not a direct palm-reading rule.

### MESO.BM.38597

- title: British Museum 38597, Alamdimmu physiognomic omen commentary tablet
- class: verified-web
- locator: `https://www.britishmuseum.org/collection/object/W_1880-1112-481`
- relevance: object record for a Late Babylonian clay tablet described as commentary; physiognomic omens; Alamdimmu; colophon.
- use: artifact locator proving corpus/commentary material exists.
- caution: no operational rule without transliteration/translation check.

### MESO.CCP.P461206

- title: CCP 3.7.2.K - Alamdimmu K
- class: verified-web
- locator: `https://ccp.yale.edu/P461206`
- relevance: Cuneiform Commentaries Project record for a likely physiognomic commentary/base text connected to Alamdimmu.
- use: support for commentary tradition and body-feature interpretation.
- caution: fragmentary and partly uncertain.

### MESO.CCP.P394084

- title: CCP 3.7.2.E - Alamdimmu E
- class: verified-web
- locator: `https://ccp.yale.edu/P394084`
- relevance: Cuneiform Commentaries Project record for a physiognomic omen commentary from Ashurbanipal's libraries, with examples of physical feature explanation.
- use: supports the "exact visible feature first" rule.
- caution: examples are body/feet material; do not import as palm doctrine.

### MESO.CAMS.GKAB.P348743

- title: CAMS/GKAB P348743, Alamdimmu 06
- class: source-note / verified-web locator
- locator: `https://oracc.museum.upenn.edu/cams/gkab/P348743`
- relevance: Oracc CAMS/GKAB locator for Alamdimmu 06.
- use: future local acquisition and verification.
- caution: not used as direct runtime evidence until locally inspected.

### Mesopotamian Evidence Aliases

- `MESO.PHYSIOGNOMY.ALAMDIMMU`: mapped to `MESO.ALAMDIMMU.BOECK.2000`, `MESO.BOECK.OIS6.2010`, `MESO.SCHMIDTCHEN.UPLOPEN.2018`, `MESO.BM.38597`, `MESO.CCP.P461206`, `MESO.CCP.P394084`, `MESO.CAMS.P348742`; use for the broad physiognomic omen frame.
- `MESO.LINE.BODY_HAND`: mapped to `MESO.ZYSK.OAPEN.2016`, `MESO.CAMS.P348742`; use for historical support that body lines and hand lines were sign material.
- `MESO.HAND.FEATURES`: mapped to `MESO.CAMS.P348742`, `MESO.EBL.K105`, `MESO.EBL.BM35173`, `MESO.EBL.BM69492`; use for source-map support that fingers, fingernails, hand veins, and hand-line features occur in witnesses.
- `MESO.FINGER.MARKS`: mapped to `MESO.EBL.ND4405.10`, `MESO.EBL.BM45886`, `MESO.EBL.BM35173`; use for finger marks only, not palm lines.
- `MESO.NAIL.MARKS`: mapped to `MESO.EBL.BM35173`, `MESO.EBL.BM35499.BM39079`; use for nail/visible hand-area mark caution only.
- `MESO.MARKS.BLEMISH`: mapped to `MESO.ZYSK.OAPEN.2016`, `MESO.FINCKE.KASKAL.2025`, `MESO.BOECK.SEFARAD.2004`, `MESO.CCP.P461206`, `MESO.CCP.P394084`; use for marks/blemishes as location modifiers only, never as medical or fate claims.
- `MESO.SIDE.LOCATION`: mapped to `MESO.ZYSK.OAPEN.2016`, `MESO.FINCKE.KASKAL.2025`; use for side/location context only.
- `MESO.COMMENTARY.FEATURE`: mapped to `MESO.CCP.P461206`, `MESO.CCP.P394084`; use for exact feature identification before interpretation.

Mesopotamian alias guard: all MESO aliases are support-only. They must not create a strong prediction without Chinese/Indian/Western palm evidence.

## Western Sources

### WE.BENHAM.1900

- title: William G. Benham, The Laws of Scientific Hand Reading, 1900
- class: verified-web
- locator: `https://archive.org/details/in.ernet.dli.2015.200302`
- relevance: detailed Western system of hand form, lines, mounts, signs.
- use: Western-specific line/mount/mark rules.
- caution: use 1900 scan, not modern reprints.

### WE.CHEIRO.LOH

- title: Cheiro, The Language of the Hand, 1898/1900
- class: verified-web
- locators: `https://archive.org/details/cheiroslanguageo00hamo`, `https://archive.org/details/cheiroslanguageo00chei_1`
- relevance: major Western palmistry vocabulary, lines, mounts, marks.
- use: Western cross-check.
- caution: later Cheiro works require copyright review.

### WE.CHEIRO.PFA.1916

- title: Cheiro, Palmistry for All, 1916
- class: verified-web
- locator: `https://www.gutenberg.org/ebooks/20480`
- relevance: public-domain Western palmistry guide.
- use: support for basic Western reading.
- caution: do not let accessible style override source hierarchy.

### WE.DESBARROLLES.1862

- title: Desbarrolles, Les Mysteres de la main, 1862
- class: verified-web/source-note
- locator: `https://archive.org/details/b28097750`
- relevance: French Western root text.
- use: Western historical cross-check.
- caution: not primary runtime text in v1.0.

### WE.SAINTGERMAIN.1897

- title: C. de Saint-Germain, Practical Palmistry / Hand Reading Simplified, 1897
- class: verified-web
- locator: `https://archive.org/details/practicalpalmist00sain`
- relevance: practical Western palmistry.
- use: Western cross-check.
- caution: archive notes damaged/missing pages; do not rely on missing passages.

## Derived Sources

### HK.PALM.FUSION.20260707

- title: Palmistry Fusion Canon, initial Hourkey synthesis
- class: derived-summary
- local path: `data/library/palmistry/palmistry-fusion-canon.md`
- relevance: first operational summary of cross-civilization rules.
- use: backward-compatible T1/T2/T3 bridge.
- caution: superseded by v1.0 where rules conflict.
