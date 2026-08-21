# 《奇門法竅》C4 source excerpts

Pinned on: 2026-08-21

Purpose: source-governed transcription for the HourKey Qimen C4 month/day context engines. This file does not claim that the Chinese Text Project transcription is a critical edition. The upstream catalog currently identifies the base edition as unknown; that limitation must remain visible in the runtime source manifest.

Upstream records:

- `https://ctext.org/wiki.pl?chapter=118328&if=en` — 卷二, including 論月奇法 and 論日奇法
- `https://ctext.org/wiki.pl?chapter=600483&if=en` — 卷六, including component, flight, deity, and center-lodging examples
- Work record: `https://ctext.org/wiki.pl?if=en&res=562001`

The following Chinese passages are preserved without product interpretation so reviewers can compare the implementation against the cited transcription.

## 卷二 · 奇門六甲三元定例 / 超接拆補 context

一得曰：「奇門地盤定局-八卦也、九宮也、九星也。」然地道常靜，故八卦九宮永定而不移，若八門更換而為人盤，九星飛布而為天盤，變化無窮，雖鬼神亦莫能測其機矣，豈可淺易得乎。然物之不能逃者，數也；數之不能離者，理也；理與術所不能違者，時也。天有四時，迭運而成歲，一歲十二月，每一月有二氣，共二十四氣，每一月或三十日或二十九日，每五日為一候，每一氣十五日為三候，一歲共七十四候。氣者，節也，候者，元也，每一氣分為上中下三元也。子午卯酉為上元，寅申巳亥為中元，辰戌丑未為下元，以甲、己為符頭，掌六十時，而三元畢矣。自交冬至起至芒種十二氣止，為陽遁，俱順儀逆奇；自夏至起至大雪十二氣止，為陰遁，俱逆儀順奇，而又有正授、超神、接氣、拆局、補局之法。

蓋六十花甲一日不增多，一日不減少，而氣有或先或後，而日有或多或少，先須講明正授奇訣，其他超神、接氣、拆局、補局自有次第，可以通曉。如冬至、夏至、立春、立秋、春分、秋分、立冬、立夏、芒種、大雪，二十四節如此日，子時交節，即遇甲子、己卯、甲午、己酉是上元符頭，亦此日到，乃為正授，如節氣未到，而甲子、己卯、甲午、己酉符頭先到，謂之符先節候，為超神。超神，超者，越也，當用本節之上元，以補之，不可錯用下節之上元，因奇門端重節氣，豈有節未到而預用之者哉。

接氣者，迎接也，如節氣先到，甲子、己卯、甲午、己酉符頭後到，為節先符後，其候尚是前節之下元，當拆本節之下元某局以接之，謂之接氣也。

## 卷二 · 論寄宮

中五無專方，故立寄宮之法也。考之諸書，論水土長生在申，故有寄宮之法，而近時均以陰陽十八圖端寄二宮，又變體分寄八宮者，蓋取存亡之義，而難免泥於古法矣。然禽星屬土實居中宮，遇辰戌丑未月皆為乘旺，是土旺於四季，此一定不易之氣也。是中五之陰陽以分見於四維明矣，又何苦拘拘端寄二宮乎？愚詳考不若隨乎季候，所值之節氣寄於四維，以立春寄艮用生門，立夏寄巽用杜門，立秋寄坤用死門，立冬寄乾用開門，既與季候相合，可得節氣之真，而於陰陽所用之理亦無格礙，較之端寄於二八兩宮者，尤通元妙矣。

## 卷二 · 論月奇法

月奇門先認定行年，以分上中下三元也，如遇四孟子午卯酉，即為上元，每一元管五年為率，如甲子、乙丑、丙寅、丁卯、戊辰、甲午、乙未、丙申、丁酉、戊戌、己卯、庚辰、辛巳、壬午、癸未、己酉、庚戌、辛亥、壬子、癸丑，此二十年為上元一局起坎宮，逆布六儀順布三奇，視所用之月屬何符統領以行遁，得何奇、何門以定吉凶；若遇四仲寅申巳亥，即為中元，每一元管五年，如甲寅、乙卯、丙辰、丁巳、戊午、甲申、乙酉、丙戌、丁亥、戊子、己巳、庚午、辛未、壬申、癸酉、己亥、庚子、辛丑、壬寅、癸卯，此二十年屬中元四局起巽宮；如遇四季辰戌丑未即為下元，每一元管五年，甲辰、乙巳、丙午、丁未、戊申、甲戌、乙亥、丙子、丁丑、戊寅、己丑、庚寅、辛卯、壬辰、癸巳、己未、庚申、辛酉、壬戌、癸亥，此二十年屬下元七局起兌宮，其飛布天地兩盤之法與年奇同。

## 卷二 · 論日奇法

日奇以四十節氣為准，以三元符頭為定局。假如冬至上元陽遁一局，甲子戊坎、甲戌己坤、甲申庚震、甲午辛巽、甲辰壬中、甲寅癸乾、丁兌、丙艮、乙離是順儀逆奇布成局矣。用庚子日，庚子震、辛丑巽、壬寅中、癸卯乾，此地下庚子在震二宮也；即以甲午直符加震丁、乾丙、兌乙、艮戊、離己、坎庚、坤辛、震壬、巽癸、寄艮，此天上庚子日在坤。甲午直符在巽，巽星得輔星，門得杜門，即以杜門為直使加坎、開坤、驚震、生巽、景乾、休兌、死艮，此日休門丙寄在兌也。

