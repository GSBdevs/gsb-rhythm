/**
 * Beatmap: a partitura do jogo. Posições em coordenadas normalizadas [0..1]
 * do playfield (x = fração da largura, y = fração da altura). O core nunca
 * conhece pixels — conversão é problema do render.
 *
 * Todas as notas são "tap" (tocar no lugar). Com richness>0 o gerador varia o
 * ritmo com colcheias e acordes (duas notas simultâneas = multi-toque).
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
  /**
   * 0..1 — riqueza rítmica (sobe com a dificuldade): 0 = uma nota por batida
   * (comportamento clássico), >0 adiciona colcheias e acordes (multi-toque).
   * Em 0 o consumo do rng é idêntico ao original (posições preservadas).
   */
  richness?: number;
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
 * Sorteia posições para uma lista de tempos: aleatórias, mas com distância
 * mínima da nota anterior (mão alcança, não sobrepõe). Compartilhado entre o
 * beatmap demo e o chart gerado de música real.
 */
export function placeNotes(
  timesMs: readonly number[],
  rng: () => number,
  area = DEFAULT_AREA,
  minGap = 0.12,
): Note[] {
  const notes: Note[] = [];
  let prevX = 0.5;
  let prevY = 0.5;
  for (let i = 0; i < timesMs.length; i++) {
    let x = prevX;
    let y = prevY;
    // rejeita posições coladas na anterior (limite de tentativas evita loop infinito)
    for (let attempt = 0; attempt < 20; attempt++) {
      x = area.minX + rng() * (area.maxX - area.minX);
      y = area.minY + rng() * (area.maxY - area.minY);
      if (Math.hypot(x - prevX, y - prevY) >= minGap) break;
    }
    notes.push({ id: i, timeMs: Math.round(timesMs[i] ?? 0), x, y });
    prevX = x;
    prevY = y;
  }
  return notes;
}

/**
 * Tempos das notas de um beatmap rítmico: tap na batida por padrão; com
 * richness>0 insere acordes (nota no MESMO instante = multi-toque) e avança em
 * colcheias. Com richness=0 não consome rng extra (posições preservadas).
 */
function buildTimes(count: number, beatMs: number, rng: () => number, richness: number): number[] {
  const r = Math.max(0, Math.min(1, richness));
  const chordChance = 0.28 * r;
  const subdivChance = 0.5 * r;
  const half = beatMs / 2;

  const times: number[] = [];
  let t = 0;
  let guard = 0;
  while (times.length < count && guard < count * 8 + 50) {
    guard++;
    times.push(Math.round(t));
    // acorde: segunda nota no MESMO instante (duas mãos)
    if (times.length < count && chordChance > 0 && rng() < chordChance) {
      times.push(Math.round(t));
    }
    // avança meia batida (colcheia) ou uma batida
    t += subdivChance > 0 && rng() < subdivChance ? half : beatMs;
  }
  return times.slice(0, count);
}

/** Gera um beatmap de demonstração (uma nota por batida, ou rítmico se richness>0). */
export function generateDemoBeatmap(opts: DemoBeatmapOptions): Beatmap {
  const beatMs = 60000 / opts.bpm;
  const times = buildTimes(opts.noteCount, beatMs, opts.rng, opts.richness ?? 0);
  return {
    title: opts.title ?? 'Demo',
    bpm: opts.bpm,
    leadInMs: Math.round(beatMs * 4),
    notes: placeNotes(times, opts.rng, opts.area ?? DEFAULT_AREA, opts.minGap ?? 0.12),
  };
}
