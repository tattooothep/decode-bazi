#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { generateGrokImage } from "/root/heygen2/packages/shared/src/grok-cli-image-worker.mjs";
import { createGrokVideoBatchContext, renderGrokCliVideo } from "/root/heygen2/packages/shared/src/grok-cli-video-worker.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, "public/assets/hourkey-guide");
const RAW_DIR = resolve(OUT_DIR, "grok-v3-raw");
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(RAW_DIR, { recursive: true });

const COMMON_STYLE = [
  "Premium cinematic educational bitmap image for a luxury astrology knowledge website.",
  "No SVG, no vector flat icon style, no UI mockup, no readable text, no subtitles, no logos, no watermark.",
  "Use real material textures: parchment, brass, ink, stone, glass, starfield, compass metal, paper grain.",
  "Dark refined background with warm gold and deep teal accents, realistic depth of field, polished editorial lighting.",
  "16:9 landscape composition, center subject clear, enough negative space for webpage crop, sophisticated and non-cartoon.",
].join(" ");

const ITEMS = [
  {
    slug: "hourkey-sciences",
    prefix: "hourkey-sciences",
    label: "Hourkey Six Civilizations Fusion",
    imagePrompt: `${COMMON_STYLE} Subject: Hourkey knowledge hub for multiple astrology and timing sciences across civilizations, shown as one shared night sky above a refined study table. Include a Chinese luopan compass, four-pillar parchment slips, a brass Western zodiac wheel, a Vedic sidereal ring, a Qi Men nine-palace board, a Zi Wei palace chart, a Uranian midpoint dial, and a calendar selection seal arranged as real objects in one coherent cinematic scene. No readable text, no UI, no logos. Concept accuracy: many systems use sky, time, direction, cycles, and human context as different lenses, not one flat generic horoscope.`,
    videoPrompt: "A premium cinematic sweep across a study table where luopan, astrology wheels, palace charts, nine-palace board, calendar tokens, and star maps sit under one moving night sky. Objects catch warm gold light while the sky slowly rotates.",
  },
  {
    slug: "bazi",
    label: "BaZi Four Pillars",
    imagePrompt: `${COMMON_STYLE} Subject: BaZi 八字 Four Pillars shown as four elegant vertical parchment slips on a scholar desk, each slip holding abstract stem-and-branch symbols that are decorative but not readable text. Around them are five tangible element tokens: living wood sprout, small flame in bronze cup, earthen clay seal, polished metal coin, dark water bowl. A subtle central Day Master circle glows among the elements. Ancient Chinese metaphysics atmosphere, accurate concept: four pillars, heavenly stems, earthly branches, five elements, day master.`,
    videoPrompt: "Slow cinematic push-in over an ancient scholar desk with four parchment pillars and five element tokens. Tiny dust motes and a soft star map reflection move subtly while the Day Master circle glows gently.",
  },
  {
    slug: "qizheng",
    label: "Qizheng Siyi Seven Luminaries",
    imagePrompt: `${COMMON_STYLE} Subject: Chinese 七政四餘 celestial astronomy scene: the Sun and Moon with five classical planets arranged along a brass ecliptic ring, plus four faint calculated orbital nodes shown as translucent ghost markers, clearly distinct from the physical planets. Include an antique armillary sphere, dark sky map, brass measuring arcs, no readable labels. Concept accuracy: seven luminaries plus four computed remainders, real sky timing, Chinese star astrology.`,
    videoPrompt: "A slow orbit around a brass celestial ring: Sun, Moon, and five planets drift along the ecliptic while four translucent calculated nodes pulse faintly apart from the physical bodies. Camera motion is calm and scholarly.",
  },
  {
    slug: "ziwei",
    label: "Zi Wei Dou Shu Palace Chart",
    imagePrompt: `${COMMON_STYLE} Subject: Zi Wei Dou Shu 紫微斗數 palace chart as a twelve-palace square mandala made of carved dark lacquer panels and gold inlay, with fourteen small star jewels distributed across palaces and four transformation beams in gold, red, silver, and shadow. No readable Chinese labels, no text. Concept accuracy: twelve palaces, main stars, four transformations, life domains, timing layers.`,
    videoPrompt: "Camera glides across a lacquer twelve-palace chart as star jewels brighten one by one and four transformation beams sweep gently across connected palaces. Keep the chart stable and elegant.",
  },
  {
    slug: "western",
    label: "Western Astrology Natal Chart",
    imagePrompt: `${COMMON_STYLE} Subject: Western astrology natal chart as a realistic brass zodiac wheel on black velvet, planets represented by gemstone orbs, twelve house divisions engraved without readable text, aspect lines as fine gold and blue threads connecting the orbs. Include a telescope eyepiece and parchment ephemeris texture, but no readable writing. Concept accuracy: planets, zodiac signs, houses, aspects, natal chart and transits.`,
    videoPrompt: "A brass astrology wheel rotates almost imperceptibly while gemstone planets catch light and thin aspect threads shimmer between them. The camera slowly pushes in like a premium documentary macro shot.",
  },
  {
    slug: "vedic",
    label: "Vedic Jyotisha Nakshatra Dasha",
    imagePrompt: `${COMMON_STYLE} Subject: Vedic Jyotisha chart visual: a sidereal zodiac circle over a deep indigo sky, nakshatra segments shown as 27 subtle moonlit facets, a central lagna point as a small golden lamp, graha represented by jewel-like celestial beads, and a spiral timeline for dasha as layered golden rings. Indian scholarly aesthetic, brass, palm-leaf manuscript texture, no readable text. Concept accuracy: sidereal, lagna, graha, bhava, nakshatra, dasha, gochara.`,
    videoPrompt: "Moonlit nakshatra facets illuminate in sequence around a sidereal wheel while a golden dasha spiral turns slowly. The camera floats gently above brass and palm-leaf textures.",
  },
  {
    slug: "uranian",
    label: "Uranian Midpoint Dial",
    imagePrompt: `${COMMON_STYLE} Subject: Uranian astrology 90-degree dial as a precision scientific instrument: concentric black-and-brass rings, midpoint axes shown as luminous crossing lines, planetary picture geometry with small metallic orbs and measurement ticks that are decorative not readable. Modern Hamburg School analytic mood, dark laboratory desk, glass, brass, and starlight. Concept accuracy: midpoint, planetary pictures, 90-degree dial, sensitive points, event axis.`,
    videoPrompt: "A precision 90-degree dial turns a few degrees while midpoint axes align and luminous geometry lines converge on an event point. Camera movement is a slow technical macro pan.",
  },
  {
    slug: "qimen",
    label: "Qi Men Dun Jia Nine Palaces",
    imagePrompt: `${COMMON_STYLE} Subject: Qi Men Dun Jia 奇門遁甲 situation map as a physical nine-palace board carved in dark stone with gold grid lines, eight door tokens, nine star pearls, and eight symbolic deity seals shown as abstract emblems, not religious figures and not readable text. Include compass directions as subtle light beams, strategic tabletop atmosphere. Concept accuracy: nine palaces, eight doors, nine stars, eight deities as symbolic categories, heavenly-earthly stems.`,
    videoPrompt: "A nine-palace stone board glows from beneath as door tokens and star pearls pulse in different palaces. Subtle compass light beams sweep across the board while the camera makes a slow overhead drift.",
  },
  {
    slug: "fengshui-luopan",
    label: "Luopan Feng Shui Compass",
    imagePrompt: `${COMMON_STYLE} Subject: Luopan Feng Shui 羅盤 as a realistic layered Chinese compass placed over an architectural floor plan on aged paper, 24 mountain rings suggested by fine engraved bands without readable characters, flying star markers as small gold and dark blue pins, door, bed, stove, and water positions shown as miniature objects. Concept accuracy: compass degrees, sitting-facing, twenty-four mountains, floor plan, flying stars, spatial reading.`,
    videoPrompt: "A layered luopan compass rests over a floor plan as small location pins brighten and a soft compass needle settles. The camera slowly tilts from the floor plan into the brass rings.",
  },
  {
    slug: "date-picking",
    label: "Date Picking Ze Ri",
    imagePrompt: `${COMMON_STYLE} Subject: Chinese Date Picking 擇日 as an elegant ritual calendar table: layered lunar calendar pages, hour markers, a small brass clock, owner profile token, event seal, and caution markers for clash and direction shown as abstract red-gold accents. No readable dates or text. Concept accuracy: selecting auspicious timing for event type, owner fit, hour, place, avoid rules, Tong Shu-style calendar logic.`,
    videoPrompt: "Calendar pages turn softly in a breeze while a brass clock hand moves to a selected hour and small event tokens align. Camera glides across the desk with warm gold light.",
  },
  {
    slug: "heluo",
    label: "He Luo Hetu Luoshu Bagua",
    imagePrompt: `${COMMON_STYLE} Subject: He Luo 河洛 cosmology foundation: river map and luoshu magic-square inspiration shown as glowing pebble constellations on dark water and stone, bagua trigrams represented by carved abstract line groups around the edge without readable labels, five element streams flowing between numbers and directions. Concept accuracy: Hetu, Luoshu, Bagua, Wuxing, numbers, directions, foundation of Chinese metaphysics.`,
    videoPrompt: "Glowing pebbles on dark water form Hetu and Luoshu patterns as five subtle elemental streams circulate around carved bagua marks. The camera floats low over water and stone.",
  },
];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${(r.stderr || r.stdout || "").slice(0, 1200)}`);
  }
  return r;
}

function convertToWebp(src, dest) {
  run("cwebp", ["-quiet", "-q", "84", src, "-o", dest]);
}

function convertToOg(src, dest) {
  run("convert", [src, "-resize", "1200x630^", "-gravity", "center", "-extent", "1200x630", "-quality", "88", dest]);
}

function fileOk(path, min = 10_000) {
  if (!existsSync(path)) return false;
  return readFileSync(path).length >= min;
}

function writePromptAudit() {
  const audit = {
    generated_at: new Date().toISOString(),
    engine: "Grok CLI authenticated xAI Imagine pipeline",
    grok_cli: "/root/.grok/bin/grok",
    source_modules: [
      "/root/heygen2/packages/shared/src/grok-cli-image-worker.mjs",
      "/root/heygen2/packages/shared/src/grok-cli-video-worker.mjs",
    ],
    constraints: ["bitmap only", "no svg", "no readable text", "no watermark"],
    items: ITEMS.map(({ slug, label, imagePrompt, videoPrompt }) => ({ slug, label, imagePrompt, videoPrompt })),
  };
  writeFileSync(resolve(OUT_DIR, "grok-v3-prompts.json"), `${JSON.stringify(audit, null, 2)}\n`);
}

async function main() {
  const only = new Set(process.argv.slice(2).filter(Boolean));
  writePromptAudit();
  const batchContext = createGrokVideoBatchContext();

  for (const [i, item] of ITEMS.entries()) {
    if (only.size && !only.has(item.slug)) continue;
    const prefix = item.prefix || `science-${item.slug}`;
    const rawPng = join(RAW_DIR, `${prefix}-grok-v3.png`);
    const heroWebp = join(OUT_DIR, `${prefix}-hero-v3.webp`);
    const ogJpg = join(OUT_DIR, `${prefix}-og-v3.jpg`);
    const videoMp4 = join(OUT_DIR, `${prefix}-loop-v3.mp4`);
    console.log(`\n[${i + 1}/${ITEMS.length}] ${item.slug}: image`);

    if (!fileOk(rawPng, 100_000)) {
      const img = await generateGrokImage({
        prompt: item.imagePrompt,
        aspect_ratio: "16:9",
        resolution: "1k",
      });
      writeFileSync(rawPng, Buffer.from(img.b64, "base64"));
      console.log(`  wrote ${rawPng}`);
    } else {
      console.log(`  reuse ${rawPng}`);
    }

    convertToWebp(rawPng, heroWebp);
    convertToOg(rawPng, ogJpg);
    console.log(`  wrote ${heroWebp}`);
    console.log(`  wrote ${ogJpg}`);

    console.log(`[${i + 1}/${ITEMS.length}] ${item.slug}: video`);
    const videoPrompt = [
      item.videoPrompt,
      "Six second premium cinematic educational website loop, slow camera motion only, no readable text, no subtitles, no logos, no watermark, preserve the source image subject and composition.",
    ].join(" ");

    if (!fileOk(videoMp4, 100_000)) {
      const vid = await renderGrokCliVideo({
        prompt: videoPrompt,
        imagePath: rawPng,
        duration: 6,
        aspect: "16:9",
        resolution: "720p",
        timeout_ms: 900000,
        seed: 7300 + i,
        batchContext,
      });
      if (!vid?.ok) throw new Error(`${item.slug} video failed: ${vid?.error || "unknown"}`);
      writeFileSync(videoMp4, vid.video);
      console.log(`  wrote ${videoMp4} (${vid.video.length} bytes, ${vid.video_mode}, ${vid.model || "grok"})`);
    } else {
      console.log(`  reuse ${videoMp4}`);
    }
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
