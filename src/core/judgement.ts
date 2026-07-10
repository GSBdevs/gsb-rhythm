/**
 * Julgamento por janelas de tempo (modelo osu!/DDR). Janelas generosas de
 * propósito: público casual de evento + latência de touchscreen.
 */

export type Judgement = 'perfect' | 'great' | 'good' | 'miss';

export interface JudgementWindows {
  readonly perfectMs: number;
  readonly greatMs: number;
  readonly goodMs: number;
}

export const DEFAULT_WINDOWS: JudgementWindows = {
  perfectMs: 60,
  greatMs: 110,
  goodMs: 170,
};

/**
 * Julga um toque dado o desvio (toque - instante da nota).
 * Retorna null se o toque está fora até da janela 'good' — nesse caso o
 * toque não consome a nota (política do osu!: early demais não conta miss).
 */
export function judge(deltaMs: number, windows: JudgementWindows = DEFAULT_WINDOWS): Exclude<Judgement, 'miss'> | null {
  const d = Math.abs(deltaMs);
  if (d <= windows.perfectMs) return 'perfect';
  if (d <= windows.greatMs) return 'great';
  if (d <= windows.goodMs) return 'good';
  return null;
}
