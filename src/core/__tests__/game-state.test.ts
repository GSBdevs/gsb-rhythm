import { describe, expect, it } from 'vitest';
import type { Beatmap, Note } from '../beatmap.js';
import { DEFAULT_CONFIG, GameState } from '../game-state.js';

function makeBeatmap(notes: Array<Partial<Note> & { id: number; timeMs: number; x: number; y: number }>): Beatmap {
  return { title: 't', bpm: 120, leadInMs: 2000, notes };
}

function playing(beatmap: Beatmap): GameState {
  const s = new GameState(beatmap);
  s.start();
  return s;
}

describe('GameState', () => {
  it('visibleNotes respeita a janela de aproximação', () => {
    const s = playing(makeBeatmap([{ id: 0, timeMs: 1000, x: 0.5, y: 0.5 }]));
    expect(s.visibleNotes(1000 - DEFAULT_CONFIG.approachMs - 1)).toHaveLength(0);
    expect(s.visibleNotes(1000 - DEFAULT_CONFIG.approachMs)).toHaveLength(1);
  });

  it('toque no lugar e na hora certa acerta a nota', () => {
    const s = playing(makeBeatmap([{ id: 0, timeMs: 1000, x: 0.5, y: 0.5 }]));
    const hit = s.tap(0.5, 0.5, 1010);
    expect(hit?.judgement).toBe('perfect');
    expect(hit?.deltaMs).toBe(10);
    expect(s.currentPhase).toBe('finished');
    expect(s.results().counts.perfect).toBe(1);
  });

  it('toque longe da nota não conta (nem consome)', () => {
    const s = playing(makeBeatmap([{ id: 0, timeMs: 1000, x: 0.2, y: 0.5 }]));
    expect(s.tap(0.8, 0.5, 1000)).toBeNull();
    expect(s.results().counts.miss).toBe(0);
    expect(s.visibleNotes(1000)).toHaveLength(1);
  });

  it('toque fora da janela de tempo não conta', () => {
    const s = playing(makeBeatmap([{ id: 0, timeMs: 1000, x: 0.5, y: 0.5 }]));
    expect(s.tap(0.5, 0.5, 1000 + DEFAULT_CONFIG.windows.goodMs + 1)).toBeNull();
  });

  it('com duas notas sobrepostas, acerta a de menor desvio temporal', () => {
    const s = playing(
      makeBeatmap([
        { id: 0, timeMs: 950, x: 0.5, y: 0.5 },
        { id: 1, timeMs: 1010, x: 0.52, y: 0.5 },
      ]),
    );
    const hit = s.tap(0.51, 0.5, 1000);
    expect(hit?.note.id).toBe(1);
  });

  it('tick expira notas vencidas como miss e finaliza a partida', () => {
    const s = playing(
      makeBeatmap([
        { id: 0, timeMs: 1000, x: 0.5, y: 0.5 },
        { id: 1, timeMs: 2000, x: 0.3, y: 0.6 },
      ]),
    );
    const missedAt1500 = s.tick(1000 + DEFAULT_CONFIG.windows.goodMs + 1);
    expect(missedAt1500.map((m) => m.note.id)).toEqual([0]);
    expect(s.currentPhase).toBe('playing');
    const missedAtEnd = s.tick(5000);
    expect(missedAtEnd.map((m) => m.note.id)).toEqual([1]);
    expect(s.currentPhase).toBe('finished');
    expect(s.results().counts.miss).toBe(2);
  });

  it('raio de acerto corrige o eixo x pelo aspect ratio', () => {
    // dx=0.1 em tela 1080x1920 vale 0.05625 em unidades de altura → dentro do raio 0.075
    const s = playing(makeBeatmap([{ id: 0, timeMs: 1000, x: 0.4, y: 0.5 }]));
    expect(s.tap(0.5, 0.5, 1000)?.judgement).toBe('perfect');
    // dy=0.1 já excede o raio
    const s2 = playing(makeBeatmap([{ id: 0, timeMs: 1000, x: 0.4, y: 0.5 }]));
    expect(s2.tap(0.4, 0.6, 1000)).toBeNull();
  });

  it('não julga toques fora da fase playing', () => {
    const s = new GameState(makeBeatmap([{ id: 0, timeMs: 0, x: 0.5, y: 0.5 }]));
    expect(s.tap(0.5, 0.5, 0)).toBeNull();
    expect(s.tick(10_000)).toHaveLength(0);
  });

  it('acorde: dois toques simultâneos acertam as duas notas (multi-toque)', () => {
    const s = playing(
      makeBeatmap([
        { id: 0, timeMs: 1000, x: 0.3, y: 0.5 },
        { id: 1, timeMs: 1000, x: 0.7, y: 0.5 },
      ]),
    );
    expect(s.tap(0.3, 0.5, 1000)?.note.id).toBe(0);
    expect(s.tap(0.7, 0.5, 1000)?.note.id).toBe(1);
    expect(s.results().counts.perfect).toBe(2);
    expect(s.currentPhase).toBe('finished');
  });
});

