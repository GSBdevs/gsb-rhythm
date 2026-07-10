import { describe, expect, it } from 'vitest';
import type { Beatmap } from '../beatmap.js';
import { DEFAULT_CONFIG, GameState } from '../game-state.js';

function makeBeatmap(notes: Array<{ id: number; timeMs: number; x: number; y: number }>): Beatmap {
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
});
