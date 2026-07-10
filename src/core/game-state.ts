import type { Beatmap, Note } from './beatmap.js';
import { DEFAULT_WINDOWS, judge, type Judgement, type JudgementWindows } from './judgement.js';
import { Scoreboard, type ScoreSnapshot } from './scoring.js';

export type Phase = 'ready' | 'playing' | 'finished';

export interface GameConfig {
  readonly windows: JudgementWindows;
  /** quanto tempo antes do acerto a nota aparece (anel de aproximação) */
  readonly approachMs: number;
  /**
   * raio de acerto em unidades de altura do playfield (dedo em totem 50" é
   * impreciso — mais generoso que o raio visual da nota).
   */
  readonly hitRadius: number;
  /** largura/altura do playfield, para corrigir a distância no eixo x */
  readonly aspect: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  windows: DEFAULT_WINDOWS,
  approachMs: 900,
  hitRadius: 0.075,
  aspect: 1080 / 1920,
};

export interface HitResult {
  readonly note: Note;
  readonly judgement: Judgement;
  /** desvio do toque em ms (negativo = adiantado); NaN para miss por expiração */
  readonly deltaMs: number;
}

/**
 * Estado da partida. Puro e dirigido de fora: o render chama tick() com o
 * tempo-de-música (vindo do Conductor) e tap() a cada toque. Nenhum relógio
 * próprio, nenhum pixel.
 */
export class GameState {
  private phase: Phase = 'ready';
  private readonly pending = new Map<number, Note>();
  private readonly board = new Scoreboard();

  constructor(
    readonly beatmap: Beatmap,
    readonly config: GameConfig = DEFAULT_CONFIG,
  ) {
    for (const note of beatmap.notes) this.pending.set(note.id, note);
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  start(): void {
    if (this.phase === 'ready') this.phase = 'playing';
  }

  /** Notas que o render deve exibir agora (janela de aproximação até expirar). */
  visibleNotes(songTimeMs: number): Note[] {
    const out: Note[] = [];
    for (const note of this.pending.values()) {
      if (songTimeMs >= note.timeMs - this.config.approachMs) out.push(note);
    }
    return out.sort((a, b) => a.timeMs - b.timeMs);
  }

  /**
   * Avança o tempo: expira notas cuja janela 'good' já passou (miss).
   * Retorna os misses novos para o render reagir (popup, quebra de combo).
   */
  tick(songTimeMs: number): HitResult[] {
    if (this.phase !== 'playing') return [];
    const missed: HitResult[] = [];
    for (const note of this.pending.values()) {
      if (songTimeMs > note.timeMs + this.config.windows.goodMs) {
        this.pending.delete(note.id);
        this.board.addJudgement('miss');
        missed.push({ note, judgement: 'miss', deltaMs: Number.NaN });
      }
    }
    if (this.pending.size === 0) this.phase = 'finished';
    return missed;
  }

  /**
   * Processa um toque em (x, y) normalizado. Escolhe, entre as notas dentro
   * do raio e da janela de tempo, a de menor desvio temporal. Retorna null
   * se o toque não acertou nada (não pune — público casual).
   */
  tap(x: number, y: number, songTimeMs: number): HitResult | null {
    if (this.phase !== 'playing') return null;

    let best: { note: Note; judgement: Exclude<Judgement, 'miss'>; deltaMs: number } | null = null;
    for (const note of this.pending.values()) {
      const deltaMs = songTimeMs - note.timeMs;
      const j = judge(deltaMs, this.config.windows);
      if (j === null) continue;
      const dx = (x - note.x) * this.config.aspect;
      const dy = y - note.y;
      if (Math.hypot(dx, dy) > this.config.hitRadius) continue;
      if (best === null || Math.abs(deltaMs) < Math.abs(best.deltaMs)) {
        best = { note, judgement: j, deltaMs };
      }
    }

    if (best === null) return null;
    this.pending.delete(best.note.id);
    this.board.addJudgement(best.judgement);
    if (this.pending.size === 0) this.phase = 'finished';
    return best;
  }

  results(): ScoreSnapshot {
    return this.board.snapshot();
  }

  /** Fim natural da música (última nota + janela), para o render encerrar. */
  get endTimeMs(): number {
    const last = this.beatmap.notes[this.beatmap.notes.length - 1];
    return (last?.timeMs ?? 0) + this.config.windows.goodMs;
  }
}
