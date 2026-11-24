import {
  createFrameWindow,
  MAX_FRAME_SAMPLE_MS,
  QUALITY_WINDOW_MS,
  sampleFrame,
  WARMUP_MS,
  type FrameVerdict,
  type FrameWindow,
} from '@/utils/perf';

// The hooks in perf.ts need the native Reanimated/Worklets runtimes; only the pure math is tested.
jest.mock('react-native-reanimated', () => ({
  useFrameCallback: jest.fn(),
  useSharedValue: jest.fn(),
}));
jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn() }));

/** Feeds frames of `frameMs` until a verdict; returns it and the number of frames used. */
const run = (frames: FrameWindow, frameMs: number): { verdict: FrameVerdict; count: number } => {
  for (let count = 1; count <= 10_000; count += 1) {
    const verdict = sampleFrame(frames, frameMs);
    if (verdict !== 'pending') return { verdict, count };
  }
  return { verdict: 'pending', count: 10_000 };
};

describe('sampleFrame', () => {
  it('ignores the warm-up second', () => {
    const frames = createFrameWindow();
    for (let elapsed = 0; elapsed + 20 <= WARMUP_MS; elapsed += 20) {
      expect(sampleFrame(frames, 20)).toBe('pending');
    }
    expect(frames.count).toBe(0);
  });

  it('reports slow when a 3 s window averages more than 20 ms', () => {
    const frames = createFrameWindow();
    const { verdict, count } = run(frames, 25);
    expect(verdict).toBe('slow');
    expect(count).toBe(WARMUP_MS / 25 + QUALITY_WINDOW_MS / 25);
  });

  it('reports ok at 60 fps and starts a new window afterwards', () => {
    const frames = createFrameWindow();
    expect(run(frames, 16.7).verdict).toBe('ok');
    expect(frames.sum).toBe(0);
    expect(frames.count).toBe(0);
    expect(run(frames, 16.7).verdict).toBe('ok');
  });

  it('treats an exact 20 ms average as fast enough', () => {
    expect(run(createFrameWindow(), 20).verdict).toBe('ok');
  });

  it('skips pauses and invalid intervals', () => {
    const frames = createFrameWindow();
    run(frames, 16.7);
    expect(sampleFrame(frames, MAX_FRAME_SAMPLE_MS + 1)).toBe('pending');
    expect(sampleFrame(frames, 0)).toBe('pending');
    expect(sampleFrame(frames, -5)).toBe('pending');
    expect(sampleFrame(frames, Number.NaN)).toBe('pending');
    expect(frames.count).toBe(0);
  });

  it('does not let one long hitch downgrade a smooth window', () => {
    const frames = createFrameWindow();
    for (let i = 0; i < 70; i += 1) sampleFrame(frames, 16.7);
    sampleFrame(frames, 240);
    expect(run(frames, 16.7).verdict).toBe('ok');
  });
});
