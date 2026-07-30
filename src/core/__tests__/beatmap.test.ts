import { describe, expect, it } from 'vitest';
import { generateDemoBeatmap, mulberry32 } from '../beatmap.js';

describe('generateDemoBeatmap', () => {
  it('gera uma nota por batida no BPM pedido', () => {
    const b = generateDemoBeatmap({ bpm: 120, noteCount: 8, rng: mulberry32(1) });
    expect(b.notes).toHaveLength(8);
    expect(b.notes[0]?.timeMs).toBe(0);
    expect(b.notes[1]?.timeMs).toBe(500);
    expect(b.notes[7]?.timeMs).toBe(3500);
    expect(b.leadInMs).toBe(2000);
  });

  it('é determinístico com o mesmo seed', () => {
    const a = generateDemoBeatmap({ bpm: 100, noteCount: 20, rng: mulberry32(42) });
    const b = generateDemoBeatmap({ bpm: 100, noteCount: 20, rng: mulberry32(42) });
    expect(a).toEqual(b);
  });

  it('mantém as notas dentro da área de spawn', () => {
    const area = { minX: 0.2, maxX: 0.8, minY: 0.4, maxY: 0.7 };
    const b = generateDemoBeatmap({ bpm: 140, noteCount: 50, rng: mulberry32(7), area });
    for (const n of b.notes) {
      expect(n.x).toBeGreaterThanOrEqual(area.minX);
      expect(n.x).toBeLessThanOrEqual(area.maxX);
      expect(n.y).toBeGreaterThanOrEqual(area.minY);
      expect(n.y).toBeLessThanOrEqual(area.maxY);
    }
  });

  it('notas consecutivas respeitam distância mínima', () => {
    const b = generateDemoBeatmap({ bpm: 120, noteCount: 30, rng: mulberry32(3), minGap: 0.12 });
    for (let i = 1; i < b.notes.length; i++) {
      const prev = b.notes[i - 1]!;
      const cur = b.notes[i]!;
      expect(Math.hypot(cur.x - prev.x, cur.y - prev.y)).toBeGreaterThanOrEqual(0.12);
    }
  });

  it('richness 0 = uma nota por batida (comportamento clássico preservado)', () => {
    const b = generateDemoBeatmap({ bpm: 120, noteCount: 12, rng: mulberry32(5), richness: 0 });
    for (let i = 0; i < b.notes.length; i++) expect(b.notes[i]?.timeMs).toBe(i * 500);
  });

  it('richness alto produz acordes (duas notas no mesmo instante = multi-toque)', () => {
    const b = generateDemoBeatmap({ bpm: 120, noteCount: 60, rng: mulberry32(11), richness: 1 });
    expect(b.notes).toHaveLength(60);
    const byTime = new Map<number, number>();
    for (const n of b.notes) byTime.set(n.timeMs, (byTime.get(n.timeMs) ?? 0) + 1);
    expect([...byTime.values()].some((c) => c >= 2)).toBe(true);
  });

  it('richness alto usa colcheias (nem todo intervalo é uma batida cheia)', () => {
    const b = generateDemoBeatmap({ bpm: 120, noteCount: 60, rng: mulberry32(11), richness: 1 });
    // 120 BPM → batida 500ms, colcheia 250ms; algum intervalo (>0) deve ser 250
    const times = [...new Set(b.notes.map((n) => n.timeMs))].sort((a, c) => a - c);
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    expect(gaps.some((g) => g === 250)).toBe(true);
  });

  it('continua determinístico com richness', () => {
    const a = generateDemoBeatmap({ bpm: 128, noteCount: 40, rng: mulberry32(9), richness: 0.7 });
    const b = generateDemoBeatmap({ bpm: 128, noteCount: 40, rng: mulberry32(9), richness: 0.7 });
    expect(a).toEqual(b);
  });
});
