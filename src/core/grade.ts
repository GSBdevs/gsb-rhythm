/**
 * Nota-conceito ao fim da partida (modelo osu!: SS/S/A/B/C/D).
 * Simplificado para público casual de evento.
 */

export type Grade = 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

export function gradeFor(accuracy: number, misses: number): Grade {
  if (accuracy >= 0.99 && misses === 0) return 'SS';
  if (accuracy >= 0.93) return 'S';
  if (accuracy >= 0.85) return 'A';
  if (accuracy >= 0.75) return 'B';
  if (accuracy >= 0.6) return 'C';
  return 'D';
}