假如夏至上元，陰遁九局甲子戊離、甲戌己艮、甲申庚兌、甲午辛乾、甲辰壬中、甲寅癸巽、丁震、丙坤、乙坎，是逆儀順奇布成局矣。丁卯日，丁卯震、戊辰離、己巳艮、庚午兌、辛未乾、人申中、癸酉巽，此地下丁卯日在震三宮也；即以直符甲子加震、乙丑巽、丙寅中、丁卯乾、戊辰震、己巳坤、庚午坎、辛未離、壬申艮、癸酉兌，此天上丁卯日在乾六宮也。甲子直符在離，星得天英，門得景門，即以景門為直使加乾，休兌、死艮、傷離、杜坎、開坤、驚震、生巽，此日丙奇到中宮，休門到兌也，余元仿此。

陽遁用一七四三局，陰遁用九三六三局，一歲三百六十日，十五日一氣，一元統四氣，三元共十二氣。如冬至、小寒、大寒、立春、雨水、驚蟄、春分、清明、穀雨、立夏、小滿、芒種，陽遁統此十二氣也；如夏至、小暑、大暑、立秋、處暑、白露、秋分、寒露、霜降、立冬、小雪、大雪，陰遁統此十二氣也。一歲周遍，不失乎三元卦氣時令之正。有符先節後之分，先視節氣，次視符頭，或超或接，或拆或補，視直符以行遁；有奇有儀，視直使以加。日有吉有凶，咸如時遁之法，以授時歷為准，惟不用五子元遁也，門法入於選擇金鏡前編。

Transcription note: the upstream line begins `日奇以四十節氣為准`; the same passage enumerates the 24 solar terms as two groups of 12. The implementation must retain the upstream text as evidence and may normalize the operational count to 24 only as an explicit, tested editorial ruling in the source manifest.

## 卷六 · components, flight, deities, and lodging

六甲者，乃天乙之貴神，人君之象也，隨陰陽二氣以遁之，故為遁甲，即甲子、甲戌、甲申、甲午、甲辰、甲寅也。三奇者，應天上日月星也，丙為月奇，丁為星奇，乙為日奇也。六儀者，即奇下六位受甲者為儀，戊己庚辛壬癸，故甲子同戊，甲戌同己，甲申同庚，甲午同辛，甲辰同壬，甲寅同癸也。九星者，蓬芮衝輔禽心柱任英。八門者，休死傷杜開驚生景也。三才者，九星居上象天，九宮在下象地，八門在中象人，即上中下三盤也。直符者，隨宮飛出九星為直符。直使者，八門隨時所泊而加之為直使。八節者，即二至四立二分也，冬至為陽遁，自一至九順行；夏至陰遁，自九至一逆行。三元者，子午卯酉為上元，寅申巳亥為中元，辰戌丑未為下元，以甲子日為符頭，五日一換元。奇儀飛布者，陽遁逆布三奇、順布六儀；陰遁逆布六儀、順布三奇，概以戊己庚辛壬癸丁丙乙為次，分陰陽順逆而補九宮也。

一局以休門為直使，如甲子時，則以休門起坎宮，即為直使之門，則死門在坤宮，如乙丑時，休門起坤宮，死門則在震宮，丙寅時，休門起震宮，死門則在巽宮，一時一易，門以休死傷杜開驚生景為次，不入中五，而逾於六順飛坎坤震巽乾兌艮離八宮，此起一局人盤直使之門也，其八詐以天乙直符加於各旬首直使之上，如甲子戊加坎宮，則天乙直符即加於甲子旬首直符之上，即所謂小直符加大直符，陽遁以直符、螣蛇、太陰、六合、勾陳、朱雀、九地、九天為次，按坎艮震巽離坤兌乾順布八宮也。

九局以景門為直使，如甲子時，則以景門起離宮，即為直使之門，則生門在艮宮，如乙丑時，景門起艮宮，生門則在兌宮，如丙寅時，景門在兌宮，則生門在乾宮，一時一易，門以景生驚開杜傷死休為次，不入中五，而逾於四逆飛離艮兌乾巽震坤坎八宮，此起九局人盤直使之門也，其八詐以天乙直符加於各旬首直符之上，如甲子戊加離宮，則天乙直符即加於甲子旬首直符之上，即所謂小直符加大直符，陰遁以直符、螣蛇、太陰、六合、白虎、元武、九地、九天為次，按離巽震艮坎乾兌坤逆布八宮也，此甲子旬首直符，管至癸酉十時之法，如甲戌十時，系甲戌旬首直符用事，則甲戌任星起於八宮矣，其三局以衝星為直符，傷門為直使，即以甲子戊儀起三宮六局，以心星為直符，開門為直使，即以甲子戊儀起六宮，仍按星符直使之次序分天地人三盤，逆飛九宮，至中五宮寄宮之法，陰遁九局五宮之星符均寄於坤宮，餘局仿此。

中五無專方，立有寄宮之法，故陽遁冬至寄艮，陰遁夏至寄坤，較之專寄二宮，更為活變而通玄妙矣。

## Product-use limits

- 月家 and 日家 must be labeled `奇門法竅 · 飛盤`.
- This source does not authorize copying the existing 轉盤 hour chart into month/day.
- This source does not authorize averaging or overlaying the three flights.
- In the first release, month/day are raw contextual evidence only. Cross-school labels such as supportive, conflicting, or cautionary require a separately reviewed deterministic interpretation source.
- 卷二 seasonal-four-corner lodging and 卷六 fixed Yang-to-Gen/Yin-to-Kun lodging are competing statements inside the work. Product use must name a versioned policy and retain raw center evidence.
