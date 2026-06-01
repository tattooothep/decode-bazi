# 🔬 Voytek BaZi Calculator — Source Code Deep Dive

## Tech Stack (verified from HTML)

### Backend
- **Pure PHP** server-side rendering (no SPA, no React)
- Polish naming throughout: kalkulator, kalendarz, dlugosc, miasto, wynikiGMap
- Single HTML response with inline data (no AJAX heavy)

### Frontend assets (versioned cache-busting)
- `kalkulator28.js` (core calculator)
- `kalkulator29.css` (versioned styles — note JS=v28 but CSS=v29 = constant updates)
- `wspolne4.css` (shared styles, v4)
- `ajax14.js` (AJAX layer, v14)
- `AutoSuggest.js` + `AutoSuggest1.css` — custom location autocomplete
- `jscal2.js` — date picker (Polish lib)
- Google Maps Places API for location → longitude
- Google Analytics G-29GFJ9CCHS

### Fonts
- Monda 400/700 (Google Fonts) — ~14yo retro design choice

## Key Engine Findings

### True Solar Time (RST) — the gold standard
For Nonthaburi (your home):
```
Longitude: 100.3947° E
GMT: +7
Standard meridian: +7 × 15 = 105°
Longitude correction: (100.3947 - 105) × 4 = -18.42 minutes
Equation of Time (May 5): +3.23 minutes
TOTAL correction: -15.19 minutes
Local clock: 19:34 → RST: 19:19
```

### Border-case detection (UNIQUE!)
```html
Month begins: 2026-05-05 18:46 GMT+7 (18:27 LMT)
Border case - some pillars are on borderline (Month).
```
→ Voytek warns when birth time falls within solar term boundary
→ Hourkey + Decode currently DON'T do this
→ Critical for late-Jan/early-Feb births especially

### CSS Classes for elements
```
p1-p10 = 10 stems (Jia=p1, Yi=p2, Bing=p3...)
k1-k12 = 12 branches (Zi=k1, Chou=k2, Yin=k3...)
sp1-sp10 = stem combinations highlighting
sk1-sk12 = branch combinations highlighting
gwiazdy = "stars" (Polish — interactions container)
```

### Symbolic Star URLs
Voytek has NUMBERED dictionary: `shensha/18`, `shensha/20-48`
Confirmed star IDs found:
- 18 = heavenly virtue (天德)
- 20 = monthly virtue (月德)
- 21 = general star (將星)
- 22 = star of arts (華蓋)
- 23 = travelling horse (驛馬)
- 24 = robbing star (劫煞)
- 25 = death star (亡神)
- 26 = peach blossom by the pool (鹹池)
- 27 = solitary star (孤辰)
- 28 = forlorn star (寡宿)
- 38 = heavenly noble (天乙貴人)
- 40 = academic star (學堂)
- 41 = literacy star (文昌)
- 42 = prosperity star (祿)
- 43 = sword star
- 46 = red peach blossom (紅艷)
- 48 = golden carriage (金輿)

→ **48+ stars in Voytek's database** (numbered up to 48 means more than 48)
→ Decode currently has 25, Voytek has 2x more

### Fan Yin / Fu Yin Detection (UNIQUE!)
```
Fan Yin (Bing Wu)  — full clash with current period
Fu Yin (Gui Si)    — full repeat with current period
heaven void (YP)   — Year Pillar void (Kong Wang)
heaven void (DP)   — Day Pillar void
```
→ Voytek tracks Fan Yin (反吟) and Fu Yin (伏吟) explicitly
→ These are CLASSICAL concepts that even Joey Yap doesn't always show
→ Decode missing these — should add

### Heluo Chart (Dutch BaZi master inspiration)
SVG element-distribution circular chart:
- 5 colored sectors (Resource fire, Parallel earth, Output metal, Wealth water, Power wood)
- Percentages inside each sector
- Co-developed with Heluo (heluo.nl) — Dutch BaZi master

### Navigation Views
- BaZi chart (default)
- **Compact view** — collapse pillars
- Day view
- Month view
- Year view
- **10 Years** view
- **100 Years** view (premium — all luck pillars in one table!)
- **Ming Gong** (命宮 Life Palace)
- **Energy finder** (search for specific energy patterns)

### Interaction Display Logic
JavaScript hover effect:
```js
onmouseover="show3('p1','p6','x', 'p5')"
// Highlights stem 1 (Jia), stem 6 (Ji), and stem 5 (Wu — transformation product)
```
→ Visual feedback when hovering over interactions
→ Shows which pillars are linked + what they transform into

## Pricing Model
- **Free:** Limited features + ads + IP daily limit
- **Silver $36/yr or $3.80/mo** — Premium chart features, no ads
- **Gold $89/yr or $9.80/mo** — Adds XKDG, Tong Shu, Flying Stars, MangPai
- Annual discount: 21% off Silver, 24% off Gold

→ Strategy: cheap + sticky + ecosystem lock-in
