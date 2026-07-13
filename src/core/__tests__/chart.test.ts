import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../beatmap.js';
import { generateChart } from '../chart.js';
import type { AudioAnalysis } from '../audio-analysis.js';

function analysis(bpm: number, offsetMs: number, peakTimesMs: number[], strength = 1): AudioAnalysis {
  return {
    bpm,
    offsetMs,
    confidence: 0.9,
    peaks: peakTimesMs.map((t) => ({ timeSec: t / 1000, strength })),
  };
}

describe('generateChart', () => {
  it('quantiza onsets para a meia-batida mais próxima', () => {
    // 120 BPM → batida 500ms, slot 250ms; offset 0
    const a = analysis(120, 0, [3010, 3990, 5240]); // ~3000, ~4000, ~5250
    const c = generateChart(a, 20000, { rng: mulberry32(1) });
    expect(c.notes.map((n) => n.timeMs)).toEqual([3000, 4000, 5250]);
    expect(c.bpm).toBe(120);
  });

  it('descarta onsets na intro e no fim do áudio', () => {
    const a = analysis(120, 0, [500, 1500, 3000, 19800]);
    const c = generateChart(a, 20000, { rng: mulberry32(1), minStartMs: 2000, endMarginMs: 800 });
    expect(c.notes.map((n) => n.timeMs)).toEqual([3000]);
  });

  it('mantém o onset mais forte quando dois caem no mesmo slot', () => {
    const a: AudioAnalysis = {
      bpm: 120,
      offsetMs: 0,
      confidence: 1,
      peaks: [
        { timeSec: 3.01, strength: 0.2 },
        { timeSec: 3.02, strength: 0.9 },
        { timeSec: 5.0, strength: 0.5 },
      ],
    };
    const c = generateChart(a, 20000, { rng: mulberry32(1) });
    expect(c.notes.map((n) => n.timeMs)).toEqual([3000, 5000]);
  });

  it('aplica intervalo mínimo entre notas (default ~1 batida)', () => {
    // slots de 250ms cheios entre 3000 e 6000 → com gap de 0.9 batida sobra ~1 por batida
    const times = Array.from({ length: 13 }, (_, i) => 3000 + i * 250);
    const c = generateChart(analysis(120, 0, times), 20000, { rng: mulberry32(1) });
    for (let i = 1; i < c.notes.length; i++) {
      expect((c.notes[i]?.timeMs ?? 0) - (c.notes[i - 1]?.timeMs ?? 0)).toBeGreaterThanOrEqual(449);
    }
  });

  it('respeita o teto de notas descartando as mais fracas', () => {
    const a: AudioAnalysis = {
      bpm: 120,
      offsetMs: 0,
      confidence: 1,
      peaks: Array.from({ length: 20 }, (_, i) => ({ timeSec: 3 + i, strength: i })),
    };
    const c = generateChart(a, 30000, { rng: mulberry32(1), maxNotes: 5 });
    expect(c.notes).toHaveLength(5);
    // sobraram as 5 mais fortes (últimas), em ordem temporal
    const times = c.notes.map((n) => n.timeMs);
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(times[0]).toBeGreaterThanOrEqual(18000);
  });

  it('posições ficam na área ergonômica com distância mínima', () => {
    const times = Array.from({ length: 40 }, (_, i) => 3000 + i * 600);
    const c = generateChart(analysis(100, 0, times), 40000, { rng: mulberry32(9) });
    for (let i = 0; i < c.notes.length; i++) {
      const n = c.notes[i]!;
      expect(n.x).toBeGreaterThanOrEqual(0.15);
      expect(n.x).toBeLessThanOrEqual(0.85);
      expect(n.y).toBeGreaterThanOrEqual(0.35);
      expect(n.y).toBeLessThanOrEqual(0.8);
      if (i > 0) {
        const p = c.notes[i - 1]!;
        expect(Math.hypot(n.x - p.x, n.y - p.y)).toBeGreaterThanOrEqual(0.12);
      }
    }
  });
});
