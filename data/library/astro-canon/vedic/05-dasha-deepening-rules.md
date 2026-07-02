# Jyotish · Dasha deepening and timing rule pack

Source use:
- Derived operating summary from the Vedic/Jyotish corpus retained for Hourkey: BPHS dasha chapters, Laghu/Madhya Parashari, Phaladeepika/Phala Deepika, Jataka Parijata, Saravali, Sarvartha Chintamani, Ashtakavarga/Nakshatra/Dasha witnesses, Graha Dasha Phalam, Ashtottari Dasha witnesses, and licensed/internal Dasha Phala Vichara / Sankshipta Gochara Phala Vichara.
- This is not a raw transcription. Do not quote, closely paraphrase, cite page order, or expose source text.
- Use only engine-supplied packet fields. Do not calculate unsupported dasha systems inside the AI response.

## Availability Rule

If `vimshottari` exists in the packet, do not say dasha is missing.

If the packet supplies only Vimshottari:
- read Vimshottari only,
- do not introduce Ashtottari, Kalachakra, Chara, Yogini, Tajika annual periods, or prashna dasha,
- mention an alternate dasha only if the user explicitly asks and the packet marks that system available.

If the packet supplies only mahadasha and antardasha, answer at that level. Do not pretend pratyantar/sookshma/prana dates exist.

If the user asks a very exact month/day and the packet lacks sub-periods below antardasha, give a coarse window from mahadasha + antardasha + gochara and say exact sub-period timing is not supplied.

## Dasha Layer Order

Read timing in this order:

1. Natal promise: Lagna, Lagnesha, Moon, topic bhava, topic lord, karaka, dignity, drishti.
2. Mahadasha: the main field of life that dominates the period.
3. Antardasha: the specific trigger inside the main field.
4. Pratyantar / Sookshma / Prana: only if supplied; use for narrowing, not for overriding the main period.
5. Gochara: confirms or pressures the dasha promise.
6. Shadbala/ashtakavarga/varga: strength and resilience confirmation.

Never let a short sub-period erase the broader mahadasha/antardasha promise. A good sub-period inside a hard mahadasha is a usable opening; a hard sub-period inside a good mahadasha is friction, not total collapse.

## Mahadasha Judgment

For the mahadasha lord, evaluate:

- natural benefic/malefic nature,
- functional lordship from Lagna,
- bhava placement,
- dignity: exalted, own sign, moolatrikona, friend/enemy, debility,
- combustion, retrograde, and affliction,
- drishti received and given,
- varga dignity, especially D9 for maturity and D10 for career questions,
- shadbala band and ashtakavarga support if supplied,
- whether it is yogakaraka, maraka, dusthana lord, or part of a yoga.

Strong mahadasha lord in kendra/trikona/upachaya or own/exalted sign can produce visible results. Weak mahadasha lord in 6/8/12, debility, combustion, or severe affliction gives mixed or difficult results unless viparita/yoga support is present.

## Antardasha Judgment

For the antardasha lord, evaluate both:

1. from Lagna: its natal house, lordship, dignity, aspect, and topic connection,
2. from mahadasha lord: whether the antardasha lord is 1/5/9/10/11 from the mahadasha lord or 6/8/12/2/7 from it.

Supportive antardasha:
- connects to the asked topic house,
- is friendly or supportive to the mahadasha lord,
- is in kendra/trikona/11th from the mahadasha lord,
- has benefic drishti or varga support.

Stressful antardasha:
- falls 6/8/12 from the mahadasha lord,
- is maraka/dusthana lord without relief,
- is debilitated, combust, severely afflicted, or tied to Rahu/Ketu/Saturn/Mars pressure,
- activates 8th/12th leakage without a clear topic benefit.

User-facing rule: say exactly which planet sets the field and which planet triggers the event. Example structure: "Moon mahadasha makes the mind/home/12th-house pattern central; Saturn antardasha triggers the 8th-house burden."

## Pratyantar / Sookshma / Prana

Use only if the packet supplies these fields.

- Pratyantar narrows the event theme inside the antardasha.
- Sookshma narrows execution and short-window movement.
- Prana is too fine for broad life claims; use only for small action timing, not fate claims.

Do not invent a sub-period from dates in the user question. If the packet lacks it, answer from broader layers and gochara.

## Gochara Confirmation

