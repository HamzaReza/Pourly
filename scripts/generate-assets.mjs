/**
 * Draws the launcher icons, splash mark, notification icon, favicon and Play Store graphics
 * (spec §21) as SVG and rasterizes them with sharp. Fully procedural, no downloads. The feature
 * graphic's text is converted to outlines from the bundled brand fonts (Grandstander, DM Sans) with
 * opentype.js, so the output does not depend on installed fonts, and the same sharp/libvips
 * version writes byte-identical PNGs on every run.
 *
 * Usage: `yarn gen:assets`
 */
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The package's ESM build: its CommonJS `main` exposes no named exports to Node. */
import { parse as parseFont } from 'opentype.js/dist/opentype.mjs';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** `ASSETS_OUT_DIR` redirects every output into one folder (used to check determinism). */
const OUT_OVERRIDE = process.env.ASSETS_OUT_DIR;
const IMAGES_DIR = OUT_OVERRIDE ?? join(ROOT, 'assets', 'images');
const STORE_DIR = OUT_OVERRIDE ?? join(ROOT, 'store-listing', 'assets');
/** The app has no web target; the favicon serves the Firebase Hosting pages. */
const HOSTING_DIR = OUT_OVERRIDE ?? join(ROOT, 'public');

/** Classic theme background stops and accent (src/render/themes.ts). */
const BG_TOP = '#0E1A2B';
const BG_MID = '#16294A';
const BG_BOTTOM = '#1D3A63';
const ACCENT = '#2EC4FF';

/** Liquid slots per tube (src/render/palette.ts colors are used inline below). */
const SLOTS = 4;

const MASTER = 1024;
/**
 * Adaptive icon layers are 108 dp; launchers only guarantee the central 66 dp circle (626 px of
 * 1024), which sits inside the "central 66%" rule of thumb (676 px).
 */
const SAFE_DIAMETER = Math.round((MASTER * 66) / 108);
/** Android 12+ masks the splash icon to a circle two thirds of its size. */
const SPLASH_DIAMETER = Math.round((MASTER * 2) / 3);

const fmt = (value) => Number(value.toFixed(2));

