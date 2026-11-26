/**
 * Composes the Google Play phone screenshots (1080 × 1920, 24-bit RGB) from raw device captures in
 * `store-listing/assets/screenshots/raw/` (1080 × 2400 portrait `adb screencap` PNGs). Each image
 * gets the brand background, a headline and subline (text converted to outlines from the bundled
 * Grandstander and DM Sans fonts with opentype.js, as in `generate-assets.mjs`) and the cropped app
 * screen with rounded corners and a soft shadow. The status bar and the gesture area are always
 * cropped away.
 *
 * Usage: `yarn gen:screenshots`
 */
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseFont } from 'opentype.js/dist/opentype.mjs';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_DIR = join(ROOT, 'store-listing', 'assets', 'screenshots');
const RAW_DIR = join(BASE_DIR, 'raw');
const OUT_DIR = process.env.SCREENSHOTS_OUT_DIR ?? join(BASE_DIR, 'en');
const FONTS_DIR = join(ROOT, 'node_modules', '@expo-google-fonts');

const WIDTH = 1080;
const HEIGHT = 1920;
/** Raw capture size (portrait phone). */
const RAW_WIDTH = 1080;
/** Corner radius of the placed screen, in output px. */
const SCREEN_RADIUS = 48;

/** Classic theme colours (src/render/themes.ts). */
const BG_TOP = '#0E1A2B';
const BG_MID = '#16294A';
const BG_BOTTOM = '#1D3A63';
const ACCENT = '#2EC4FF';
const GOLD = '#FFC83D';

const fmt = (value) => Number(value.toFixed(2));

/**
 * Shots. `crop` is the [top, bottom] row range of the raw capture (status bar and gesture area
 * excluded). `fit` places the whole crop inside the frame; `bleed` sets the width and lets the
 * screen run off the bottom edge. `glow` tints the light behind the screen.
 */
/**
 * One shared screen frame so every gameplay/app shot has identical dimensions. Each `crop` using it
 * spans 1975 raw rows (the 1080 × 1975 window of shot 1), so the scale is the same everywhere.
 */
const DEVICE = { mode: 'device', width: 780, top: 440 };

const SHOTS = [
  {
    file: '01-sort-every-color.png',
    raw: '01-gameplay.png',
    headline: 'Sort every *color*',
    subline: 'Tap, pour, relax. No timers, no pressure.',
    crop: [215, 2190],
    layout: DEVICE,
    glow: '#2EC4FF',
  },
  {
    file: '02-earn-3-stars.png',
    raw: '02-solved.png',
    headline: 'Solve it in style,\nearn *3 stars*',
    subline: 'Fewer moves, bigger rewards',
    crop: [215, 2190],
    layout: DEVICE,
    glow: '#FF9F6B',
    /** The win card from the same solve, lifted out as a callout over the solved board. */
    callout: { raw: '02-win.png', box: [122, 767, 958, 1633], radius: 46, width: 620 },
  },
  {
    file: '03-gets-tricky.png',
    raw: '03-hard-board.png',
    headline: 'Gets satisfyingly *tricky*',
    subline: 'Up to 14 colors and mystery ? segments',
    crop: [215, 2190],
    layout: DEVICE,
    glow: '#B05CFF',
  },
  {
    file: '04-daily-puzzle.png',
    raw: '04-daily.png',
    headline: 'A new puzzle\n*every day*',
    subline: 'Build a streak and open the day-7 chest',
    crop: [105, 2080],
    layout: DEVICE,
    glow: '#2EC4FF',
  },
  {
    file: '05-themes.png',
    raw: '05-themes.png',
    headline: 'Beautiful *themes*\nto unlock',
    subline: 'Restyle your tubes and backgrounds',
    crop: [105, 2080],
    layout: DEVICE,
    glow: '#E879F9',
  },
  {
    file: '06-levels.png',
    raw: '06-levels.png',
    headline: '*300+ levels*\nto master',
    subline: 'Chase 3 stars and unlock new chapters',
    crop: [105, 2080],
    layout: DEVICE,
    glow: '#FF9F6B',
  },
  {
    file: '07-vip.png',
    raw: '07-shop.png',
    headline: 'Go *VIP* for\ndaily rewards',
    subline: 'Optional subscription with extra perks',
    crop: [925, 1592],
    cropX: [34, 1046],
    layout: { mode: 'fit', maxWidth: 960, offsetY: 150 },
    glow: GOLD,
    gem: true,
  },
];

