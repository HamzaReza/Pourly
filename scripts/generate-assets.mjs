/**
 * Draws the launcher icons, splash mark, notification icon, favicon and Play Store graphics
 * (spec §21) as SVG and rasterizes them with sharp. Fully procedural: no fonts, no downloads. The
 * "Pourly" wordmark is built from stroked paths, so the output does not depend on installed fonts,
 * and the same sharp/libvips version writes byte-identical PNGs on every run.
 *
 * Usage: `yarn gen:assets`
 */
import { Buffer } from 'node:buffer';
import { mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Liquid colors from src/render/palette.ts, listed bottom to top per tube. */
const TUBE_LAYERS = [
  ['#3A6BFF', '#FF4D6D', '#FFD60A'],
  ['#00C2A8', '#8B5CF6', '#FF9F1C', '#2EC4FF'],
  ['#FF4D6D', '#7ED957', '#E056FD'],
];
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
const TUBE_GAP = 62;
const TUBE_LIFT = 44;
const GLASS_STROKE = 15;
const LIP_H = 30;
const LIP_OVERHANG = 14;
const LIQUID_TOP = 128;

const tubeOutline = (w, h) => {
  const r = w / 2;
  return `M0 0 L0 ${fmt(h - r)} A${fmt(r)} ${fmt(r)} 0 0 0 ${fmt(w)} ${fmt(h - r)} L${fmt(w)} 0 Z`;
};

/** Three tubes, the middle one raised; the group spans `groupWidth()` × `groupHeight()`. */
const groupWidth = () => TUBE_W * 3 + TUBE_GAP * 2 + LIP_OVERHANG * 2;
const groupHeight = () => TUBE_H + TUBE_LIFT + LIP_H / 2;

const tubeOrigins = () =>
  [0, 1, 2].map((index) => ({
    x: LIP_OVERHANG + index * (TUBE_W + TUBE_GAP),
    y: LIP_H / 2 + (index === 1 ? 0 : TUBE_LIFT),
  }));

const colorTube = (index, origin, id) => {
  const layers = TUBE_LAYERS[index];
  const inset = GLASS_STROKE / 2;
  const innerW = TUBE_W - inset * 2;
  const innerH = TUBE_H - inset;
  const liquidSpan = innerH - LIQUID_TOP;
  const slotH = liquidSpan / SLOTS;
  const segments = layers
    .map((_, layer) => {
      const top = innerH - slotH * (layer + 1);
      const extra = layer === 0 ? slotH : 0;
      return `<rect x="0" y="${fmt(top)}" width="${fmt(innerW)}" height="${fmt(slotH + extra + 1)}" fill="url(#${id}-seg${layer})"/>`;
    })
    .join('');
  const segmentGradients = layers
    .map(
      (color, layer) => `
      <linearGradient id="${id}-seg${layer}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${mix(color, '#FFFFFF', 0.14)}"/>
        <stop offset="1" stop-color="${mix(color, '#000000', 0.1)}"/>
      </linearGradient>`,
    )
    .join('');
  const surfaceY = innerH - slotH * layers.length;
  const topColor = layers[layers.length - 1];
  const separators = layers
    .slice(0, -1)
    .map(
      (_, layer) =>
        `<rect x="0" y="${fmt(innerH - slotH * (layer + 1) - 2)}" width="${fmt(innerW)}" height="4" fill="#000000" fill-opacity="0.14"/>`,
    )
    .join('');
  return `
    <defs>
      <clipPath id="${id}-inner">
        <path d="${tubeOutline(innerW, innerH)}"/>
      </clipPath>
      ${segmentGradients}
    </defs>
    <g transform="translate(${fmt(origin.x)} ${fmt(origin.y)})">
      <path d="${tubeOutline(TUBE_W, TUBE_H)}" fill="#FFFFFF" fill-opacity="0.08"/>
      <g transform="translate(${fmt(inset)} 0)" clip-path="url(#${id}-inner)">
        ${segments}
        ${separators}
        <ellipse cx="${fmt(innerW / 2)}" cy="${fmt(surfaceY)}" rx="${fmt(innerW / 2)}" ry="13" fill="${mix(topColor, '#FFFFFF', 0.45)}"/>
        <rect x="0" y="0" width="${fmt(innerW)}" height="${fmt(innerH)}" fill="url(#cylinder)"/>
      </g>
      <path d="${tubeOutline(TUBE_W, TUBE_H)}" fill="none" stroke="url(#glass)" stroke-width="${GLASS_STROKE}"/>
      <rect x="${fmt(TUBE_W * 0.15)}" y="${fmt(LIP_H + 26)}" width="${fmt(TUBE_W * 0.12)}" height="${fmt(TUBE_H - LIP_H - TUBE_W * 0.62)}" rx="${fmt(TUBE_W * 0.06)}" fill="url(#highlight)"/>
      <rect x="${fmt(TUBE_W * 0.78)}" y="${fmt(LIP_H + 40)}" width="${fmt(TUBE_W * 0.05)}" height="${fmt(TUBE_H * 0.22)}" rx="${fmt(TUBE_W * 0.025)}" fill="#FFFFFF" fill-opacity="0.3"/>
      <rect x="${-LIP_OVERHANG}" y="${-LIP_H / 2}" width="${TUBE_W + LIP_OVERHANG * 2}" height="${LIP_H}" rx="${LIP_H / 2}" fill="url(#lip)"/>
    </g>`;
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

/** The colored three-tube mark, fitted into a box of `size` × `size` centered at (cx, cy). */
const colorMark = (cx, cy, size, prefix) => {
  const scale = size / Math.max(groupWidth(), groupHeight());
  const x = cx - (groupWidth() * scale) / 2;
  const y = cy - (groupHeight() * scale) / 2;
  const tubes = tubeOrigins()
    .map((origin, index) => colorTube(index, origin, `${prefix}${index}`))
    .join('');
  const shadowY = groupHeight() + 6;
  return `
    <g transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(scale * 1000) / 1000})">
      <ellipse cx="${fmt(groupWidth() / 2)}" cy="${fmt(shadowY)}" rx="${fmt(groupWidth() * 0.56)}" ry="54" fill="url(#shadow)"/>
      ${tubes}
    </g>`;
};

/** Single-color silhouette of the mark: glass outline, lip and liquid, separated by gaps. */
const monoTube = (origin, layers, stroke) => {
  const gap = stroke * 1.1;
  const innerW = TUBE_W - (stroke + gap) * 2;
  const innerH = TUBE_H - stroke - gap;
  const slotH = (TUBE_H - LIQUID_TOP) / SLOTS;
  const liquidTop = TUBE_H - slotH * layers - (stroke + gap) / 2;
  const r = innerW / 2;
  const liquid = `M0 ${fmt(liquidTop)} L0 ${fmt(innerH - r)} A${fmt(r)} ${fmt(r)} 0 0 0 ${fmt(innerW)} ${fmt(innerH - r)} L${fmt(innerW)} ${fmt(liquidTop)} Z`;
  return `
    <g transform="translate(${fmt(origin.x)} ${fmt(origin.y)})">
      <path d="${tubeOutline(TUBE_W, TUBE_H)}" fill="none" stroke="#FFFFFF" stroke-width="${stroke}" stroke-linejoin="round"/>
      <path transform="translate(${fmt(stroke / 2 + gap)} 0)" d="${liquid}" fill="#FFFFFF"/>
      <rect x="${-LIP_OVERHANG}" y="${-LIP_H / 2}" width="${TUBE_W + LIP_OVERHANG * 2}" height="${LIP_H}" rx="${LIP_H / 2}" fill="#FFFFFF"/>
    </g>`;
};

const monoMark = (cx, cy, size) => {
  const scale = size / Math.max(groupWidth(), groupHeight());
  const x = cx - (groupWidth() * scale) / 2;
  const y = cy - (groupHeight() * scale) / 2;
  const tubes = tubeOrigins()
    .map((origin, index) => monoTube(origin, TUBE_LAYERS[index].length, 26))
    .join('');
  return `<g transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(scale * 1000) / 1000})">${tubes}</g>`;
};

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

const iconSvg = () =>
  svg(MASTER, MASTER, `${backgroundRect(MASTER, MASTER)}${colorMark(512, 520, 760, 'i')}`);

const adaptiveBackgroundSvg = () => svg(MASTER, MASTER, backgroundRect(MASTER, MASTER));

/**
 * Largest mark size (the `size` argument of `colorMark`) whose outermost points stay inside a
 * circle of `radius` centered on the mark: the outer lip corners and the round tube bottoms.
 */
const fitInCircle = (radius) => {
  const cx = groupWidth() / 2;
  const cy = groupHeight() / 2;
  const bottomRadius = TUBE_W / 2;
  const reach = Math.max(
    ...tubeOrigins().flatMap((origin) => {
      const lipTop = origin.y - LIP_H / 2;
      const lipLeft = origin.x - LIP_OVERHANG;
      const lipRight = origin.x + TUBE_W + LIP_OVERHANG;
      const bottomX = origin.x + bottomRadius;
      const bottomY = origin.y + TUBE_H - bottomRadius;
      return [
        Math.hypot(lipLeft - cx, lipTop - cy),
        Math.hypot(lipRight - cx, lipTop - cy),
        Math.hypot(bottomX - cx, bottomY - cy) + bottomRadius,
      ];
    }),
  );
  return Math.floor((radius / reach) * Math.max(groupWidth(), groupHeight()));
};

/** The adaptive and splash marks fill their visible circles, less a 3% margin. */
const SAFE_MARK = fitInCircle((SAFE_DIAMETER / 2) * 0.97);
const SPLASH_MARK = fitInCircle((SPLASH_DIAMETER / 2) * 0.97);

const adaptiveForegroundSvg = () => svg(MASTER, MASTER, colorMark(512, 512, SAFE_MARK, 'f'));

const adaptiveMonochromeSvg = () => svg(MASTER, MASTER, monoMark(512, 512, SAFE_MARK));

const splashSvg = () => svg(MASTER, MASTER, colorMark(512, 512, SPLASH_MARK, 's'));

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
 * "Pourly" as round-capped strokes on a 100-unit x-height grid. Each glyph lists its advance and
 * path; ascenders reach y = -62 and the descender y = 150.
 */
const WORDMARK_GLYPHS = [
  { advance: 104, d: 'M14 100 L14 -62 L52 -62 A44 44 0 0 1 52 26 L14 26' },
  { advance: 124, d: 'M60 0 A50 50 0 1 1 59.99 0 Z', shift: 2 },
  { advance: 112, d: 'M14 0 L14 54 A40 46 0 0 0 94 54 L94 0 M94 54 L94 100' },
  { advance: 78, d: 'M14 100 L14 0 M14 50 A44 50 0 0 1 72 4' },
  { advance: 40, d: 'M14 -62 L14 100' },
  { advance: 108, d: 'M14 0 L14 50 A40 46 0 0 0 94 50 L94 0 M94 50 L94 108 A44 42 0 0 1 22 140' },
];
const WORDMARK_STROKE = 26;

const wordmarkWidth = () =>
  WORDMARK_GLYPHS.reduce((sum, glyph) => sum + glyph.advance, 0) + WORDMARK_STROKE;

const wordmark = (x, baseline, height) => {
  const scale = height / 100;
  let pen = WORDMARK_STROKE / 2;
  const paths = WORDMARK_GLYPHS.map((glyph) => {
    const path = `<path transform="translate(${fmt(pen + (glyph.shift ?? 0))} 0)" d="${glyph.d}"/>`;
    pen += glyph.advance;
    return path;
  }).join('');
  return `
    <g transform="translate(${fmt(x)} ${fmt(baseline - 100 * scale)}) scale(${fmt(scale)})" fill="none" stroke-width="${WORDMARK_STROKE}" stroke-linecap="round" stroke-linejoin="round">
      <g transform="translate(3 6)" stroke="#020812" stroke-opacity="0.35">${paths}</g>
      <g stroke="url(#word)">${paths}</g>
    </g>`;
};

const featureGraphicSvg = () => {
  const width = 1024;
  const height = 500;
  const xHeight = 76;
  const wordX = Math.round(300 - (wordmarkWidth() * xHeight) / 100 / 2);
  const dots = TUBE_LAYERS.flat()
    .slice(0, 6)
    .map(
      (color, index) =>
        `<circle cx="${fmt(wordX + 16 + index * 42)}" cy="354" r="12" fill="${color}"/>`,
    )
    .join('');
  return svg(
    width,
    height,
    `${backgroundRect(width, height)}
    <defs>
      <linearGradient id="word" gradientUnits="userSpaceOnUse" x1="0" y1="-62" x2="0" y2="150">
        <stop offset="0" stop-color="#FFFFFF"/>
        <stop offset="1" stop-color="#BFE9FF"/>
      </linearGradient>
    </defs>
    ${wordmark(wordX, 262, xHeight)}
    ${dots}
    ${colorMark(792, 262, 380, 'g')}`,
  );
};

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
  { dir: STORE_DIR, file: 'feature-graphic.png', size: [1024, 500], svg: featureGraphicSvg },
];

const render = async ({ dir, file, size, svg: build }) => {
  const [width, height] = size;
  mkdirSync(dir, { recursive: true });
  const path = join(dir, file);
  await sharp(Buffer.from(build()), { density: 72 })
    .resize(width, height, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path);
  const meta = await sharp(path).metadata();
  console.log(`${relative(ROOT, path)}  ${meta.width}×${meta.height}`);
};

for (const output of OUTPUTS) {
  await render(output);
}
