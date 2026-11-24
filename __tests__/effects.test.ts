import {
  bubbleState,
  confettiState,
  createBubbles,
  createConfetti,
  effectPrefs,
  hideSprite,
  hintAlpha,
  MAX_BUBBLES,
  MAX_CONFETTI,
  MAX_SPARKLES,
  placeSprite,
  shakeOffset,
  sparkleState,
  winGlowAlpha,
  winTimeline,
  type RSXformTarget,
} from '@/render/anim/effects';

const recorder = () => {
  const values: number[] = [];
  const target: RSXformTarget = {
    set: (scos, ssin, tx, ty) => {
      values.splice(0, values.length, scos, ssin, tx, ty);
    },
  };
  return { values, target };
};

describe('effectPrefs', () => {
  it('uses every effect at full size in high quality', () => {
    expect(effectPrefs('high', false)).toEqual({
      quality: 'high',
      reducedMotion: false,
      durationScale: 1,
      glowBlur: true,
      selectionGlow: true,
      bubbles: 12,
      confetti: 60,
      sparkles: 10,
    });
  });

  it('drops bubbles and blur and halves particles in low quality', () => {
    const low = effectPrefs('low', false);
    expect(low.bubbles).toBe(0);
    expect(low.glowBlur).toBe(false);
    expect(low.confetti).toBe(30);
    expect(low.sparkles).toBe(5);
  });

  it('scales durations by 0.4 and drops bubbles and confetti with reduced motion', () => {
    const reduced = effectPrefs('high', true);
    expect(reduced.durationScale).toBe(0.4);
    expect(reduced.bubbles).toBe(0);
    expect(reduced.confetti).toBe(0);
    expect(reduced.sparkles).toBe(10);
  });

  it('respects the particle caps', () => {
    for (const quality of ['high', 'low'] as const) {
      for (const reduced of [false, true]) {
        const prefs = effectPrefs(quality, reduced);
        expect(prefs.confetti).toBeLessThanOrEqual(MAX_CONFETTI);
        expect(prefs.sparkles).toBeLessThanOrEqual(MAX_SPARKLES);
        expect(prefs.sparkles).toBeGreaterThanOrEqual(quality === 'low' ? 4 : 8);
        expect(prefs.bubbles).toBeLessThanOrEqual(MAX_BUBBLES);
      }
    }
  });
});

describe('particles', () => {
  it('caps and seeds confetti and bubbles', () => {
    expect(createConfetti(100)).toHaveLength(60);
    expect(createConfetti(60)).toEqual(createConfetti(60));
    expect(createConfetti(60, 1)).not.toEqual(createConfetti(60, 2));
    expect(createBubbles(20)).toHaveLength(12);
    for (const piece of createConfetti(60)) {
      expect(piece.color).toBeGreaterThanOrEqual(0);
      expect(piece.color).toBeLessThan(14);
    }
  });

  it('holds confetti until its delay, then lets it fall', () => {
    const [piece] = createConfetti(1);
    if (piece === undefined) throw new Error('no confetti');
    expect(confettiState(piece, piece.delay - 1, 400)).toBeNull();
    const early = confettiState(piece, piece.delay + 100, 400);
    const late = confettiState(piece, piece.delay + 1500, 400);
    expect(late?.y ?? 0).toBeGreaterThan(early?.y ?? 0);
  });

  it('keeps bubbles inside their wrap band', () => {
    for (const bubble of createBubbles(12)) {
      for (let seconds = 0; seconds < 600; seconds += 7.3) {
        const { y } = bubbleState(bubble, seconds, 400, 800, 20);
        expect(y).toBeGreaterThanOrEqual(-20);
        expect(y).toBeLessThanOrEqual(820);
      }
    }
  });

  it('grows sparkles from nothing and fades them out', () => {
    expect(sparkleState(3, 10, 0).size).toBe(0);
    expect(sparkleState(3, 10, 1).size).toBeCloseTo(0);
    expect(sparkleState(3, 10, 0.3).size).toBeGreaterThan(0);
  });
});

describe('placeSprite', () => {
  it('centres the sprite on (cx, cy) for any scale and angle', () => {
    const { values, target } = recorder();
    for (const angle of [0, 0.7, Math.PI / 2, 2.5]) {
      placeSprite(target, 0.5, angle, 120, 80, 30, 18);
      const [scos = 0, ssin = 0, tx = 0, ty = 0] = values;
      expect(tx + scos * 15 - ssin * 9).toBeCloseTo(120);
      expect(ty + ssin * 15 + scos * 9).toBeCloseTo(80);
    }
  });

  it('hides a sprite with a zero scale', () => {
    const { values, target } = recorder();
    hideSprite(target);
    expect(values[0]).toBe(0);
    expect(values[1]).toBe(0);
  });
});

describe('shake, win and hint', () => {
  it('shakes ±4 dp and ends at rest', () => {
    expect(shakeOffset(0)).toBe(0);
    expect(shakeOffset(1)).toBe(0);
    expect(shakeOffset(0.125)).toBeCloseTo(4);
    expect(shakeOffset(0.375)).toBeCloseTo(-4);
    for (let t = 0; t <= 1; t += 0.01) expect(Math.abs(shakeOffset(t))).toBeLessThanOrEqual(4);
  });

  it('staggers the win glow and puts confetti after it', () => {
    const timeline = winTimeline(8, 60, 1);
    expect(timeline.stagger).toBe(70);
    expect(timeline.confettiStart).toBe(7 * 70 + 200);
    expect(timeline.total).toBe(timeline.confettiEnd);
    expect(winGlowAlpha(timeline, 3, 3 * 70 - 1)).toBe(0);
    expect(winGlowAlpha(timeline, 3, 3 * 70 + 180)).toBeCloseTo(1);
    expect(winGlowAlpha(timeline, 3, 3 * 70 + 500)).toBeCloseTo(0);
  });

  it('ends the win sequence with the glow when there is no confetti', () => {
    const timeline = winTimeline(8, 0, 0.4);
    expect(timeline.confettiStart).toBe(-1);
    expect(timeline.total).toBe(timeline.glowEnd);
  });

  it('pulses the hint between 35% and 100%', () => {
    expect(hintAlpha(0)).toBeCloseTo(0.35);
    expect(hintAlpha(1)).toBe(1);
  });
});