const loadFont = (path) => {
  const bytes = readFileSync(join(FONTS_DIR, path));
  return parseFont(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

const brand = loadFont('grandstander/800ExtraBold/Grandstander_800ExtraBold.ttf');
const sans = loadFont('dm-sans/500Medium/DMSans_500Medium.ttf');

/** SVG path data for an opentype.js path (its own `toPathData` can print NaN for some numbers). */
const pathData = ({ commands }) =>
  commands
    .map((c) => {
      if (c.type === 'Z') return 'Z';
      if (c.type === 'Q') return `Q${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x)} ${fmt(c.y)}`;
      if (c.type === 'C') {
        return `C${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x2)} ${fmt(c.y2)} ${fmt(c.x)} ${fmt(c.y)}`;
      }
      return `${c.type}${fmt(c.x)} ${fmt(c.y)}`;
    })
    .join('');

const measure = (font, text, size) => {
  const glyphs = [...text].map((char) => font.charToGlyph(char));
  const unit = size / font.unitsPerEm;
  return glyphs.reduce((width, glyph, index) => {
    const next = glyphs[index + 1];
    return (
      width + glyph.advanceWidth * unit + (next ? font.getKerningValue(glyph, next) * unit : 0)
    );
  }, 0);
};

/** Glyph paths for `text` starting at (x, baseline). */
const glyphPaths = (font, text, x, baseline, size) => {
  const glyphs = [...text].map((char) => font.charToGlyph(char));
  const unit = size / font.unitsPerEm;
  let pen = x;
  return glyphs
    .map((glyph, index) => {
      const d = pathData(glyph.getPath(pen, baseline, size));
      const next = glyphs[index + 1];
      pen += glyph.advanceWidth * unit + (next ? font.getKerningValue(glyph, next) * unit : 0);
      return d;
    })
    .join(' ');
};

/**
 * A centred line with `*highlighted*` runs: returns { plain, accent } path data.
 */
const centredLine = (font, line, baseline, size) => {
  const runs = line.split('*').map((text, index) => ({ text, accent: index % 2 === 1 }));
  const total = measure(font, runs.map((run) => run.text).join(''), size);
  let x = (WIDTH - total) / 2;
  const plain = [];
  const accent = [];
  for (const run of runs) {
    if (run.text.length === 0) continue;
    (run.accent ? accent : plain).push(glyphPaths(font, run.text, x, baseline, size));
    x += measure(font, run.text, size);
  }
  return { plain: plain.join(' '), accent: accent.join(' '), width: total };
};

/** Headline size: the largest size (≤ 104) whose widest line fits 960 px. */
const headlineSize = (lines) => {
  const widest = Math.max(...lines.map((line) => measure(brand, line.replaceAll('*', ''), 100)));
  return Math.min(104, Math.floor((960 / widest) * 100));
};

const sparkle = (x, y, r, color, opacity = 1) => {
  const k = r * 0.22;
  return `<path d="M${fmt(x)} ${fmt(y - r)} Q${fmt(x + k)} ${fmt(y - k)} ${fmt(x + r)} ${fmt(y)} Q${fmt(x + k)} ${fmt(y + k)} ${fmt(x)} ${fmt(y + r)} Q${fmt(x - k)} ${fmt(y + k)} ${fmt(x - r)} ${fmt(y)} Q${fmt(x - k)} ${fmt(y - k)} ${fmt(x)} ${fmt(y - r)} Z" fill="${color}" fill-opacity="${opacity}"/>`;
};

/** Deterministic pseudo-random numbers (mulberry32), so every run writes the same images. */
const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Rising bubbles: soft glass rings with a highlight, mostly near the edges. */
const bubbles = (seed) => {
  const random = rng(seed);
  const out = [];
  for (let i = 0; i < 16; i += 1) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side < 0 ? random() * 150 : WIDTH - random() * 150;
    const y = 300 + random() * 1600;
    const r = 6 + random() * 22;
    const o = 0.1 + random() * 0.18;
    out.push(
      `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="#BFE6FF" fill-opacity="${fmt(o * 0.35)}" stroke="#DFF4FF" stroke-opacity="${fmt(o * 1.6)}" stroke-width="${fmt(Math.max(1.5, r / 9))}"/>` +
        `<circle cx="${fmt(x - r * 0.35)}" cy="${fmt(y - r * 0.35)}" r="${fmt(r * 0.22)}" fill="#FFFFFF" fill-opacity="${fmt(o * 2)}"/>`,
    );
  }
  return out.join('');
};

/** Soft blurred bokeh dots behind everything. */
const bokeh = (seed) => {
  const random = rng(seed * 7 + 3);
  const out = [];
  for (let i = 0; i < 10; i += 1) {
    out.push(
      `<circle cx="${fmt(random() * WIDTH)}" cy="${fmt(random() * HEIGHT)}" r="${fmt(30 + random() * 70)}" fill="#BFE6FF" fill-opacity="${fmt(0.025 + random() * 0.04)}"/>`,
    );
  }
  return out.join('');
};

/** A liquid wave band across the bottom, in the shot's glow colour. */
const wave = (glow) => `
  <path d="M0 1700 C 220 1640 400 1760 620 1700 S 960 1640 1080 1680 L1080 1920 L0 1920 Z" fill="${glow}" fill-opacity="0.10"/>
  <path d="M0 1780 C 260 1730 460 1830 700 1780 S 980 1740 1080 1770 L1080 1920 L0 1920 Z" fill="${ACCENT}" fill-opacity="0.10"/>`;

const backgroundSvg = (shot, index, screen) => {
  const lines = shot.headline.split('\n');
  const size = headlineSize(lines);
  const lineGap = size * 1.08;
  const top = 150;
  const headline = lines.map((line, i) => centredLine(brand, line, top + i * lineGap, size));
  const subBaseline = top + (lines.length - 1) * lineGap + 84;
  const sub = centredLine(sans, shot.subline, subBaseline, 40);

  const { x, y, w, h } = screen;
  const glowCx = x + w / 2;
  const glowCy = y + Math.min(h, HEIGHT - y) / 2;
  /** Sparkles sit beside the first headline line when there is room, else under the subline. */
  const margin = (WIDTH - headline[0].width) / 2;
  const nearY = top - size * 0.42;
  const sparkles = (
    margin >= 96
      ? [
          sparkle(margin - 52, nearY, 17, GOLD),
          sparkle(margin - 22, nearY + 40, 7, '#FFFFFF', 0.8),
          sparkle(WIDTH - margin + 50, nearY + 34, 14, GOLD),
          sparkle(WIDTH - margin + 26, nearY - 4, 6, '#FFFFFF', 0.75),
        ]
      : [
          sparkle(70, subBaseline + 46, 15, GOLD),
          sparkle(104, subBaseline + 80, 6, '#FFFFFF', 0.8),
          sparkle(WIDTH - 72, subBaseline + 60, 13, GOLD),
          sparkle(WIDTH - 104, subBaseline + 26, 6, '#FFFFFF', 0.75),
        ]
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#0A1424"/>
        <stop offset="0.35" stop-color="${BG_TOP}"/>
        <stop offset="0.7" stop-color="${BG_MID}"/>
        <stop offset="1" stop-color="${BG_BOTTOM}"/>
      </linearGradient>
      <radialGradient id="topglow" gradientUnits="userSpaceOnUse" cx="540" cy="140" r="620">
        <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.22"/>
        <stop offset="0.6" stop-color="${ACCENT}" stop-opacity="0.05"/>
        <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="screenglow" gradientUnits="userSpaceOnUse" cx="${fmt(glowCx)}" cy="${fmt(glowCy)}" r="${fmt(Math.max(w, 700) * 0.85)}">
        <stop offset="0" stop-color="${shot.glow}" stop-opacity="0.34"/>
        <stop offset="0.55" stop-color="${shot.glow}" stop-opacity="0.08"/>
        <stop offset="1" stop-color="${shot.glow}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.06"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="accentFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7FE3FF"/>
        <stop offset="1" stop-color="#1AA7F2"/>
      </linearGradient>
      <linearGradient id="headFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFFFFF"/>
        <stop offset="1" stop-color="#E4F1FF"/>
      </linearGradient>
      <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
      <filter id="textshadow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
      <radialGradient id="gemglow">
        <stop offset="0" stop-color="${GOLD}" stop-opacity="0.38"/>
        <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="28"/></filter>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <path d="M300 -40 L420 -40 L180 1920 L-40 1920 Z" fill="url(#ray)"/>
    <path d="M760 -40 L840 -40 L1120 1600 L960 1600 Z" fill="url(#ray)"/>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#topglow)"/>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#screenglow)"/>
    <g filter="url(#blur)">${bokeh(index + 1)}</g>
    ${wave(shot.glow)}
    ${bubbles(index + 11)}
    <g filter="url(#textshadow)" fill="#020812" fill-opacity="0.55" transform="translate(0 6)">
      ${headline.map((line) => `<path d="${line.plain} ${line.accent}"/>`).join('')}
    </g>
    ${headline.map((line) => `<path d="${line.plain}" fill="url(#headFill)"/><path d="${line.accent}" fill="url(#accentFill)"/>`).join('')}
    <path d="${sub.plain}" fill="#B9C8DD"/>
    ${sparkles}
    ${shot.gem ? gem(WIDTH / 2, (subBaseline + y) / 2 + 10, 230) : ''}
    <rect x="${fmt(x)}" y="${fmt(y + 26)}" width="${fmt(w)}" height="${fmt(h)}" rx="${SCREEN_RADIUS}" fill="#01060E" fill-opacity="0.75" filter="url(#shadow)"/>
  </svg>`;
};

/** A large faceted VIP gem (the shop's diamond icon, drawn bigger) centred at (cx, cy). */
const gem = (cx, cy, size) => {
  const w = size;
  const h = size * 0.78;
  const x0 = cx - w / 2;
  const top = cy - h / 2;
  const shoulder = top + h * 0.32;
  const p = (x, y) => `${fmt(x)} ${fmt(y)}`;
  const tip = p(cx, top + h);
  const tl = p(x0 + w * 0.22, top);
  const tr = p(x0 + w * 0.78, top);
  const l = p(x0, shoulder);
  const r = p(x0 + w, shoulder);
  const m1 = p(x0 + w * 0.32, shoulder);
  const m2 = p(cx, top);
  const m3 = p(x0 + w * 0.68, shoulder);
  return `
    <circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(size * 0.95)}" fill="url(#gemglow)"/>
    <path d="M${tl} L${tr} L${r} L${tip} L${l} Z" fill="#E0A21B"/>
    <path d="M${l} L${m1} L${tip} Z" fill="#F7C948"/>
    <path d="M${m1} L${m3} L${tip} Z" fill="#FFD866"/>
    <path d="M${m3} L${r} L${tip} Z" fill="#E8AE26"/>
    <path d="M${tl} L${m2} L${m1} L${l} Z" fill="#FFE18A"/>
    <path d="M${m2} L${tr} L${r} L${m3} Z" fill="#F9CF55"/>
    <path d="M${m2} L${m3} L${m1} Z" fill="#FFF0BD"/>
    <path d="M${tl} L${tr} L${r} L${tip} L${l} Z" fill="none" stroke="#FFF6D8" stroke-opacity="0.75" stroke-width="5" stroke-linejoin="round"/>
    ${sparkle(cx + w * 0.46, top + h * 0.05, size * 0.1, '#FFFFFF', 0.95)}
    ${sparkle(cx - w * 0.52, cy + h * 0.3, size * 0.07, GOLD)}`;
};

/** Where the screen goes and how large it is. */
const placeScreen = (shot, cropW, cropH) => {
  const top = shot.headline.includes('\n') ? 470 : 380;
  const bottomMargin = 90;
  if (shot.layout.mode === 'device') {
    const scale = shot.layout.width / cropW;
    const w = shot.layout.width;
    return { x: (WIDTH - w) / 2, y: shot.layout.top, w, h: cropH * scale, scale };
  }
  if (shot.layout.mode === 'bleed') {
    const scale = shot.layout.width / cropW;
    const w = shot.layout.width;
    return { x: (WIDTH - w) / 2, y: top, w, h: cropH * scale, scale };
  }
  const avail = HEIGHT - top - bottomMargin;
  const scale = Math.min(shot.layout.maxWidth / cropW, avail / cropH);
  const w = cropW * scale;
  const h = cropH * scale;
  const offsetY = shot.layout.offsetY ?? 0;
  return { x: (WIDTH - w) / 2, y: top + (avail - h) / 2 + offsetY, w, h, scale };
};

const roundedMask = (w, h, r) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`,
  );

/** Thin glass rim drawn over the screen edge. */
const rim = (w, h, r) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="${r - 1.5}" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="3"/></svg>`,
  );

/** A card cut from another capture, floated over the centre of the screen card. */
const calloutLayers = async (callout, screen) => {
  const [cx0, cy0, cx1, cy1] = callout.box;
  const scale = callout.width / (cx1 - cx0);
  const w = Math.round(callout.width);
  const h = Math.round((cy1 - cy0) * scale);
  const r = Math.round(callout.radius * scale);
  const left = Math.round((WIDTH - w) / 2);
  /** Centred on the screen card, like the real win dialog. */
  const top = Math.round(screen.y + (screen.h - h) / 2);
  const card = await sharp(join(RAW_DIR, callout.raw))
    .extract({ left: cx0, top: cy0, width: cx1 - cx0, height: cy1 - cy0 })
    .resize(w, h, { kernel: 'lanczos3' })
    .ensureAlpha()
    .composite([
      { input: roundedMask(w, h, r), blend: 'dest-in' },
      { input: rim(w, h, r), blend: 'over' },
    ])
    .png()
    .toBuffer();
  const pad = 90;
  const shadow = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w + pad * 2}" height="${h + pad * 2}"><defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="30"/></filter></defs><rect x="${pad}" y="${pad + 30}" width="${w}" height="${h}" rx="${r}" fill="#01060E" fill-opacity="0.8" filter="url(#s)"/></svg>`,
  );
  return [
    { input: shadow, left: left - pad, top: top - pad },
    { input: card, left, top },
  ];
};

