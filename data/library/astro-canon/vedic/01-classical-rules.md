# Vedic / Jyotish · compact classical rules for AI panel

Source policy:
- Brihat Jataka of Varahamihira, N. Chidambaram Iyer 1885 translation: safest public-domain English source for compact classical rules.
- Phaladeepika, V. Subrahmanya Sastri 1937 translation: use short derived rules only, not long verbatim passages.
- BPHS, Saravali, Jataka Parijata: use as cross-reference unless a clean license is verified. Do not import modern copyrighted commentary verbatim.

## Drishti policy
Use only packet-supplied aspects. In this system, `drishti` is the Vedic aspect table computed by the engine. If `drishti` has rows, do not say the chart lacks an aspect table.

Parashari graha drishti rule used by the packet:
- All grahas aspect the 7th from their position.
- Mars also aspects the 4th and 8th.
- Jupiter also aspects the 5th and 9th.
- Saturn also aspects the 3rd and 10th.
- Do not use Rahu/Ketu aspects unless the packet/source policy explicitly enables them.
- Keep Jaimini rashi drishti separate from Parashari graha drishti.

## Pair / compatibility packet rule
For two-chart questions, use only `PAIR_INTERACTION_PACKET vedic` for cross-chart claims:
- Moon nakshatra tara-bala both directions,
- Moon and Lagna rashi relation,
- Parashari graha drishti across charts,
- graha bhava overlays into the other chart,
- current mahadasha/antardasha cross-reference.

Do not invent Ashtakoota, Navamsa/D9 synastry, Jaimini rashi drishti, or Rahu/Ketu aspects unless the packet supplies those fields.

## Dignity hierarchy
Read dignity in this order when packet supplies it:
1. exalted,
2. moolatrikona,
3. own sign,
4. friend sign,
5. neutral sign,
6. enemy sign,
7. debilitated.

Combustion weakens visibility and agency. Retrograde results vary by source; describe cautiously unless the packet gives a specific rule. Do not infer compound friendship or moolatrikona from raw sign if packet does not supply it.

## Functional nature by Lagna
Do not call a planet simply benefic/malefic before checking house ownership:
- Trinal lords (1/5/9) tend to support.
- 3/6/11 lords are more difficult.
- 2/7 lords can act as maraka.
- 8/12 lords are mixed and need context.
- Kendra-trikona links can form yoga.
- A natural benefic owning difficult houses can give mixed results; a natural malefic owning good houses can become functional support.

## Navamsa / D9 guard
D9 confirms or weakens the natal promise. If `vargas.navamsaD9` exists, use that packet field:
- vargottama, own sign, or exalted D9 strengthens a planet,
- inimical or debilitated D9 weakens it,
- marriage/dharma judgments need D9 if the question is serious.
If packet lacks D9, say D9 is unavailable and do not fabricate it.

## Dashamsa / D10 guard
D10 is available only when `vargas.dashamsaD10` exists. Use it as a supporting career/public-work signal, not as a replacement for D1. If D10 Lagna is absent, do not invent D10 houses.

## Full varga guard
If `vargas.shodasha` exists, the packet supplies the full varga set listed there (D1/D2/D3/D4/D7/D9/D10/D12/D16/D20/D24/D27/D30/D40/D45/D60). Use only the supplied varga positions. Do not invent varga houses unless the packet explicitly supplies divisional Lagna/houses for that varga.

## Gochara / transit guard
If `gochara` exists, use its `refDate`, transit graha positions, houses from natal Lagna/Moon, and `hitsToNatal`. Do not claim current transit is missing when `gochara` exists. Do not extend beyond the supplied refDate unless the packet explicitly gives a time range.

## Shadbala / Ashtakavarga guard
If `shadbala` exists, use its 0-100 normalized sixfold score and named components as computed engine strength. Do not convert it to classical virupa/rupa unless the packet provides those units.

If `ashtakavarga` exists, use BAV planet totals and SAV rashi bindu table from the packet. High SAV/bindu supports transit and house strength; low bindu weakens it. Do not recompute bindu manually.

## Yoga / bhanga checklist
Declare a yoga only when conditions and cancellation guards are checked.

Pancha Mahapurusha:
- Mars, Mercury, Jupiter, Venus, or Saturn must be in own/exaltation sign and in kendra from Lagna.
- If packet lacks kendra/bhava or dignity, do not declare it.

Neechabhanga:
- Debilitation can be reduced if the debilitation lord or exaltation lord has strong angular relation; use only packet-supported conditions.
- Do not turn every debilitated planet into a cancellation; evidence must be explicit.

Kartari:
- Benefic/malefic enclosure modifies the house or planet enclosed.
- Needs adjacent-house/planet evidence from packet.

Parivartana:
- Exchange of signs between two house lords links their houses strongly.
- Good/difficult result depends on houses involved and planet condition.

## Dasha rule
Read mahadasha by:
1. natural nature of dasha lord,
2. functional lordship from Lagna,
3. house placement,
4. dignity/combustion/retrograde if supplied,
5. aspects/conjunctions if supplied,
6. connection to the question topic.

Read antardasha both from Lagna and from the mahadasha lord. Time an event only when the dasha lords connect to the asked house/topic. If antardasha is absent, say only mahadasha-level timing is available.
