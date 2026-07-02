# 七政四餘 · 三方對照 / 格局 / pair weighting pack

Source use:
- Derived operating rules from 果老星宗, 星學大成, 欽定協紀辨方書, and local Qizheng OCR corpus.
- This pack is a compact judgment framework, not a raw transcription.
- Use only with computed Qizheng packet fields. Do not invent unlisted stars, houses, aspects, or timing.

## 三方對照 Reading Rule

七政四餘 answers should not judge a house from its label alone. For any topic:

1. Start from the asked house.
2. Check its palace ruler condition: 廟/旺/升殿 = stronger, 平 = workable, 落/陷 = burden.
3. Check stars physically in the house.
4. Check the house's 三方 support:
   - house 1 命宮, 5 男女, 9 遷移 form one fire-style action triangle,
   - house 2 財帛, 6 奴僕, 10 官祿 form one work-money-service triangle,
   - house 3 兄弟, 7 妻妾, 11 福德 form one people-partner-inner-support triangle,
   - house 4 田宅, 8 疾厄, 12 相貌 form one base-body-image triangle.
5. Check 對宮 as the opposing mirror: pressure from the opposite field can activate or drain the topic.

If the engine has no explicit `三方` field, infer only from the 12 houses already supplied in the packet. State it as a structural cross-check, not as a newly computed hidden rule.

## Topic Triangles

Money:
- Primary: 財帛.
- Triangle: 奴僕/官祿 shows money through network, staff, service, job, status.
- Opposite: 疾厄 can show money drain through health, crisis, repairs, debt pressure.
- Verdict rule: 財帛 good but 官祿 weak = can earn but channel is unstable. 官祿 good but 財帛 weak = work exists but cash retention is weak.

Career:
- Primary: 官祿.
- Triangle: 財帛/奴僕 shows income channel and people system.
- Opposite: 田宅 can show home/family/property duties pulling against career.
- Verdict rule: 官祿 strong with useful 命主/恩用 support = real career lift. 官祿 strong but 仇難 pressure = promotion through burden, not easy luck.

Relationship:
- Primary: 妻妾.
- Triangle: 兄弟/福德 shows social support, emotional comfort, and the mind's ability to sustain relationship.
- Opposite: 命宮 shows whether the partner axis directly challenges the native's self.
- Verdict rule: 妻妾 support without 福德 support = attraction but weak emotional rest. 妻妾 pressure plus 命宮 pressure = relationship affects identity strongly.

Health:
- Primary: 疾厄.
- Triangle: 田宅/相貌 shows body base, home environment, appearance/constitution.
- Opposite: 財帛 shows costs, obligations, and resource drain.
- Verdict rule: 疾厄 weak with Saturn/Mars/Rahu/Ketu or 難星 involvement = concrete caution. Do not diagnose disease; translate to check-up, rest, routine, and medical follow-up.

Travel / outside:
- Primary: 遷移.
- Triangle: 命宮/男女 shows personal initiative and project/children/creative outputs moving outward.
- Opposite: 兄弟 shows local people, siblings, peers, and communications that may pull back.
- Verdict rule: 遷移 strong and 木流年 enters relevant house = outside opportunity. 土流年 there = outside obligation or pressure.

Home / property:
- Primary: 田宅.
- Triangle: 疾厄/相貌 shows physical base, repair, body condition, visible environment.
- Opposite: 官祿 shows career/public duties pressing against home.
- Verdict rule: 田宅 strong with 財帛 support = asset channel. 田宅 hit by 仇難/土/Mars/Saturn = repair, delay, structure pressure.

## 格局 Weighting

格局 is a high-level pattern, not a replacement for the house/ruler facts.

Use this priority:
1. Major named 格局 from packet.
2. 命主/度主/身主 condition.
3. 恩星/用星 versus 仇星/難星.
4. Asked house and 三方.
5. 行限/限度主 and 木土流年 for timing.

Good 格局 should raise confidence only if:
- 命主 or 度主 is not severely fallen,
- the asked house has at least neutral support,
- timing layer does not repeatedly activate 仇/難.

Bad 格局 should not erase all support if:
- asked house ruler is strong,
- 恩/用 stars directly protect the topic,
- 行限 is supportive.

User-facing wording:
- "มีโครงหนุน แต่ต้องแลกด้วย..." when good pattern and stress coexist.
- "โครงขัด แต่ยังมีช่องใช้ได้ตรง..." when bad pattern has a specific support channel.

## Pair Weighting

Use only the `PAIR_INTERACTION_PACKET qizheng` closed list.

Weight order:
1. Each person's own 命宮/命主/度主/身主 strength.
2. 命宮 sign relation between A and B.
3. 命主 relation across charts.
4. 恩/用/仇/難 star cross-aspects.
5. 妻妾 house overlays.
6. Each person's current 行限 if the question asks timing and individual packets supply it.

Support signs:
- 命宮 三合/六合 can make the two charts understand or assist each other.
- One person's 恩/用 star contacting the other's 命主/命宮 is real support.
- Spouse-house overlay by a useful/supportive star is a relationship channel.

Stress signs:
- 仇/難 star contacts to 命主, Moon/Sun, or 妻妾 axis are stronger than generic sign harmony.
- Many 刑/沖 contacts in the closed list mean friction must be named, even if 命宮 relation is good.
- A weak native chart cannot be fixed by one good overlay; say "ช่วยได้บางจุด" rather than "สมบูรณ์".

Pair verdict forms:
- Strong pair: both own charts can receive support + 命宮 relation supportive + cross 恩/用 repeated + spouse overlay tolerable.
- Mixed but workable: attraction/support exists, but 仇/難 or 刑/沖 repeats. Give operating rules.
- Heavy pair: one side repeatedly receives 仇/難 pressure into 命主/妻妾/福德 while their own chart is weak. Do not sugarcoat.

Never conclude marriage/divorce from one overlay. Never let "三合" alone override many hostile cross contacts.

## Anti-Generic Output

Every Qizheng answer should contain:
- the specific house or triangle being judged,
- the house ruler status,
- at least one star class relation: 命主/恩/用/仇/難,
- timing layer if asked: 行限/限度主/木土流年,
- a clear practical implication.

Avoid broad statements like "ความรักดี" or "งานมีโอกาส" unless the exact palace/ruler/star/timing evidence follows immediately.
