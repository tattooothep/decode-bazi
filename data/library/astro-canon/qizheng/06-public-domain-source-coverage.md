# 七政四餘 · Public-Domain Source Coverage Pack

## Ingested Source Set

Hourkey now retains a private OCR corpus for Qizheng / Guolao cross-checking:

- `果老星宗` / `鄭氏星案`: 8 OCR text witnesses from Archive.org.
- `張果星宗卷六` / `八格賦` / `通元賦`: summary-only rule support from public web mirror/source witnesses, used to close the previous 八格賦 gap in `03-geju.md`. It is not a raw text ingest row.
- `果老星宗 卷一` (`GLXZ1`): 1 OCR witness used for duplicate/cross-check.
- `星學大成`: 16 OCR text files, useful for star-rule and star-fate comparison.
- `星學大成` alternate witness: 15 OCR text files from the `060660xx` Archive.org/CADAL line, useful for collation and OCR cross-check where the primary `060541xx` witness is noisy, including added 卷三~卷六, 卷十七~十八, 卷二十三~二十九, and 卷三十 witnesses.
- `增補星平會海命學全書`: ctext OCR witness, 7 chapters from work `res=7077657`, useful as a noisy but broad collation witness for 五星三命/七政四餘 topic structure, 行限, star-nature vocabulary, and named rule headings. Treat it as OCR support, not a clean critical edition.
- `七政四餘命學卷不分卷`: Wenzhou Library / Wikimedia Commons public-domain scan retained in originals for future OCR. Current local OCR was not promoted because the extracted text was mostly timeout/noise.
- `星命溯源`: 2 OCR text files, useful for cross-checking 五星三命 ancestry, star-life logic, and older terminology.
- `新刊指南臺司袁天罡先生五星三命大全`: 2 OCR text files, useful as a 五星三命 witness for fate structure, named configurations, and timing vocabulary.
- `唐開元占經`: 51 OCR text files across two 120-卷 witness lines, useful as Tang-period astral-omen, star catalog, celestial-event, and older terminology background. It is not the natal Guolao scoring backbone.
- `乙巳占`: 6 OCR text files, useful as astral-omen and celestial-event background.
- `觀象玩占`: 17 OCR text files, useful as observation/omen background for sky phenomena and older star vocabulary.
- `乾象通鑑`: 33 OCR text files, useful as historical astral-event and celestial-record background.
- `靈臺秘苑`: 8 OCR text files across two witness lines, useful as older star-omen, celestial-event, and terminology cross-check. It is not the natal Guolao scoring backbone.
- `周天星位經緯宿度考`: 1 OCR text file, useful as star-position, longitude/latitude, and mansion-degree background.
- `三垣七政二十八宿週天精鑑`: 1 OCR text file, useful as 三垣, 七政, and 二十八宿 catalog background.
- `七政推步`: 4 OCR text files, useful as 七政 calculation/procedural provenance only. The engine packet still supplies all positions.
- `算七政交食凌犯法`: 1 OCR text file, useful as eclipse, solar-lunar interaction, and celestial-event calculation background only.
- `天文大成管窺輯要`: 6 OCR text files covering 卷01-80, useful as broad Chinese astronomical/celestial-event background only. It must not override natal Guolao chart interpretation.
- `御製歷象考成`: 50 OCR text files covering 上編, 下編, 表, and 後編 witnesses, useful as official Qing calendar/astronomical calculation-provenance background only. It must not override natal Guolao chart interpretation.
- `欽定儀象考成`: 15 OCR text files, useful as official Qing astronomical and calculation-provenance background only. It must not override natal Guolao chart interpretation.
- `欽定儀象考成續編`: 16 OCR text files, useful as official Qing astronomical and calculation-provenance background only. It must not override natal Guolao chart interpretation.
- `欽定協紀辨方書`: 26 OCR text files, useful as official calendrical/electional cross-check.
- `禽星易見`: 1 OCR text file, used as star-selection supplement.
- `繪圖增廣玉匣記`: 1 OCR text file, used only as supplementary almanac context.

The private manifest is `private/restricted-sources/qizheng/manifests/ingest-manifest.json` and records 282/282 files ingested successfully.

## Reading Priority

For Fusion user readings, read the deterministic chart packet first. Use the source packs only as interpretive authority:

1. `00-method.md` fixes the step order and terminology.
2. `01-enyong-12gong.md` covers 命主 / 命度 / 度主 / 身主, 恩用仇難, and 12-palace reading.
3. `02-miaowang.md` covers 廟旺落陷 and 28宿 strength/dignity checks.
4. `05-xingxian.md` must be included for timing questions: 行限, 限度主, and 洞微百六限.
5. `03-geju.md` and `04-xingqing.md` should be included for topic judgments, named formations, 八格賦 verdict buckets, and planet nature. Use `星學大成`, `增補星平會海命學全書`, `星命溯源`, and `五星三命大全` as source families behind this layer when the question needs more concrete fate-structure language.
6. Use `周天星位經緯宿度考`, `三垣七政二十八宿週天精鑑`, `七政推步`, `御製歷象考成`, `欽定儀象考成`, and `欽定儀象考成續編` only as star-position / mansion-degree / catalog / calculation-provenance background. Engine-calculated 宿度, 七政 positions, and star fields still outrank historical catalog variants.
7. Use `唐開元占經`, `乙巳占`, `觀象玩占`, `乾象通鑑`, `靈臺秘苑`, `算七政交食凌犯法`, and `天文大成管窺輯要` only for star/omen/celestial-event vocabulary or historical astral background when the computed packet supplies the relevant star, mansion, solar/lunar, eclipse, or event field. Do not use them to replace 命主, 度主, 身主, 恩用仇難, 廟旺落陷, or 行限 logic.
8. This file only tells the AI what source families exist. It is not itself a substitute for chart evidence.

## Anti-Generic Rule

Every user-facing Qizheng answer must bind claims to chart evidence:

- a palace 宮,
- a planet/star 星,
- a dignity/strength state 廟旺落陷,
- 命主 / 度主 / 身主,
- 恩用仇難,
- a named 格局,
- or an explicit timing layer such as 行限 / 限度主.

If the user asks about a year such as 2028, do not say “only 2026 is available” when the structured packet supplies target-year transits/timing. Use the target-year packet first, then the timing rule pack.

## Copyright / Exposure Guard

Do not quote raw OCR or source passages in normal readings. Do not mention file names to users. Apply the extracted rules directly to the chart.
