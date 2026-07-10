/**
 * Beatmap: a partitura do jogo. Posições em coordenadas normalizadas [0..1]
 * do playfield (x = fração da largura, y = fração da altura). O core nunca
 * conhece pixels — conversão é problema do render.
 */

export interface Note {
  /** id único dentro do beatmap */
  readonly id: number;
  /** instante do acerto perfeito, em ms de tempo-de-música (0 = primeira batida) */
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
}

export interface Beatmap {
  readonly title: string;
  readonly bpm: number;
  /** silêncio antes da música começar (contagem de entrada), em ms */
  readonly leadInMs: number;
  readonly notes: readonly Note[];
}

export interface DemoBeatmapOptions {
  bpm: number;
  noteCount: number;
  /** gerador [0,1) injetado — determinístico em teste */
  rng: () => number;
  /** área de spawn ergonômica (totem vertical: evitar topo e rodapé) */
  area?: { minX: number; maxX: number; minY: number; maxY: number };
  /** distância mínima (em unidades de altura) entre notas consecutivas */
  minGap?: number;
  title?: string;
}

const DEFAULT_AREA = { minX: 0.15, maxX: 0.85, minY: 0.35, maxY: 0.8 };

/** PRNG determinístico simples para demo/testes. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Gera um beatmap de demonstração: uma nota por batida, posições aleatórias
 * mas com distância mínima da nota anterior (mão alcança, não sobrepõe).
 */
export function generateDemoBeatmap(opts: DemoBeatmapOptions): Beatmap {
  const area = opts.area ?? DEFAULT_AREA;
  const minGap = opts.minGap ?? 0.12;
  const beatMs = 60000 / opts.bpm;
  const notes: Note[] = [];
  let prevX = 0.5;
  let prevY = 0.5;

  for (let i = 0; i < opts.noteCount; i++) {
    let x = prevX;
    let y = prevY;
    // rejeita posições coladas na anterior (limite de tentativas evita loop infinito)
    for (let attempt = 0; attempt < 20; attempt++) {
      x = area.minX + opts.rng() * (area.maxX - area.minX);
      y = area.minY + opts.rng() * (area.maxY - area.minY);
      if (Math.hypot(x - prevX, y - prevY) >= minGap) break;
    }
    notes.push({ id: i, timeMs: Math.round(i * beatMs), x, y });
    prevX = x;
    prevY = y;
  }

  return {
    title: opts.title ?? 'Demo',
    bpm: opts.bpm,
    leadInMs: Math.round(beatMs * 4),
    notes,
  };
}
