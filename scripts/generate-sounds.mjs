/**
 * Synthesizes the game's sound effects (spec §15, §21) as 16-bit PCM mono 44.1 kHz WAV files in
 * `assets/sounds/`. Pure Node: no downloads, no dependencies. Noise comes from a seeded PRNG, so
 * running the script twice produces byte-identical files.
 *
 * Usage: `yarn gen:sounds`
 */
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44_100;
const MAX_BYTES = 80 * 1024;
/** `SOUNDS_OUT_DIR` redirects the output (the determinism test writes to a temporary folder). */
const OUT_DIR =
  process.env.SOUNDS_OUT_DIR ??
  join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
const TAU = Math.PI * 2;

/** mulberry32: deterministic noise in [-1, 1). */
const createNoise = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2_147_483_648 - 1;
  };
};

const sampleCount = (ms) => Math.round((SAMPLE_RATE * ms) / 1000);

/**
 * Attack/release envelope so every file starts and ends at silence (no clicks). `decay` adds an
 * exponential fall (time constant in ms) on top.
 */
const envelope = (index, total, { attackMs = 4, releaseMs = 15, decayMs = 0 } = {}) => {
  const t = index / SAMPLE_RATE;
  const attack = Math.min(1, index / sampleCount(attackMs));
  const release = Math.min(1, (total - 1 - index) / sampleCount(releaseMs));
  const decay = decayMs > 0 ? Math.exp(-(t * 1000) / decayMs) : 1;
  const shape = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
  return shape(attack) * shape(release) * decay;
};

/** One sine oscillator with a time-varying frequency (phase accumulated, so sweeps stay smooth). */
const createOscillator = () => {
  let phase = 0;
  return (frequency) => {
    phase += (TAU * frequency) / SAMPLE_RATE;
    if (phase > TAU) phase -= TAU;
    return Math.sin(phase);
  };
};

/** Two-pole resonant band-pass (RBJ cookbook), coefficients updated per sample. */
const createBandPass = () => {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (input, center, q) => {
    const w0 = (TAU * center) / SAMPLE_RATE;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0;
    const b2 = -alpha / a0;
    const a1 = (-2 * Math.cos(w0)) / a0;
    const a2 = (1 - alpha) / a0;
    const output = b0 * input + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = input;
    y2 = y1;
    y1 = output;
    return output;
  };
};

const render = (ms, voice) => {
  const total = sampleCount(ms);
  const samples = new Float64Array(total);
  for (let i = 0; i < total; i += 1) samples[i] = voice(i, total, i / SAMPLE_RATE);
  return samples;
};

/** Scales the peak to `peak` (0..1) of full scale. */
const normalize = (samples, peak) => {
  let max = 0;
  for (const value of samples) max = Math.max(max, Math.abs(value));
  const gain = max > 0 ? peak / max : 0;
  return samples.map((value) => value * gain);
};

const encodeWav = (samples) => {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  samples.forEach((value, index) => {
    const clamped = Math.max(-1, Math.min(1, value));
    buffer.writeInt16LE(Math.round(clamped * 32_767), 44 + index * 2);
  });
  return buffer;
};

/** select: 880 Hz blip, 60 ms. */
const select = () => {
  const osc = createOscillator();
  const overtone = createOscillator();
  return render(60, (i, total) => {
    const env = envelope(i, total, { attackMs: 3, releaseMs: 20, decayMs: 40 });
    return env * (osc(880) + 0.25 * overtone(1760));
  });
};

/** pour: band-limited noise with rising bubbly pitch, ~300 ms, fading out. */
const pour = () => {
  const noise = createNoise(0x9017);
  const bubbleNoise = createNoise(0x5eed);
  const filter = createBandPass();
  const bubble = createOscillator();
  const total = sampleCount(300);
  const bubbleLength = sampleCount(38);
  return render(300, (i, length) => {
    const progress = i / total;
    const center = 500 + 900 * progress;
    const hiss = filter(noise(), center, 2.2) * 0.9;
    const inBubble = i % bubbleLength;
    const bubbleT = inBubble / SAMPLE_RATE;
    const jitter = 1 + 0.12 * bubbleNoise();
    const pitch = (380 + 620 * progress) * (1 + 6 * bubbleT) * jitter;
    const bubbleEnv = Math.exp(-bubbleT * 90) * Math.min(1, inBubble / 40);
    const env = envelope(i, length, { attackMs: 8, releaseMs: 120 }) * (1 - 0.35 * progress);
    return env * (hiss + 0.55 * bubbleEnv * bubble(pitch));
  });
};