const hexToRgb = (hex) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const mix = (hex, target, amount) => {
  const from = hexToRgb(hex);
  const to = hexToRgb(target);
  return `#${from
    .map((channel, index) => Math.round(channel + (to[index] - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
};

/** Tube size in its own units; the bottom is a half circle of the tube width. */
const TUBE_W = 200;
const TUBE_H = 600;
const GLASS_STROKE = 15;
const LIP_H = 30;
const LIP_OVERHANG = 14;
const LIQUID_TOP = 128;

const tubeOutline = (w, h) => {
  const r = w / 2;
  return `M0 0 L0 ${fmt(h - r)} A${fmt(r)} ${fmt(r)} 0 0 0 ${fmt(w)} ${fmt(h - r)} L${fmt(w)} 0 Z`;
};

const sharedDefs = () => `
  <linearGradient id="cylinder" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#000000" stop-opacity="0.3"/>
    <stop offset="0.22" stop-color="#FFFFFF" stop-opacity="0.12"/>
    <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
    <stop offset="0.82" stop-color="#000000" stop-opacity="0.12"/>
    <stop offset="1" stop-color="#000000" stop-opacity="0.38"/>
  </linearGradient>
  <linearGradient id="highlight" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/>
    <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.45"/>
    <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.12"/>
  </linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#F2FAFF" stop-opacity="0.95"/>
    <stop offset="1" stop-color="#8CCBFF" stop-opacity="0.8"/>
  </linearGradient>
  <linearGradient id="lip" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="1"/>
    <stop offset="1" stop-color="#CFE6FF" stop-opacity="0.92"/>
  </linearGradient>
  <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#020812" stop-opacity="0.6"/>
    <stop offset="0.55" stop-color="#020812" stop-opacity="0.3"/>
    <stop offset="1" stop-color="#020812" stop-opacity="0"/>
  </radialGradient>`;

const backgroundRect = (width, height) => `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="0.5" stop-color="${BG_MID}"/>
      <stop offset="1" stop-color="${BG_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.32"/>
      <stop offset="0.6" stop-color="${ACCENT}" stop-opacity="0.07"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>`;

const svg = (width, height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${sharedDefs()}</defs>${body}</svg>`;

const adaptiveBackgroundSvg = () => svg(MASTER, MASTER, backgroundRect(MASTER, MASTER));

/** One bold tube for the 24 dp status bar: outline, lip and liquid, white on transparent. */
const notificationSvg = () => {
  const size = 96;
  const w = 40;
  const h = 76;
  const stroke = 7;
  const gap = 5;
  const x = (size - w) / 2;
  const y = (size - h) / 2 + 3;
  const r = w / 2;
  const innerW = w - (stroke + gap * 2);
  const innerR = innerW / 2;
  const innerBottom = h - stroke / 2 - gap;
  const liquidTop = h * 0.4;
  const liquid = `M0 ${fmt(liquidTop)} L0 ${fmt(innerBottom - innerR)} A${fmt(innerR)} ${fmt(innerR)} 0 0 0 ${fmt(innerW)} ${fmt(innerBottom - innerR)} L${fmt(innerW)} ${fmt(liquidTop)} Z`;
  return svg(
    size,
    size,
    `<g transform="translate(${fmt(x)} ${fmt(y)})">
      <path d="M0 0 L0 ${fmt(h - r)} A${fmt(r)} ${fmt(r)} 0 0 0 ${w} ${fmt(h - r)} L${w} 0" fill="none" stroke="#FFFFFF" stroke-width="${stroke}"/>
      <path transform="translate(${fmt(stroke / 2 + gap)} 0)" d="${liquid}" fill="#FFFFFF"/>
      <rect x="-6" y="-5" width="${w + 12}" height="10" rx="5" fill="#FFFFFF"/>
    </g>`,
  );
};

/**
 * Feature graphic type. librsvg ignores @font-face, so text is converted to outlines with
 * opentype.js from the brand fonts installed as Expo Google Fonts packages.
 */
const FONTS_DIR = join(ROOT, 'node_modules', '@expo-google-fonts');
const GOLD = '#FFC83D';

const loadFont = (path) => {
  const bytes = readFileSync(join(FONTS_DIR, path));
  return parseFont(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

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

/**
 * Lays `text` out glyph by glyph (kerning plus optional `tracking` in px) starting at (x, baseline).
 * Returns each glyph's path data and the total advance.
 */
const layoutText = (font, text, x, baseline, size, tracking = 0) => {
  /** Per-character lookup: plain Latin needs no shaping (and DM Sans' GSUB trips opentype.js). */
  const glyphs = [...text].map((char) => font.charToGlyph(char));
  const unit = size / font.unitsPerEm;
  let pen = x;
  const paths = glyphs.map((glyph, index) => {
    const d = pathData(glyph.getPath(pen, baseline, size));
    const next = glyphs[index + 1];
    pen += glyph.advanceWidth * unit + (next ? font.getKerningValue(glyph, next) * unit : 0);
    if (next) pen += tracking;
    return d;
  });
  return { paths, width: pen - x };
};

/** Scene tube scale (tube units → feature graphic px). */
const SCENE_SCALE = 0.36;

/** Liquid segments, separators and surface for an upright tube (tube-interior coordinates). */
const tubeLiquid = (layers, id, innerW, innerH) => {
  const slotH = (innerH - LIQUID_TOP) / SLOTS;
  /** Matching neighbours read as one sorted block: one rect and no separator between them. */
  const segments = layers
    .map((color, layer) => {
      if (layer > 0 && color === layers[layer - 1]) return '';
      let run = 1;
      while (layers[layer + run] === color) run += 1;
      const top = innerH - slotH * (layer + run);
      const extra = layer === 0 ? slotH : 0;
      return `<rect x="0" y="${fmt(top)}" width="${fmt(innerW)}" height="${fmt(slotH * run + extra + 1)}" fill="url(#${id}-seg${layer})"/>`;
    })
    .join('');
  const separators = layers
    .slice(0, -1)
    .map((color, layer) =>
      color === layers[layer + 1]
        ? ''
        : `<rect x="0" y="${fmt(innerH - slotH * (layer + 1) - 2)}" width="${fmt(innerW)}" height="4" fill="#000000" fill-opacity="0.14"/>`,
    )
    .join('');
  const surfaceY = innerH - slotH * layers.length;
  const surface = `<ellipse cx="${fmt(innerW / 2)}" cy="${fmt(surfaceY)}" rx="${fmt(innerW / 2)}" ry="13" fill="${mix(layers[layers.length - 1], '#FFFFFF', 0.45)}"/>`;
  return { markup: `${segments}${separators}${surface}`, surfaceY };
};

const segmentGradients = (layers, id) =>
  layers
    .map(
      (color, layer) => `
      <linearGradient id="${id}-seg${layer}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${mix(color, '#FFFFFF', 0.14)}"/>
        <stop offset="1" stop-color="${mix(color, '#000000', 0.1)}"/>
      </linearGradient>`,
    )
    .join('');

/**
 * Glass, highlights and lip drawn over a tube's contents (tube coordinates). `h` is the tube
 * length and `glass` the glass stroke width, both in tube units.
 */
const tubeGlass = (h = TUBE_H, glass = GLASS_STROKE) => `
  <path d="${tubeOutline(TUBE_W, h)}" fill="none" stroke="url(#glass)" stroke-width="${glass}"/>
  <rect x="${fmt(TUBE_W * 0.15)}" y="${fmt(LIP_H + 26)}" width="${fmt(TUBE_W * 0.12)}" height="${fmt(h - LIP_H - TUBE_W * 0.62)}" rx="${fmt(TUBE_W * 0.06)}" fill="url(#highlight)"/>
  <rect x="${fmt(TUBE_W * 0.78)}" y="${fmt(LIP_H + 40)}" width="${fmt(TUBE_W * 0.05)}" height="${fmt(h * 0.22)}" rx="${fmt(TUBE_W * 0.025)}" fill="#FFFFFF" fill-opacity="0.3"/>
  <rect x="${-LIP_OVERHANG}" y="${-LIP_H / 2}" width="${TUBE_W + LIP_OVERHANG * 2}" height="${LIP_H}" rx="${LIP_H / 2}" fill="url(#lip)"/>`;

/**
 * An upright tube with its bottom centre at (cx, bottom), wrapped in a group with id `${id}-tube`.
 * `inside({ surfaceY })` returns extra world-coordinate markup clipped to the tube interior (the
 * incoming stream and splash), given the world y of the liquid surface. `s` scales tube units to
 * px; `h` and `glass` override the tube length and glass stroke (tube units).
 */
const sceneTube = ({
  id,
  layers,
  cx,
  bottom,
  inside = () => '',
  s = SCENE_SCALE,
  h = TUBE_H,
  glass = GLASS_STROKE,
}) => {
  const ox = cx - (TUBE_W * s) / 2;
  const oy = bottom - h * s;
  const inset = glass / 2;
  const innerW = TUBE_W - inset * 2;
  const innerH = h - inset;
  const liquid = tubeLiquid(layers, id, innerW, innerH);
  const toWorld = `translate(${fmt(-inset)} 0) scale(${fmt(1 / s)}) translate(${fmt(-ox)} ${fmt(-oy)})`;
  return {
    top: oy,
    markup: `
    <defs>
      <clipPath id="${id}-inner"><path d="${tubeOutline(innerW, innerH)}"/></clipPath>
      ${segmentGradients(layers, id)}
    </defs>
    <g id="${id}-tube" transform="translate(${fmt(ox)} ${fmt(oy)}) scale(${s})">
      <path d="${tubeOutline(TUBE_W, h)}" fill="#FFFFFF" fill-opacity="0.08"/>
      <g transform="translate(${fmt(inset)} 0)" clip-path="url(#${id}-inner)">
        ${liquid.markup}
        <g transform="${toWorld}">${inside({ surfaceY: oy + liquid.surfaceY * s })}</g>
        <rect x="0" y="0" width="${fmt(innerW)}" height="${fmt(innerH)}" fill="url(#cylinder)"/>
      </g>
      ${tubeGlass(h, glass)}
    </g>`,
  };
};

/**
 * A tube tipped over mid-pour: mouth centre at `mouth`, rotated by `angle` degrees. Its liquid
 * stays level in world space; `bands` lists colors from the mouth end with their depth in px.
 */
const pouringTube = ({
  id,
  mouth,
  angle,
  level,
  bands,
  s = SCENE_SCALE,
  h = TUBE_H,
  glass = GLASS_STROKE,
}) => {
  const inset = glass / 2;
  const innerW = TUBE_W - inset * 2;
  const innerH = h - inset;
  const rad = (angle * Math.PI) / 180;
  /** World offset of the lower mouth corner (where the liquid leaves the glass). */
  const half = (TUBE_W / 2) * s;
  const corners = [-1, 1].map((side) => ({
    x: side * half * Math.cos(rad),
    y: side * half * Math.sin(rad),
  }));
  const lip = corners[0].y > corners[1].y ? corners[0] : corners[1];
  let y = level;
  const fills = bands
    .map(({ color, depth }, index) => {
      const top = y - depth;
      const rect = `<rect x="-400" y="${fmt(top)}" width="800" height="${fmt(y - top + (index === 0 ? 400 : 1))}" fill="${color}"/>`;
      y = top;
      return rect;
    })
    .join('');
  const bandShade = `
      <linearGradient id="${id}-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.12"/>
      </linearGradient>`;
  const surface = `<rect x="-400" y="${fmt(y - 2)}" width="800" height="5" fill="${mix(bands[bands.length - 1].color, '#FFFFFF', 0.45)}"/>`;
  const local = `translate(${fmt(mouth.x)} ${fmt(mouth.y)}) rotate(${angle}) scale(${s}) translate(${-TUBE_W / 2} 0)`;
  const toWorld = `translate(${fmt(TUBE_W / 2 - inset)} 0) scale(${fmt(1 / s)}) rotate(${-angle})`;
  return {
    /** Where the stream leaves: just inside the lower lip, heading out of the mouth. */
    spout: { x: mouth.x + lip.x * 0.8, y: mouth.y + lip.y * 0.8 },
    out: { x: Math.sin(rad), y: -Math.cos(rad) },
    markup: `
    <defs>
      <clipPath id="${id}-inner"><path d="${tubeOutline(innerW, innerH)}"/></clipPath>
      ${bandShade}
    </defs>
    <g transform="${local}">
      <path d="${tubeOutline(TUBE_W, h)}" fill="#FFFFFF" fill-opacity="0.08"/>
      <g transform="translate(${fmt(inset)} 0)" clip-path="url(#${id}-inner)">
        <g transform="${toWorld}">${fills}<rect x="-400" y="${fmt(y)}" width="800" height="400" fill="url(#${id}-shade)"/>${surface}</g>
        <rect x="0" y="0" width="${fmt(innerW)}" height="${fmt(innerH)}" fill="url(#cylinder)"/>
      </g>
      ${tubeGlass(h, glass)}
    </g>`,
  };
};

/** Four-point sparkle centred at (x, y). */
const sparkle = (x, y, r, color, opacity = 1) => {
  const k = r * 0.22;
  return `<path d="M${fmt(x)} ${fmt(y - r)} Q${fmt(x + k)} ${fmt(y - k)} ${fmt(x + r)} ${fmt(y)} Q${fmt(x + k)} ${fmt(y + k)} ${fmt(x)} ${fmt(y + r)} Q${fmt(x - k)} ${fmt(y + k)} ${fmt(x - r)} ${fmt(y)} Q${fmt(x - k)} ${fmt(y - k)} ${fmt(x)} ${fmt(y - r)} Z" fill="${color}" fill-opacity="${opacity}"/>`;
};

/** Soft out-of-focus bubbles: [x, y, radius, opacity]. Fixed so the output stays deterministic. */
const BOKEH = [
  [70, 70, 26, 0.05],
  [168, 440, 40, 0.04],
  [420, 52, 14, 0.07],
  [492, 420, 22, 0.05],
  [560, 96, 9, 0.1],
  [968, 120, 34, 0.05],
  [944, 448, 18, 0.06],
  [640, 470, 12, 0.06],
  [860, 60, 7, 0.12],
  [330, 470, 8, 0.08],
];

const featureGraphicSvg = () => {
  const width = 1024;
  const height = 500;
  const brand = loadFont('grandstander/800ExtraBold/Grandstander_800ExtraBold.ttf');
  const sans = loadFont('dm-sans/500Medium/DMSans_500Medium.ttf');
  const sansBold = loadFont('dm-sans/700Bold/DMSans_700Bold.ttf');

  /** Left column: wordmark, tagline, level pill, all left-aligned on `textX`. */
  const textX = 104;
  const word = layoutText(brand, 'Pourly', textX, 228, 138);
  const pour = word.paths.slice(0, 4).join(' ');
  const ly = word.paths.slice(4).join(' ');
  const tagline = layoutText(sans, 'Sort the colors. Relax your mind.', textX + 4, 302, 25);
  const pillH = 36;
  const pillX = textX + 4;
  const pillY = 330;
  const pillLabel = layoutText(sansBold, '300+ LEVELS', pillX + 38, pillY + 24, 16, 1.4);
  const pillW = pillLabel.width + 38 + 18;

  /** Right side: the pour scene. */
  const stream = '#FF4D6D';
  const left = sceneTube({
    id: 'fa',
    layers: ['#8B5CF6', '#00C2A8', '#FF9F1C', '#2EC4FF'],
    cx: 590,
    bottom: 404,
  });
  const right = sceneTube({
    id: 'fc',
    layers: ['#FFD60A', '#FFD60A', '#FFD60A', '#FFD60A'],
    cx: 868,
    bottom: 414,
  });
  const targetX = 724;
  const source = pouringTube({
    id: 'fs',
    mouth: { x: 718, y: 172 },
    angle: 242,
    level: 22,
    bands: [
      { color: stream, depth: 22 },
      { color: '#00C2A8', depth: 20 },
    ],
  });
  const p0 = source.spout;
  const landX = targetX - 2;
  const c1 = { x: p0.x + source.out.x * 7, y: p0.y + source.out.y * 7 };
  const streamPath = `M${fmt(p0.x)} ${fmt(p0.y)} C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(landX)} ${fmt(p0.y + 12)} ${fmt(landX)} ${fmt(p0.y + 44)}`;
  /** The stream ends `endY` (just under the receiving tube's liquid surface). */
  const streamStroke = (endY, extra) =>
    `<path d="${streamPath} L${fmt(landX)} ${fmt(endY)}" fill="none" stroke-linecap="round" ${extra}/>`;
  const splash = (sy) => `
    <ellipse cx="${fmt(landX)}" cy="${fmt(sy)}" rx="22" ry="5" fill="#FFFFFF" fill-opacity="0.55"/>
    <circle cx="${fmt(landX - 17)}" cy="${fmt(sy - 13)}" r="3.6" fill="${mix(stream, '#FFFFFF', 0.2)}"/>
    <circle cx="${fmt(landX + 15)}" cy="${fmt(sy - 18)}" r="3" fill="${mix(stream, '#FFFFFF', 0.2)}"/>
    <circle cx="${fmt(landX - 8)}" cy="${fmt(sy - 24)}" r="2.2" fill="${mix(stream, '#FFFFFF', 0.3)}"/>
    <circle cx="${fmt(landX + 22)}" cy="${fmt(sy - 6)}" r="2.4" fill="${mix(stream, '#FFFFFF', 0.3)}"/>`;
  const target = sceneTube({
    id: 'fb',
    layers: ['#3A6BFF', '#7ED957', stream],
    cx: targetX,
    bottom: 440,
    inside: ({ surfaceY }) =>
      `${streamStroke(surfaceY + 4, 'stroke="url(#stream)" stroke-width="13"')}${splash(surfaceY)}`,
  });
  const lipTop = target.top - (LIP_H / 2) * SCENE_SCALE;

  /** A faint mirror image of an upright tube on the glossy floor, fading out within 56 px. */
  const reflection = (id, tube, bottom) => `
    <defs>
      <linearGradient id="${id}-fade" gradientUnits="userSpaceOnUse" x1="0" y1="${bottom}" x2="0" y2="${bottom + 56}">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </linearGradient>
      <mask id="${id}-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
        <rect x="0" y="${bottom}" width="${width}" height="60" fill="url(#${id}-fade)"/>
      </mask>
    </defs>
    <g mask="url(#${id}-mask)">
      <use href="#${tube}-tube" transform="translate(0 ${fmt(bottom * 2 + 4)}) scale(1 -1)"/>
    </g>`;

  const floorShadow = (cx, y, rx) =>
    `<ellipse cx="${fmt(cx)}" cy="${fmt(y)}" rx="${fmt(rx)}" ry="12" fill="url(#shadow)"/>`;

  const bokeh = BOKEH.map(
    ([x, y, r, opacity]) =>
      `<circle cx="${x}" cy="${y}" r="${r}" fill="#BFE6FF" fill-opacity="${opacity}"/>`,
  ).join('');

  return svg(
    width,
    height,
    `<defs>
      <linearGradient id="fbg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${BG_TOP}"/>
        <stop offset="0.55" stop-color="${BG_MID}"/>
        <stop offset="1" stop-color="#1B3A66"/>
      </linearGradient>
      <radialGradient id="pool" gradientUnits="userSpaceOnUse" cx="740" cy="300" r="330">
        <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.3"/>
        <stop offset="0.45" stop-color="${ACCENT}" stop-opacity="0.1"/>
        <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="textpool" gradientUnits="userSpaceOnUse" cx="280" cy="250" r="300">
        <stop offset="0" stop-color="#3A6BFF" stop-opacity="0.14"/>
        <stop offset="1" stop-color="#3A6BFF" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="stage">
        <stop offset="0" stop-color="#7FD8FF" stop-opacity="0.16"/>
        <stop offset="1" stop-color="#7FD8FF" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="vignette" gradientUnits="userSpaceOnUse" cx="512" cy="250" r="620">
        <stop offset="0.55" stop-color="#050C18" stop-opacity="0"/>
        <stop offset="1" stop-color="#050C18" stop-opacity="0.55"/>
      </radialGradient>
      <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.07"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="pourFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFFFFF"/>
        <stop offset="1" stop-color="#E4F1FF"/>
      </linearGradient>
      <linearGradient id="lyFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6AD8FF"/>
        <stop offset="1" stop-color="#1AA7F2"/>
      </linearGradient>
      <linearGradient id="stream" gradientUnits="userSpaceOnUse" x1="0" y1="${fmt(p0.y)}" x2="0" y2="${fmt(p0.y + 120)}">
        <stop offset="0" stop-color="${mix(stream, '#FFFFFF', 0.1)}"/>
        <stop offset="1" stop-color="${stream}"/>
      </linearGradient>
      <linearGradient id="pillFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFD766"/>
        <stop offset="1" stop-color="${GOLD}"/>
      </linearGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="160%">
        <feGaussianBlur stdDeviation="7"/>
      </filter>
      <filter id="blur3" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3"/>
      </filter>
      <clipPath id="aboveLip"><rect x="0" y="0" width="${width}" height="${fmt(lipTop + 2)}"/></clipPath>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#fbg)"/>
    <g>
      <path d="M560 -20 L640 -20 L520 520 L380 520 Z" fill="url(#ray)"/>
      <path d="M700 -20 L740 -20 L660 520 L590 520 Z" fill="url(#ray)"/>
      <path d="M840 -20 L900 -20 L880 520 L780 520 Z" fill="url(#ray)"/>
    </g>
    <rect width="${width}" height="${height}" fill="url(#textpool)"/>
    <rect width="${width}" height="${height}" fill="url(#pool)"/>
    <g filter="url(#blur3)">${bokeh}</g>

    <ellipse cx="748" cy="428" rx="290" ry="46" fill="url(#stage)"/>
    ${reflection('ra', 'fa', 404)}
    ${reflection('rb', 'fb', 440)}
    ${reflection('rc', 'fc', 414)}
    ${floorShadow(590, 410, 62)}
    ${floorShadow(724, 446, 62)}
    ${floorShadow(868, 420, 62)}
    ${left.markup}
    ${right.markup}
    ${target.markup}
    ${source.markup}
    <g clip-path="url(#aboveLip)">
      ${streamStroke(target.top, 'stroke="url(#stream)" stroke-width="13"')}
      ${streamStroke(target.top, 'stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="3" transform="translate(-3 0)"')}
    </g>
    ${sparkle(676, 186, 8, GOLD)}
    ${sparkle(926, 232, 7, GOLD)}
    ${sparkle(906, 206, 4, '#FFFFFF', 0.85)}

    <rect width="${width}" height="${height}" fill="url(#vignette)"/>

    <g>
      <path d="${pour} ${ly}" fill="#020812" fill-opacity="0.45" transform="translate(0 12)" filter="url(#soft)"/>
      <path d="${pour} ${ly}" fill="#0A1A33" transform="translate(0 5)"/>
      <path d="${pour}" fill="url(#pourFill)"/>
      <path d="${ly}" fill="url(#lyFill)"/>
    </g>
    <path d="${tagline.paths.join(' ')}" fill="#C3D4EC"/>
    <rect x="${fmt(pillX)}" y="${pillY}" width="${fmt(pillW)}" height="${pillH}" rx="${pillH / 2}" fill="url(#pillFill)"/>
    ${sparkle(pillX + 22, pillY + pillH / 2, 8, '#3A2600')}
    <path d="${pillLabel.paths.join(' ')}" fill="#3A2600"/>
    ${sparkle(textX + word.width + 14, 120, 10, GOLD)}`,
  );
};

/**
 * The app mark, "trio with depth": a large front tube of mixed layers between two smaller tubes set
 * back (left mixed, right fully sorted to show the goal), with a gold sparkle. Drawn in its own
 * frame (front tube's bottom centre at the origin, px = tube units at `s` 1) with the feature
 * graphic's tube helpers, then fitted into a circle by `placeMark`. Heavy glass strokes and at most
 * four layers per tube keep it legible at launcher and favicon sizes; the back tubes are smaller,
 * raised and dimmed, and the front tube's glass overlaps theirs.
 */
const TRIO = {
  front: {
    cx: 0,
    bottom: 0,
    s: 1,
    h: 540,
    glass: 28,
    layers: ['#3A6BFF', '#FF4D6D', '#3A6BFF', '#FF4D6D'],
  },
  back: [
    {
      cx: -164,
      bottom: -36,
      s: 0.9,
      h: 520,
      glass: 31,
      layers: ['#8B5CF6', '#00C2A8', '#FF9F1C'],
    },
    {
      cx: 164,
      bottom: -36,
      s: 0.9,
      h: 520,
      glass: 31,
      layers: ['#FFD60A', '#FFD60A', '#FFD60A', '#FFD60A'],
    },
  ],
  /** Tucked above the sorted tube beside the front lip, inside the tubes' reach so no mask trims it. */
  sparkle: { x: 168, y: -572, r: 32 },
  shadow: { cy: 12, rx: 250, ry: 30 },
};

const trioTubes = () => [...TRIO.back, TRIO.front];

/**
 * Outermost features of the tubes as circles {x, y, r} (r = 0 for corners): lip corners and the
 * round bottoms. The sparkle sits inside their reach and the shadow is a soft fade, so neither
 * sizes the mark.
 */
const tubeExtents = () =>
  trioTubes().flatMap(({ cx, bottom, s, h, glass }) => {
    const top = bottom - h * s;
    const lipX = (TUBE_W / 2 + LIP_OVERHANG) * s;
    return [
      { x: cx - lipX, y: top - (LIP_H / 2) * s, r: 0 },
      { x: cx + lipX, y: top - (LIP_H / 2) * s, r: 0 },
      { x: cx, y: bottom - (TUBE_W / 2) * s, r: (TUBE_W / 2 + glass / 2) * s },
    ];
  });

/**
 * The tubes' bounding box, its centre (horizontally the front tube, which the trio is symmetric
 * about) and their reach: the farthest extent from that centre, sparkle included.
 */
const markBounds = () => {
  const extents = tubeExtents();
  const minX = Math.min(...extents.map((e) => e.x - e.r));
  const maxX = Math.max(...extents.map((e) => e.x + e.r));
  const minY = Math.min(...extents.map((e) => e.y - e.r));
  const maxY = Math.max(...extents.map((e) => e.y + e.r));
  const cx = TRIO.front.cx;
  const cy = (minY + maxY) / 2;
  const reach = Math.max(
    ...[...extents, TRIO.sparkle].map((e) => Math.hypot(e.x - cx, e.y - cy) + e.r),
  );
  return { cx, cy, reach, width: maxX - minX, height: maxY - minY };
};

/**
 * Wraps mark markup centred at (x, y) and scaled either so the tubes and sparkle fit a circle
 * (`{ radius }`, for masked layers) or so the tubes' bounding box spans `{ box }` px on its longer
 * side (for the full-bleed icon).
 */
const placeMark = (markup, x, y, { radius, box }) => {
  const { cx, cy, reach, width, height } = markBounds();
  const k = radius ? radius / reach : box / Math.max(width, height);
  return `<g transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(k * 1000) / 1000}) translate(${fmt(-cx)} ${fmt(-cy)})">${markup}</g>`;
};

/** Full-color trio mark (ids prefixed with `prefix` so several can share a document). */
const trioMark = (prefix) => {
  const back = TRIO.back
    .map((tube, index) => sceneTube({ ...tube, id: `${prefix}b${index}` }).markup)
    .join('');
  const front = sceneTube({ ...TRIO.front, id: `${prefix}f` }).markup;
  const { cy, rx, ry } = TRIO.shadow;
  /** The front tube's outer silhouette (glass stroke and lip), cut out of everything behind it. */
  const { cx, bottom, s, h, glass } = TRIO.front;
  const silhouette = `
    <g transform="translate(${fmt(cx - (TUBE_W / 2) * s)} ${fmt(bottom - h * s)}) scale(${s})">
      <path d="${tubeOutline(TUBE_W, h)}" fill="#000000" stroke="#000000" stroke-width="${glass}"/>
      <rect x="${-LIP_OVERHANG}" y="${-LIP_H / 2}" width="${TUBE_W + LIP_OVERHANG * 2}" height="${LIP_H}" rx="${LIP_H / 2}" fill="#000000"/>
    </g>`;
  return `
    <defs>
      <mask id="${prefix}-behind" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000">
        <rect x="-2000" y="-2000" width="4000" height="4000" fill="#FFFFFF"/>
        ${silhouette}
      </mask>
      <filter id="${prefix}-dim" color-interpolation-filters="sRGB">
        <feComponentTransfer>
          <feFuncR type="linear" slope="0.88"/>
          <feFuncG type="linear" slope="0.88"/>
          <feFuncB type="linear" slope="0.92"/>
        </feComponentTransfer>
      </filter>
    </defs>
    <g mask="url(#${prefix}-behind)">
      <ellipse cx="0" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#shadow)"/>
      <g filter="url(#${prefix}-dim)">${back}</g>
    </g>
    <ellipse cx="0" cy="${cy - 4}" rx="${fmt(rx * 0.5)}" ry="${fmt(ry * 0.8)}" fill="url(#shadow)"/>
    ${front}
    ${sparkle(TRIO.sparkle.x, TRIO.sparkle.y, TRIO.sparkle.r, GOLD)}`;
};

/**
 * The trio as one white silhouette: glass outlines, lips and liquid separated by gaps, with a gap
 * cut around the front tube so the back tubes read as behind it.
 */
const trioMonoMark = (prefix) => {
  const strokePx = 30;
  const gapPx = 24;
  const shape = ({ cx, bottom, s, h }, inner) => {
    const stroke = strokePx / s;
    const gap = gapPx / s;
    const pad = stroke / 2 + gap;
    const w = TUBE_W - pad * 2;
    const r = w / 2;
    const slotH = (h - LIQUID_TOP) / SLOTS;
    const lip = `<rect x="${-LIP_OVERHANG - 6}" y="${-LIP_H / 2 - 4}" width="${TUBE_W + LIP_OVERHANG * 2 + 12}" height="${LIP_H + 8}" rx="${LIP_H / 2 + 4}" fill="#FFFFFF"/>`;
    return `<g transform="translate(${fmt(cx - (TUBE_W / 2) * s)} ${fmt(bottom - h * s)}) scale(${s})">${inner({ stroke, gap, pad, w, r, slotH, lip, h })}</g>`;
  };
  const tube = (spec) =>
    shape(spec, ({ stroke, pad, w, r, slotH, lip, h }) => {
      const liquidTop = Math.max(h - slotH * spec.layers.length, pad);
      return `
        <path d="${tubeOutline(TUBE_W, h)}" fill="none" stroke="#FFFFFF" stroke-width="${fmt(stroke)}" stroke-linejoin="round"/>
        <path d="M${fmt(pad)} ${fmt(liquidTop)} L${fmt(pad)} ${fmt(h - pad - r)} A${fmt(r)} ${fmt(r)} 0 0 0 ${fmt(pad + w)} ${fmt(h - pad - r)} L${fmt(pad + w)} ${fmt(liquidTop)} Z" fill="#FFFFFF"/>
        ${lip}`;
    });
  /** The front tube's footprint grown by the gap: knocked out of the back tubes. */
  const knockout = shape(TRIO.front, ({ stroke, gap, h }) => {
    const grow = stroke + gap * 2;
    return `
      <path d="${tubeOutline(TUBE_W, h)}" fill="#000000" stroke="#000000" stroke-width="${fmt(grow)}" stroke-linejoin="round"/>
      <rect x="${fmt(-LIP_OVERHANG - 6 - gap)}" y="${fmt(-LIP_H / 2 - 4 - gap)}" width="${fmt(TUBE_W + LIP_OVERHANG * 2 + 12 + gap * 2)}" height="${fmt(LIP_H + 8 + gap * 2)}" rx="${fmt(LIP_H / 2 + 4 + gap)}" fill="#000000"/>`;
  });
  return `
    <defs>
      <mask id="${prefix}-gap" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000">
        <rect x="-2000" y="-2000" width="4000" height="4000" fill="#FFFFFF"/>
        ${knockout}
      </mask>
    </defs>
    <g mask="url(#${prefix}-gap)">${TRIO.back.map(tube).join('')}</g>
    ${tube(TRIO.front)}
    ${sparkle(TRIO.sparkle.x, TRIO.sparkle.y, TRIO.sparkle.r, '#FFFFFF')}`;
};

/**
 * On the full-bleed icon the tubes span 72% of the canvas, which keeps them clear of the rounded
 * corners Play and legacy launchers apply.
 */
const ICON_MARK_BOX = MASTER * 0.72;
/**
 * The adaptive tubes fill the 66 dp circle every launcher mask contains (the 72 dp viewport only
 * adds corners that circle masks cut off); the splash fills Android 12's circle, less 3%.
 */
const SAFE_RADIUS = (SAFE_DIAMETER / 2) * 0.99;
const SPLASH_RADIUS = (SPLASH_DIAMETER / 2) * 0.97;

const iconSvg = () =>
  svg(
    MASTER,
    MASTER,
    `${backgroundRect(MASTER, MASTER)}${placeMark(trioMark('i'), 512, 512, { box: ICON_MARK_BOX })}`,
  );

const adaptiveForegroundSvg = () =>
  svg(MASTER, MASTER, placeMark(trioMark('f'), 512, 512, { radius: SAFE_RADIUS }));

const adaptiveMonochromeSvg = () =>
  svg(MASTER, MASTER, placeMark(trioMonoMark('m'), 512, 512, { radius: SAFE_RADIUS }));

const splashSvg = () =>
  svg(MASTER, MASTER, placeMark(trioMark('s'), 512, 512, { radius: SPLASH_RADIUS }));

/** Play Store icon: the launcher icon downscaled (Play applies its own corner mask). */
const OUTPUTS = [
  { dir: IMAGES_DIR, file: 'icon.png', size: [MASTER, MASTER], svg: iconSvg },
  {
    dir: IMAGES_DIR,
    file: 'adaptive-icon-foreground.png',
    size: [MASTER, MASTER],
    svg: adaptiveForegroundSvg,
  },
  {
    dir: IMAGES_DIR,
    file: 'adaptive-icon-background.png',
    size: [MASTER, MASTER],
    svg: adaptiveBackgroundSvg,
  },
  {
    dir: IMAGES_DIR,
    file: 'adaptive-icon-monochrome.png',
    size: [MASTER, MASTER],
    svg: adaptiveMonochromeSvg,
  },
  { dir: IMAGES_DIR, file: 'splash-icon.png', size: [MASTER, MASTER], svg: splashSvg },
  { dir: IMAGES_DIR, file: 'notification-icon.png', size: [96, 96], svg: notificationSvg },
  { dir: HOSTING_DIR, file: 'favicon.png', size: [64, 64], svg: iconSvg },
  { dir: STORE_DIR, file: 'play-icon-512.png', size: [512, 512], svg: iconSvg },
  /** Play rejects a feature graphic with an alpha channel: written as 24-bit RGB. */
  {
    dir: STORE_DIR,
    file: 'feature-graphic.png',
    size: [1024, 500],
    svg: featureGraphicSvg,
    opaque: true,
  },
];

const render = async ({ dir, file, size, svg: build, opaque = false }) => {
  const [width, height] = size;
  mkdirSync(dir, { recursive: true });
  const path = join(dir, file);
  const image = sharp(Buffer.from(build()), { density: 72 }).resize(width, height, {
    kernel: 'lanczos3',
  });
  await (opaque ? image.removeAlpha() : image)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path);
  const meta = await sharp(path).metadata();
  console.log(`${relative(ROOT, path)}  ${meta.width}×${meta.height}, ${meta.channels} channels`);
};

for (const output of OUTPUTS) {
  await render(output);
}
