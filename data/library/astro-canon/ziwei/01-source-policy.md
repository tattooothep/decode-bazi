# Zi Wei Dou Shu · source authority and compact guards

Primary source:
- 紫微斗數全書, Wikisource transcription, public-domain classical base and clean text witness.
- Internet Archive OCR of 新鋟希夷陳先生紫微斗數全書 is retained as a scan/OCR witness for collation.
- National Archives of Japan scan 新鋟希夷陳先生紫微斗数全書 is used as scan authority.
- ctext, Kanripo, and Wikisource witnesses for 續道藏《紫微斗數》三卷 are retained in the private source manifest as public-domain/source-audit support.
- Commons/National Library of China scan `華山陳希夷先生飛星紫微斗數原旨` is retained under `private/restricted-sources/ziwei/originals/commons-NLC416-12jh004539-48693/` as a public-domain scan witness for 飛星/斗數觀測錄 lineage. It has no usable local text layer yet, so it is source-audit/collation evidence only, not a clean runtime rule source.
- Commons/National Digital Library of Korea scan `紫微斗數方書` is retained under `private/restricted-sources/ziwei/originals/commons-CNTS-00047996572/` as a public-domain manuscript scan witness for the Korean 紫微斗數方書 / 비전자미 transmission line. It has no usable local text layer yet, so it is source-audit/collation evidence only, not a clean runtime rule source.
- Shuge access copy is navigation support only.

Collation policy:
- 紫微斗數全集 and 紫微斗數捷覽 are bibliographic/collation targets until an open institutional scan is verified.
- 續道藏《紫微斗數》三卷 is now a verified related lineage from ctext/正統道藏. Use it as source context for reading order, limit/year emphasis, and 十八飛星 vocabulary only.
- Do not mix 續道藏 placement algorithms into the current 14-main-star engine unless packet labels that lineage. The ctext overview itself notes this Daoist Canon text differs from modern circulating 紫微斗數 in star names and chart method.
- When Wikisource, ctext, Kanripo, and IA witnesses disagree, treat the engine packet as calculation authority and use the witnesses only to refine reading order, terminology, and risk wording.
- Modern licensed-collation OCR witnesses (南北山人, 大德山人, 顧祥弘, 潘子漁, 梁湘潤, charting/flying-star manuals) are retained as `licensed_incoming`, not as public-domain text. Use only derived operational rules from `07-modern-licensed-collation-rules.md` to sharpen topic-first specificity, 飛星/四化 direction, case-style reasoning, pair weighting, and timing discipline.
- `08-quanshu-limit-special-rules.md` is a derived public-domain operating summary from `紫微斗數全書` timing/special-judgment chapters. Use it to sharpen 大限/二限/太歲/童限/煞曜 timing answers, with production safety wording instead of fatalistic claims.
- Do not quote, cite, name, reconstruct, or expose the modern licensed witnesses in user-facing answers. They are internal rule support only.
- Do not claim `華山陳希夷先生飛星紫微斗數原旨` has been OCR-ingested until a reliable vertical-Chinese OCR/proofread text is promoted into the manifest.
- Do not claim `紫微斗數方書` has been OCR-ingested until a reliable manuscript OCR/proofread text is promoted into the manifest.

## Packet-first rule
Use only engine-supplied palaces, stars, brightness, four transformations, ten-year luck, annual fields, and timing fields. Do not 安星 inside the AI response.

## Pair / two-chart packet rule
For two-chart questions, use only `PAIR_INTERACTION_PACKET ziwei` for cross-chart claims:
- 命宮 and 身宮 branch relation,
- each person's 夫妻宮 relation to the other person's 命宮,
- cross-location of each person's 四化 stars in the other chart,
- focal palace star overlaps,
- supplied 大限 windows.

Do not invent cross-palace reactions, star meetings, or four-transformation effects that are not listed in the pair packet. A missing field means unavailable, not permission to calculate inside AI.

## Four transformations 四化
祿, 權, 科, 忌 are not generic good/bad labels. Read:
- which star transforms,
- which palace receives it,
- whether it touches 命宮, 三方四正, the asked palace, 大限, or 流年,
- whether 化忌 is tied by palace relation or only remote.

化祿: flow/gain/desire.
化權: authority/action/pressure to control.
化科: name, protection, formal recognition.
化忌: attachment, blockage, debt, worry, or the place where attention sticks.

Do not override the packet's four-transformation mapping; current engine mapping must stay aligned with `src/lib/astro/ziwei/tables.ts`.

## Twelve palaces 十二宮
Read each palace by:
1. palace role,
2. main stars and brightness,
3. assistant/malefic stars,
4. four transformations in or toward the palace,
5. opposite palace 對宮,
6. 三方四正.

The palace alone is never enough; always cross-check the opposite and triad palaces when packet supplies them.

## Timing 大限 / 流年
大限 is the ten-year stage. It modifies how natal promise manifests, not a replacement for natal structure.
流年/太歲 shows the yearly trigger. Stronger judgment needs:
- natal palace,
- ten-year palace,
- annual palace,
- annual transformations,
- 三方四正 relation.

If annual fields are not supplied, say year-level timing is unavailable.

續道藏 guard: this lineage explicitly stresses 運限 and 流年星宮 in its reading order. Therefore, if the packet supplies 大限四化, 流年四化, 流月四化, 流日四化, or corresponding 流曜, the AI must use them. If 流月/流日 is absent, do not infer month/day timing from the Daoist Canon notes.

## Minor-star reminders
Use only if packet supplies the star:
- 天刑: rules, punishment, surgery/cutting, discipline; can protect when cleanly placed but hurts when tied to 化忌 or malefics.
- 天姚: charm, desire, attraction, social/romantic pull.
- 天哭/天虛: grief, emptiness, worry, emotional drain; not always disaster unless reinforced.
- 天傷/天使: injury, illness, separation, official handling; stronger around 疾厄/遷移/命宮.
- 流年昌曲: annual literary/exam/document signal; interpret only when packet marks it annual.