describe('GameState — holds', () => {
  const holdMap = () =>
    makeBeatmap([{ id: 0, timeMs: 1000, x: 0.5, y: 0.5, kind: 'hold', durationMs: 800 }]);

  it('cabeça do hold vira hold ativo, não finaliza a partida', () => {
    const s = playing(holdMap());
    const hit = s.tap(0.5, 0.5, 1000);
    expect(hit?.event).toBe('hold-start');
    expect(hit?.judgement).toBe('perfect');
    expect(s.isHoldActive(0)).toBe(true);
    expect(s.activeHoldNotes()).toHaveLength(1);
    expect(s.currentPhase).toBe('playing');
    expect(s.results().counts.perfect).toBe(1); // só a cabeça por enquanto
  });

  it('segurar até a cauda = sucesso (cabeça + cauda perfeitas)', () => {
    const s = playing(holdMap());
    s.tap(0.5, 0.5, 1000);
    const rel = s.releaseHold(0, 1800); // cauda em 1000+800
    expect(rel?.event).toBe('hold-end');
    expect(rel?.judgement).toBe('perfect');
    expect(s.results().counts.perfect).toBe(2);
    expect(s.currentPhase).toBe('finished');
  });

  it('soltar cedo demais quebra a cauda (miss) e o combo', () => {
    const s = playing(holdMap());
    s.tap(0.5, 0.5, 1000);
    const rel = s.releaseHold(0, 1200); // muito antes de 1800
    expect(rel?.judgement).toBe('miss');
    expect(s.results().combo).toBe(0);
    expect(s.results().counts.miss).toBe(1);
  });

  it('segurar além da cauda auto-conclui no tick (sucesso)', () => {
    const s = playing(holdMap());
    s.tap(0.5, 0.5, 1000);
    const events = s.tick(1800 + DEFAULT_CONFIG.windows.goodMs + 1);
    expect(events.map((e) => e.event)).toEqual(['hold-end']);
    expect(events[0]?.judgement).toBe('perfect');
    expect(s.isHoldActive(0)).toBe(false);
    expect(s.currentPhase).toBe('finished');
  });

  it('cabeça de hold não tocada expira como miss', () => {
    const s = playing(holdMap());
    const missed = s.tick(1000 + DEFAULT_CONFIG.windows.goodMs + 1);
    expect(missed[0]?.event).toBe('miss');
    expect(s.results().counts.miss).toBe(1);
    expect(s.currentPhase).toBe('finished');
  });

  it('releaseHold em id inexistente retorna null', () => {
    const s = playing(holdMap());
    expect(s.releaseHold(0, 1800)).toBeNull();
  });

  it('endTimeMs considera a cauda do hold', () => {
    const s = playing(holdMap());
    expect(s.endTimeMs).toBe(1800 + DEFAULT_CONFIG.windows.goodMs);
  });
});
