/**
 * Beatmap: a partitura do jogo. Posições em coordenadas normalizadas [0..1]
 * do playfield (x = fração da largura, y = fração da altura). O core nunca
 * conhece pixels — conversão é problema do render.
 */

export type NoteKind = 'tap' | 'hold';

export interface Note {
  /** id único dentro do beatmap */
  readonly id: number;
  /** instante do acerto perfeito, em ms de tempo-de-música (0 = primeira batida) */
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
  /** ausente = 'tap' (retrocompatível com charts antigos) */
  readonly kind?: NoteKind;
  /** duração do hold em ms (só para kind 'hold'); ausente/0 = tap */
  readonly durationMs?: number;
}

/** Tipo efetivo da nota (charts antigos sem `kind` são taps). */
export function noteKind(n: Note): NoteKind {
  return n.kind ?? 'tap';
}

/** Instante do FIM do hold (cauda); para tap é o próprio timeMs. */
export function holdTailMs(n: Note): number {
  return n.timeMs + (noteKind(n) === 'hold' ? (n.durationMs ?? 0) : 0);
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
   * (comportamento clássico), >0 adiciona colcheias, acordes (multi-toque) e
   * holds. Em 0 o consumo do rng é idêntico ao original (posições preservadas).
   */
  richness?: number;
}

interface NoteSpec {
  timeMs: number;
  kind: NoteKind;
  durationMs: number;
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
 * Sequência rítmica de `count` notas: tap na batida por padrão; com richness>0,
 * insere holds (1–2 batidas), acordes (nota simultânea = multi-toque) e avança
 * em colcheias. Com richness=0 não consome rng extra (posições preservadas).
 */
function buildSpecs(count: number, beatMs: number, rng: () => number, richness: number): NoteSpec[] {
  const r = Math.max(0, Math.min(1, richness));
  const holdChance = 0.22 * r;
  const chordChance = 0.28 * r;
  const subdivChance = 0.5 * r;
  const half = beatMs / 2;

  const specs: NoteSpec[] = [];
  let t = 0;
  let guard = 0;
  while (specs.length < count && guard < count * 8 + 50) {
    guard++;
    // hold ocupa 1–2 batidas e pula o tempo coberto
    if (holdChance > 0 && rng() < holdChance) {
      const beats = rng() < 0.5 ? 1 : 2;
      specs.push({ timeMs: Math.round(t), kind: 'hold', durationMs: Math.round(beatMs * beats) });
      t += beatMs * beats;
      continue;
    }
    specs.push({ timeMs: Math.round(t), kind: 'tap', durationMs: 0 });
    // acorde: segunda nota no MESMO instante (duas mãos)
    if (specs.length < count && chordChance > 0 && rng() < chordChance) {
      specs.push({ timeMs: Math.round(t), kind: 'tap', durationMs: 0 });
    }
    // avança meia batida (colcheia) ou uma batida
    t += subdivChance > 0 && rng() < subdivChance ? half : beatMs;
  }
  return specs.slice(0, count);
}

/** Posiciona specs mantendo distância mínima da nota anterior (mão alcança). */
function placeSpecs(specs: readonly NoteSpec[], rng: () => number, area: typeof DEFAULT_AREA, minGap: number): Note[] {
  const notes: Note[] = [];
  let prevX = 0.5;
  let prevY = 0.5;
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]!;
    let x = prevX;
    let y = prevY;
    for (let attempt = 0; attempt < 20; attempt++) {
      x = area.minX + rng() * (area.maxX - area.minX);
      y = area.minY + rng() * (area.maxY - area.minY);
      if (Math.hypot(x - prevX, y - prevY) >= minGap) break;
    }
    notes.push({ id: i, timeMs: s.timeMs, x, y, kind: s.kind, durationMs: s.durationMs });
    prevX = x;
    prevY = y;
  }
  return notes;
}

/** Gera um beatmap de demonstração (uma nota por batida, ou rítmico se richness>0). */
export function generateDemoBeatmap(opts: DemoBeatmapOptions): Beatmap {
  const beatMs = 60000 / opts.bpm;
  const specs = buildSpecs(opts.noteCount, beatMs, opts.rng, opts.richness ?? 0);
  return {
    title: opts.title ?? 'Demo',
    bpm: opts.bpm,
    leadInMs: Math.round(beatMs * 4),
    notes: placeSpecs(specs, opts.rng, opts.area ?? DEFAULT_AREA, opts.minGap ?? 0.12),
  };
}
