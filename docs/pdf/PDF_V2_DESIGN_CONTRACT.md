# HourKey PDF V2 Design Contract

Status: accepted product requirement

This contract is a release gate. A PDF does not pass merely because it can be
downloaded. Rendered files must satisfy the structure and visual rules below.

## Shared identity

- A4 output with the `時` seal, HourKey wordmark, report title, report ID, issue
  date, and page `X / Y`.
- White paper, dark ink, gold accents, and print-safe green/red reserved for
  results and warnings.
- No fake QR placeholder, unsupported verification claim, faint decorative
  gradient, raw page dump, or unformatted JSON/Markdown.
- Tables repeat their header, wrap long content, contain no more than six
  columns, and do not split a row across pages.
- Headings stay with the following content. Figures, callouts, and compact cards
  must not be cut across pages.

## Quick engine report

Length target: 3-5 pages. No AI call and no credit charge.

1. Branded cover: science glyph, report name, subject/house/activity,
   calculation context, and `Quick Engine Report` marker.
2. Executive snapshot: deterministic diagram plus key facts.
3. Results: readable ranked or positional tables derived only from engine data.
4. Warnings and missing inputs: explicitly state what cannot be concluded.
5. Method and provenance when the page needs an additional page.

The quick report may label or summarize existing deterministic verdicts. It
must not invent narrative advice, dates, directions, scores, or evidence.

## AI Sifu report (20 yam)

Length target: 6-8 pages. It uses the same engine evidence packet as the quick
report, then adds validated AI prose.

1. Premium branded cover with `AI Sifu Report` marker.
2. Answer-first executive verdict.
3. Deterministic chart/diagram and evidence table.
4. Science-specific interpretation sections.
5. Recommended actions in priority order.
6. Avoidances and cautions.
7. Missing inputs and boundaries; omit pages only when no applicable content
   exists, while keeping the total report within the target range.

AI must never create a chart, table fact, score, date, direction, formation, or
formula. It may explain only facts present in the validated EvidencePacket. If
the evidence does not support a conclusion, the report must say so.

## Page-specific content

### Luopan

- House identity, facing/sitting, period, owner, timing layer, and completeness.
- Luopan/floor-plan figure, house flying-star chart, pins, water data, Ba Zhai,
  warnings, notable sectors, and unverified/missing inputs.
- AI sections: overall verdict, people/health, wealth/activity, door/bed/stove/
  desk/water, priority risks, action plan, and missing data.

### Date Picking

- Activity, people, location/time zone, search window, top candidates, module
  evidence, vetoes, boundary warnings, and data completeness.
- AI sections: chosen date, why it ranks first, alternatives, personal fit,
  avoidances, preparation checklist, and scope.
- AI cannot rerank candidates or add dates not returned by the engine.

### Qi Men

- Cast time/location/method, Yin/Yang Dun, Ju, cycle, pillars, chief values,
  nine palaces, Yongshen targets, formations, harmful states, and completeness.
- AI sections: direct answer, decisive structure, subject/object/Yongshen,
  direction and action, timing only when evidence exists, avoidances, evidence,
  and limits.
- If the engine does not supply sufficient Yingqi evidence, AI must state that
  a result date cannot be determined instead of inventing one.

## Acceptance evidence

- Detailed visual review in Thai, English, and Chinese.
- Nine-language smoke render.
- Desktop and mobile trigger tests.
- Chromium PDF output inspection for cover, branding, color, row/page breaks,
  heading orphans, diagrams, footer, report ID, and page count.
- Five required signatures, build, and regression suites pass.
- Commit and push only. Production deployment requires separate approval.
