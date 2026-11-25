import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const IMAGES = join(ROOT, 'assets', 'images');
const STORE = join(ROOT, 'store-listing', 'assets');
const HOSTING = join(ROOT, 'public');

const RGB = 2;
const RGBA = 6;

const OUTPUTS: readonly {
  dir: string;
  file: string;
  width: number;
  height: number;
  colorType: number;
}[] = [
  { dir: IMAGES, file: 'icon.png', width: 1024, height: 1024, colorType: RGBA },
  { dir: IMAGES, file: 'adaptive-icon-foreground.png', width: 1024, height: 1024, colorType: RGBA },
  { dir: IMAGES, file: 'adaptive-icon-background.png', width: 1024, height: 1024, colorType: RGBA },
  { dir: IMAGES, file: 'adaptive-icon-monochrome.png', width: 1024, height: 1024, colorType: RGBA },
  { dir: IMAGES, file: 'splash-icon.png', width: 1024, height: 1024, colorType: RGBA },
  { dir: IMAGES, file: 'notification-icon.png', width: 96, height: 96, colorType: RGBA },
  { dir: HOSTING, file: 'favicon.png', width: 64, height: 64, colorType: RGBA },
  { dir: STORE, file: 'play-icon-512.png', width: 512, height: 512, colorType: RGBA },
  { dir: STORE, file: 'feature-graphic.png', width: 1024, height: 500, colorType: RGB },
];

/** Reads width, height and color type from a PNG's IHDR chunk. */
const pngHeader = (bytes: Buffer) => ({
  signature: bytes.subarray(0, 8).toString('hex'),
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
  colorType: bytes.readUInt8(25),
});

/** Runs a short sharp script in plain Node (sharp's native module stays out of the Jest VM). */
const sharpEval = (source: string): string => {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(run.stderr);
  return run.stdout.trim();
};

describe('generate-assets output', () => {
  it.each(OUTPUTS)(
    '$file is a $width×$height PNG of color type $colorType',
    ({ dir, file, width, height, colorType }) => {
      const header = pngHeader(readFileSync(join(dir, file)));
      expect(header.signature).toBe('89504e470d0a1a0a');
      expect(header.width).toBe(width);
      expect(header.height).toBe(height);
      expect(header.colorType).toBe(colorType);
    },
  );

  it.each(['notification-icon.png', 'adaptive-icon-monochrome.png'])(
    '%s is white on transparent',
    (file) => {
      const result = sharpEval(`
        import sharp from 'sharp';
        const { data } = await sharp(${JSON.stringify(join(IMAGES, file))}).raw().toBuffer({ resolveWithObject: true });
        let colored = 0;
        let opaque = 0;
        let transparent = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) transparent += 1;
          else {
            opaque += 1;
            if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) colored += 1;
          }
        }
        console.log(JSON.stringify({ colored, opaque, transparent }));
      `);
      const counts = JSON.parse(result) as { colored: number; opaque: number; transparent: number };
      expect(counts.colored).toBe(0);
      expect(counts.opaque).toBeGreaterThan(0);
      expect(counts.transparent).toBeGreaterThan(counts.opaque);
    },
  );

  it('keeps the adaptive foreground inside the 66 dp safe circle', () => {
    const result = sharpEval(`
      import sharp from 'sharp';
      const { data, info } = await sharp(${JSON.stringify(join(IMAGES, 'adaptive-icon-foreground.png'))}).raw().toBuffer({ resolveWithObject: true });
      const radius = (info.width * 66) / 108 / 2;
      const center = info.width / 2;
      let outside = 0;
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          const alpha = data[(y * info.width + x) * 4 + 3];
          if (alpha > 128 && Math.hypot(x + 0.5 - center, y + 0.5 - center) > radius) outside += 1;
        }
      }
      console.log(outside);
    `);
    expect(Number(result)).toBe(0);
  });

  it('regenerates byte-identical files', () => {
    const out = mkdtempSync(join(tmpdir(), 'pourly-assets-'));
    try {
      const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'generate-assets.mjs')], {
        env: { ...process.env, ASSETS_OUT_DIR: out },
        encoding: 'utf8',
      });
      expect(run.status).toBe(0);
      expect(readdirSync(out).sort()).toEqual(OUTPUTS.map(({ file }) => file).sort());
      for (const { dir, file } of OUTPUTS) {
        expect(readFileSync(join(out, file)).equals(readFileSync(join(dir, file)))).toBe(true);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
