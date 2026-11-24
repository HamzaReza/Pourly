import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SOUNDS = join(ROOT, 'assets', 'sounds');
const NAMES = ['select', 'pour', 'drop', 'complete', 'win', 'error', 'tap', 'coin'];
/** Spec §15 lengths in ms (pour, coin and win are approximate in the spec). */
const DURATIONS: Record<string, number> = {
  select: 60,
  pour: 300,
  drop: 120,
  complete: 250,
  win: 600,
  error: 120,
  tap: 30,
  coin: 420,
};

describe('generate-sounds output', () => {
  it.each(NAMES)('%s.wav is 16-bit PCM mono 44.1 kHz, under 80 KB, silent at both ends', (name) => {
    const bytes = readFileSync(join(SOUNDS, `${name}.wav`));
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.toString('ascii', 8, 12)).toBe('WAVE');
    expect(bytes.toString('ascii', 12, 16)).toBe('fmt ');
    expect(bytes.readUInt16LE(20)).toBe(1);
    expect(bytes.readUInt16LE(22)).toBe(1);
    expect(bytes.readUInt32LE(24)).toBe(44_100);
    expect(bytes.readUInt32LE(28)).toBe(88_200);
    expect(bytes.readUInt16LE(34)).toBe(16);
    expect(bytes.toString('ascii', 36, 40)).toBe('data');
    const dataBytes = bytes.readUInt32LE(40);
    expect(bytes.readUInt32LE(4)).toBe(36 + dataBytes);
    expect(bytes.length).toBe(44 + dataBytes);
    expect(dataBytes / 2).toBe(Math.round((44_100 * (DURATIONS[name] ?? 0)) / 1000));
    expect(bytes.length).toBeLessThan(80 * 1024);
    expect(bytes.readInt16LE(44)).toBe(0);
    expect(bytes.readInt16LE(bytes.length - 2)).toBe(0);
  });

  it('regenerates byte-identical files', () => {
    const out = mkdtempSync(join(tmpdir(), 'pourly-sounds-'));
    try {
      const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'generate-sounds.mjs')], {
        env: { ...process.env, SOUNDS_OUT_DIR: out },
        encoding: 'utf8',
      });
      expect(run.status).toBe(0);
      expect(readdirSync(out).sort()).toEqual(NAMES.map((name) => `${name}.wav`).sort());
      for (const name of NAMES) {
        expect(
          readFileSync(join(out, `${name}.wav`)).equals(readFileSync(join(SOUNDS, `${name}.wav`))),
        ).toBe(true);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