const compose = async (shot, index) => {
  const [y0, y1] = shot.crop;
  const [x0, x1] = shot.cropX ?? [0, RAW_WIDTH];
  const cropW = x1 - x0;
  const cropH = y1 - y0;
  const screen = placeScreen(shot, cropW, cropH);
  const w = Math.round(screen.w);
  const h = Math.round(screen.h);
  const x = Math.round(screen.x);
  const y = Math.round(screen.y);

  const resized = await sharp(join(RAW_DIR, shot.raw))
    .extract({ left: x0, top: y0, width: cropW, height: cropH })
    .resize(w, h, { kernel: 'lanczos3' })
    .ensureAlpha()
    .composite([
      { input: roundedMask(w, h, SCREEN_RADIUS), blend: 'dest-in' },
      { input: rim(w, h, SCREEN_RADIUS), blend: 'over' },
    ])
    .png()
    .toBuffer();

  /** Clip whatever bleeds past the bottom edge. */
  const visibleH = Math.min(h, HEIGHT - y);
  const placed =
    visibleH < h
      ? await sharp(resized).extract({ left: 0, top: 0, width: w, height: visibleH }).toBuffer()
      : resized;

  const layers = [{ input: placed, left: x, top: y }];
  if (shot.callout) layers.push(...(await calloutLayers(shot.callout, { y, h })));

  const background = Buffer.from(backgroundSvg(shot, index, { x, y, w, h }));
  const out = join(OUT_DIR, shot.file);
  await sharp(background)
    .composite(layers)
    .flatten({ background: BG_TOP })
    .removeAlpha()
    .toColourspace('srgb')
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`wrote ${relative(ROOT, out)}`);
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [index, shot] of SHOTS.entries()) {
  await compose(shot, index);
}
