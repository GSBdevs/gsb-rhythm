import type { Judgement } from './judgement.js';

export const SCORE_VALUES: Record<Judgement, number> = {
  perfect: 300,
  great: 150,
  good: 50,
  miss: 0,
};

/** Peso de cada julgamento no cálculo de precisão (modelo osu!). */
const ACCURACY_WEIGHT: Record<Judgement, number> = {
  perfect: 1,
  great: 2 / 3,
  good: 1 / 3,
  miss: 0,
};

export interface ScoreSnapshot {
  readonly score: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly counts: Readonly<Record<Judgement, number>>;
  /** 0..1 */
  readonly accuracy: number;
}

export class Scoreboard {
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private counts: Record<Judgement, number> = { perfect: 0, great: 0, good: 0, miss: 0 };

  /** Bônus de combo: +1% por acerto consecutivo, teto de 2x. */
  addJudgement(j: Judgement): void {
    this.counts[j] += 1;
    if (j === 'miss') {
      this.combo = 0;
      return;
    }
    const multiplier = Math.min(2, 1 + this.combo * 0.01);
    this.score += Math.round(SCORE_VALUES[j] * multiplier);
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  snapshot(): ScoreSnapshot {
    const total = this.counts.perfect + this.counts.great + this.counts.good + this.counts.miss;
    const weighted =
      this.counts.perfect * ACCURACY_WEIGHT.perfect +
      this.counts.great * ACCURACY_WEIGHT.great +
      this.counts.good * ACCURACY_WEIGHT.good;
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      counts: { ...this.counts },
      accuracy: total === 0 ? 1 : weighted / total,
    };
  }
}