/** drop: 440 → 330 Hz thud, 120 ms. */
const drop = () => {
  const osc = createOscillator();
  const body = createOscillator();
  return render(120, (i, total) => {
    const progress = i / total;
    const frequency = 440 - 110 * Math.min(1, progress * 1.6);
    const env = envelope(i, total, { attackMs: 2, releaseMs: 30, decayMs: 55 });
    return env * (osc(frequency) + 0.5 * body(frequency / 2));
  });
};

/** Plays `notes` (Hz) one after another, `stepMs` apart, each ringing with a soft decay. */
const arpeggio = (notes, stepMs, totalMs, { decayMs, brightness }) => {
  const oscillators = notes.map(() => [createOscillator(), createOscillator()]);
  const step = sampleCount(stepMs);
  return render(totalMs, (i, total) => {
    let value = 0;
    notes.forEach((frequency, n) => {
      const start = n * step;
      if (i < start) return;
      const local = i - start;
      const pair = oscillators[n];
      const noteEnv = envelope(local, total - start, { attackMs: 4, releaseMs: 25, decayMs });
      value += noteEnv * (pair[0](frequency) + brightness * pair[1](frequency * 2));
    });
    return value * envelope(i, total, { attackMs: 2, releaseMs: 30 });
  });
};

/** complete: C–E–G arpeggio, ~250 ms. */
const complete = () =>
  arpeggio([523.25, 659.25, 783.99], 60, 250, { decayMs: 110, brightness: 0.3 });

/** win: rising fanfare arpeggio, ~600 ms. */
const win = () =>
  arpeggio([523.25, 659.25, 783.99, 1046.5, 1318.51], 85, 600, {
    decayMs: 260,
    brightness: 0.45,
  });

/** error: low buzz, 120 ms (a few odd harmonics of 140 Hz, gently detuned). */
const error = () => {
  const harmonics = [1, 3, 5, 7].map(() => createOscillator());
  return render(120, (i, total, t) => {
    const frequency = 140 * (1 + 0.02 * Math.sin(TAU * 18 * t));
    let value = 0;
    harmonics.forEach((osc, n) => {
      const order = 2 * n + 1;
      value += osc(frequency * order) / order;
    });
    return envelope(i, total, { attackMs: 4, releaseMs: 25 }) * value;
  });
};

/** tap: 30 ms click. */
const tap = () => {
  const noise = createNoise(0x7a9);
  const filter = createBandPass();
  const osc = createOscillator();
  return render(30, (i, total) => {
    const env = envelope(i, total, { attackMs: 1, releaseMs: 10, decayMs: 7 });
    return env * (0.6 * filter(noise(), 3200, 1.5) + 0.7 * osc(2000));
  });
};

/** coin: high ping with decay (B5 then E6, phase-continuous). */
const coin = () => {
  const osc = createOscillator();
  const shimmer = createOscillator();
  const switchAt = sampleCount(70);
  return render(420, (i, total) => {
    const env = envelope(i, total, { attackMs: 2, releaseMs: 40, decayMs: 140 });
    const frequency = i < switchAt ? 987.77 : 1318.51;
    return env * (osc(frequency) + 0.2 * shimmer(frequency * 2));
  });
};

const SOUNDS = [
  ['select', select, 0.7],
  ['pour', pour, 0.75],
  ['drop', drop, 0.8],
  ['complete', complete, 0.75],
  ['win', win, 0.8],
  ['error', error, 0.7],
  ['tap', tap, 0.6],
  ['coin', coin, 0.7],
];

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, build, peak] of SOUNDS) {
  const bytes = encodeWav(normalize(build(), peak));
  if (bytes.length >= MAX_BYTES) {
    throw new Error(`${name}.wav is ${bytes.length} bytes (limit ${MAX_BYTES})`);
  }
  const file = join(OUT_DIR, `${name}.wav`);
  writeFileSync(file, bytes);
  console.log(`${name}.wav ${bytes.length} bytes`);
}