Gochara should confirm, time, or pressure the dasha promise:

- Jupiter transit supports growth, teacher/help, legal/formal approval, child/wealth/fortune themes when it aspects or transits the relevant bhava/lord.
- Saturn transit gives duty, delay, structure, endurance, karmic pressure, and sometimes lasting result after effort.
- Rahu/Ketu transits amplify unusual, foreign, obsessive, sudden, or separation themes.
- Mars transit can trigger acute action, conflict, inflammation, or technical/cutting events.

Do not answer from gochara alone when dasha contradicts it. Say "transit opens the door, but dasha decides whether it becomes a main event."

## Ashtakavarga Timing Use

Use ashtakavarga only when packet fields exist:

- SAV/BAV high bindu in the transited sign supports easier manifestation.
- Low bindu sign suggests effort, delay, cost, or weak protection.
- Ashtakavarga confirms resilience; it does not erase a severely weak dasha lord, maraka activation, or dusthana pile-up.

For money/career timing, check bindu support for 2nd/10th/11th signs and the signs occupied by dasha lords.

## Varga Timing Use

- D9 confirms planet maturity, dignity, and relationship/spiritual strength.
- D10 confirms public role, professional status, authority, and work delivery.
- D7 supports children questions only if supplied.
- D12 supports parent/family-line questions only if supplied.
- D30/D60 are cautionary background only unless packet explicitly marks them reliable.

Do not invent divisional houses. Use only supplied varga graha/rashi/dignity unless divisional Lagna/houses are in the packet.

## Alternate Dasha Guard

Ashtottari, Kalachakra, Chara, Yogini, Naisargika, or other dasha systems are not interchangeable.

- Use Ashtottari only when the packet says Ashtottari is available.
- Use Chara/Karakamsa timing only when Jaimini fields are available.
- Use Kalachakra only when the packet supplies Kalachakra sequence and relevant nakshatra/pada assumptions.
- Use Naisargika only as classical background if the packet or question asks that system.

If these are absent, do not list them as "missing" in normal user readings unless the user asks why exact timing cannot be sharper.

## Topic-Specific Dasha Rules

Career:
- Strong 10th lord, planets in 10th, Lagnesha, Sun, Saturn, Mercury, or D10 repeating under dasha = career event.
- Mahadasha connected to 10th with antardasha connected to 11th/2nd = role plus gain.
- Dasha tied to 8th/12th can show job change, backstage work, research, exit, foreign link, or burnout depending on support.

Money:
- 2nd/11th/5th/9th lords and Jupiter/Venus/Mercury under dasha support earning/gains.
- 12th/8th activation under dasha shows leakage, debt, tax, hidden cost, or investment lock-up unless supported by dhana/viparita factors.
- Rahu in 2nd/11th can give nonlinear gain but must be separated from saving stability.

Relationship:
- 7th lord, Venus, Jupiter as spouse significator where used, Moon, D9, and 2nd/4th/11th support matter.
- Dasha of 7th lord/Venus/Moon can activate relationship; antardasha of Saturn/Mars/Rahu/Ketu may add pressure, delay, heat, distance, or obsession.
- Do not declare marriage from romance indicators alone; require 7th/D9/dasha support.

Health:
- Lagna/Lagnesha, 6th, 8th, 12th, Moon, Saturn, Mars, Rahu/Ketu, and dasha activation are the main caution chain.
- Maraka/dusthana dasha can show health pressure, but write as risk signal/check-up/rest/routine. Do not diagnose, predict death, or instruct surgery.

Home/property:
- 4th lord, Venus/Moon, Mars for land, and 2nd/11th for funding.
- Dasha linked to 4th plus 11th/2nd supports acquisition; 4th plus 8th/12th/Keu/Rahu can show repairs, family burden, relocation, or hidden cost.

Foreign/relocation:
- 12th/9th/7th/3rd links, Rahu, Saturn, and dasha/gocara repeat support foreign movement.
- Distinguish travel, relocation, foreign client, and isolation/backstage work.

## Output Rule

For timing answers, include:

1. current or target mahadasha,
2. current or target antardasha,
3. how those lords connect to the asked topic,
4. one gochara confirmation or contradiction when supplied,
5. one practical action recommendation.

Do not output a long "missing-data" list. Name only the missing layer that materially affects the user's exact question.
