import { describe, expect, it } from 'vitest';
import { Conductor } from '../conductor.js';

describe('Conductor', () => {
  it('tempo-de-música é negativo durante o lead-in e 0 no início', () => {
    const c = new Conductor(2000);
    c.start(10_000);
    expect(c.songTimeMs(10_000)).toBe(-2000);
    expect(c.songTimeMs(12_000)).toBe(0);
    expect(c.songTimeMs(12_500)).toBe(500);
  });

  it('antes de start retorna -Infinity e zeroAtMs lança', () => {
    const c = new Conductor(1000);
    expect(c.started).toBe(false);
    expect(c.songTimeMs(999)).toBe(Number.NEGATIVE_INFINITY);
    expect(() => c.zeroAtMs).toThrow();
  });

  it('zeroAtMs expõe o instante do beat 0 no relógio-mestre', () => {
    const c = new Conductor(1500);
    c.start(4000);
    expect(c.zeroAtMs).toBe(5500);
  });
});
