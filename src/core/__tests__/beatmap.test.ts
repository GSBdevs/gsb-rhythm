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
});
