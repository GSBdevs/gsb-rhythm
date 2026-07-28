import { holdTailMs, noteKind, type Beatmap, type Note } from './beatmap.js';
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

/** Tipo do evento que gerou o HitResult (o render reage diferente a cada um). */
export type HitEvent = 'tap' | 'hold-start' | 'hold-end' | 'miss';

export interface HitResult {
  readonly note: Note;
  readonly judgement: Judgement;
  /** desvio do toque em ms (negativo = adiantado); NaN para miss por expiração */
  readonly deltaMs: number;
  readonly event: HitEvent;
}

/**
 * Estado da partida. Puro e dirigido de fora: o render chama tick() com o
 * tempo-de-música (vindo do Conductor), tap() a cada toque e releaseHold() ao
 * soltar o dedo de um hold. Nenhum relógio próprio, nenhum pixel.
 */
export class GameState {
  private phase: Phase = 'ready';
  private readonly pending = new Map<number, Note>();
  /** holds cuja cabeça já foi tocada e que estão sendo segurados agora */
  private readonly activeHolds = new Map<number, Note>();
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

  /** Notas ainda não tocadas que o render deve exibir (janela de aproximação). */
  visibleNotes(songTimeMs: number): Note[] {
    const out: Note[] = [];
    for (const note of this.pending.values()) {
      if (songTimeMs >= note.timeMs - this.config.approachMs) out.push(note);
    }
    return out.sort((a, b) => a.timeMs - b.timeMs);
  }

  /** Holds sendo segurados agora (o render mantém o rastro até soltar/expirar). */
  activeHoldNotes(): Note[] {
    return [...this.activeHolds.values()];
  }

  isHoldActive(id: number): boolean {
    return this.activeHolds.has(id);
  }

  /**
   * Avança o tempo:
   *  - expira notas/cabeças de hold não tocadas cuja janela 'good' passou (miss);
   *  - conclui holds segurados até o fim (cauda passou enquanto segurava = sucesso).
   * Retorna os eventos novos para o render reagir.
   */
  tick(songTimeMs: number): HitResult[] {
    if (this.phase !== 'playing') return [];
    const out: HitResult[] = [];

    for (const note of this.pending.values()) {
      if (songTimeMs > note.timeMs + this.config.windows.goodMs) {
        this.pending.delete(note.id);
        this.board.addJudgement('miss');
        out.push({ note, judgement: 'miss', deltaMs: Number.NaN, event: 'miss' });
      }
    }

    // hold segurado além da cauda + janela = concluído com sucesso
    for (const note of this.activeHolds.values()) {
      if (songTimeMs > holdTailMs(note) + this.config.windows.goodMs) {
        this.activeHolds.delete(note.id);
        this.board.addJudgement('perfect');
        out.push({ note, judgement: 'perfect', deltaMs: 0, event: 'hold-end' });
      }
    }

    this.checkFinished();
    return out;
  }

  /**
   * Processa um toque em (x, y) normalizado. Escolhe, entre as notas dentro do
   * raio e da janela de tempo, a de menor desvio temporal. Tap → consome e
   * pontua; hold → vira hold ativo (a cauda é resolvida em releaseHold/tick).
   * Retorna null se o toque não acertou nada (não pune — público casual).
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

    if (noteKind(best.note) === 'hold') {
      this.activeHolds.set(best.note.id, best.note);
      return { note: best.note, judgement: best.judgement, deltaMs: best.deltaMs, event: 'hold-start' };
    }
    this.checkFinished();
    return { note: best.note, judgement: best.judgement, deltaMs: best.deltaMs, event: 'tap' };
  }

  /**
   * Solta um hold ativo. Segurou até perto/depois da cauda = sucesso (perfect);
   * soltou cedo demais = a cauda vira miss (quebra o combo). Retorna null se o
   * id não é um hold ativo.
   */
  releaseHold(id: number, songTimeMs: number): HitResult | null {
    const note = this.activeHolds.get(id);
    if (!note) return null;
    this.activeHolds.delete(id);

    const tailMs = holdTailMs(note);
    const deltaMs = songTimeMs - tailMs;
    const w = this.config.windows;
    let judgement: Judgement;
    if (deltaMs >= -w.perfectMs) {
      judgement = 'perfect'; // segurou até o fim (ou soltou dentro do perfeito / depois)
    } else if (deltaMs >= -w.greatMs) {
      judgement = 'great';
    } else if (deltaMs >= -w.goodMs) {
      judgement = 'good';
    } else {
      judgement = 'miss'; // soltou cedo demais
    }
    this.board.addJudgement(judgement);
    this.checkFinished();
    return { note, judgement, deltaMs, event: 'hold-end' };
  }

  private checkFinished(): void {
    if (this.pending.size === 0 && this.activeHolds.size === 0) this.phase = 'finished';
  }

  results(): ScoreSnapshot {
    return this.board.snapshot();
  }

  /** Fim natural da música (última cauda + janela), para o render encerrar. */
  get endTimeMs(): number {
    let end = 0;
    for (const note of this.beatmap.notes) end = Math.max(end, holdTailMs(note));
    return end + this.config.windows.goodMs;
  }
}
