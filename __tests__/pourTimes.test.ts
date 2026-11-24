import { pourTimes } from '@/render/anim/pour';

describe('pourTimes', () => {
  it('lays out a plain pour: travel, stream, return; the target is released at stream end', () => {
    const t = pourTimes(2, false, false, 1);
    expect(t.pourEnd).toBe(460);
    expect(t.travelEnd).toBe(180);
    expect(t.streamStart).toBe(220);
    expect(t.streamEnd).toBe(440);
    expect(t.returnEnd).toBe(680);
    expect(t.sourceRelease).toBe(680);
    expect(t.targetRelease).toBe(440);
    expect(t.total).toBe(680);
  });

  it('keeps the phases ordered for every segment count', () => {
    for (let count = 1; count <= 4; count += 1) {
      const t = pourTimes(count, false, false, 1);
      expect(t.pourEnd).toBe(280 + 90 * count);
      expect(t.returnEnd).toBe(t.pourEnd + 220);
      expect(t.travelEnd).toBeLessThan(t.streamStart);
      expect(t.streamStart).toBeLessThan(t.streamEnd);
      expect(t.streamEnd).toBeLessThan(t.pourEnd);
    }
  });

  it('flips a revealed segment for 260 ms after the stream and holds the source until then', () => {
    const t = pourTimes(2, true, false, 1);
    expect(t.flipStart).toBe(t.streamEnd);
    expect(t.flipEnd).toBe(t.streamEnd + 260);
    expect(t.sourceRelease).toBe(Math.max(t.returnEnd, t.flipEnd));
  });

  it('drops the cap at stream end and holds the target until the sparkles finish', () => {
    const t = pourTimes(1, false, true, 1);
    expect(t.capStart).toBe(t.streamEnd);
    expect(t.capImpact).toBe(t.capStart + 170);
    expect(t.capEnd).toBe(t.capImpact + 300);
    expect(t.sparkleEnd).toBe(t.capImpact + 560);
    expect(t.targetRelease).toBe(t.sparkleEnd);
    expect(t.total).toBe(Math.max(t.sourceRelease, t.targetRelease));
  });

  it('scales every phase by 0.4 with reduced motion', () => {
    const full = pourTimes(3, true, true, 1);
    const reduced = pourTimes(3, true, true, 0.4);
    expect(reduced.pourEnd).toBe(Math.round(full.pourEnd * 0.4));
    expect(reduced.total).toBeLessThan(full.total * 0.45);
    expect(reduced.total).toBeGreaterThan(full.total * 0.35);
    expect(reduced.streamStart).toBeLessThan(reduced.streamEnd);
  });
});
