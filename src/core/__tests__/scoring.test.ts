import { describe, expect, it } from 'vitest';
import { Scoreboard, SCORE_VALUES } from '../scoring.js';

describe('Scoreboard', () => {
  it('acumula pontos com bônus de combo', () => {
    const b = new Scoreboard();
    b.addJudgement('perfect'); // combo 0 → x1.00 → 300
    b.addJudgement('perfect'); // combo 1 → x1.01 → 303
    const s = b.snapshot();
    expect(s.score).toBe(300 + Math.round(SCORE_VALUES.perfect * 1.01));
    expect(s.combo).toBe(2);
  });

  it('miss zera o combo mas preserva maxCombo', () => {
    const b = new Scoreboard();
    b.addJudgement('good');
    b.addJudgement('great');
    b.addJudgement('miss');
    const s = b.snapshot();
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(2);
    expect(s.counts.miss).toBe(1);
  });

  it('accuracy pondera julgamentos (só perfects = 100%)', () => {
    const b = new Scoreboard();
    b.addJudgement('perfect');
    b.addJudgement('perfect');
    expect(b.snapshot().accuracy).toBe(1);
    b.addJudgement('miss');
    expect(b.snapshot().accuracy).toBeCloseTo(2 / 3);
  });

  it('accuracy é 1 sem julgamentos (não divide por zero)', () => {
    expect(new Scoreboard().snapshot().accuracy).toBe(1);
  });
});
