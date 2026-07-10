/**
 * Conductor: converte o relógio-mestre (AudioContext.currentTime no render,
 * qualquer clock em teste) em tempo-de-música. Técnica padrão de jogos de
 * ritmo web: o áudio é a fonte da verdade, o visual segue.
 */
export class Conductor {
  private startAtMs: number | null = null;

  constructor(private readonly leadInMs: number) {}

  /** Agenda o início: tempo-de-música 0 acontece em nowMs + leadInMs. */
  start(nowMs: number): void {
    this.startAtMs = nowMs + this.leadInMs;
  }

  get started(): boolean {
    return this.startAtMs !== null;
  }

  /** Instante (no relógio-mestre) em que o tempo-de-música é 0. */
  get zeroAtMs(): number {
    if (this.startAtMs === null) throw new Error('Conductor não iniciado');
    return this.startAtMs;
  }

  /** Tempo-de-música em ms (negativo durante o lead-in). */
  songTimeMs(nowMs: number): number {
    if (this.startAtMs === null) return Number.NEGATIVE_INFINITY;
    return nowMs - this.startAtMs;
  }
}
