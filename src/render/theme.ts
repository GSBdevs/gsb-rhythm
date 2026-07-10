/**
 * Tema: tudo que o operador do totem pode customizar sem código.
 * DEFAULT_THEME é fallback completo (o jogo nunca quebra por JSON ruim) e
 * resolveTheme mescla JSON não-confiável campo a campo.
 *
 * Fontes de tema, em ordem de prioridade (loadTheme):
 *   1. ?preview=1        → rascunho do editor (localStorage PREVIEW_KEY)
 *   2. ?theme=<id>       → fetch themes/<id>/theme.json
 *   3. tema aplicado     → localStorage APPLIED_KEY (editor "Aplicar")
 *   4. themes/gsb-default/theme.json → DEFAULT_THEME
 */

export type NoteShape = 'circle' | 'square' | 'diamond' | 'hexagon' | 'star';
export type TrackStyle = 'metronome' | 'beat' | 'arcade';

export const PREVIEW_KEY = 'sbRhythmThemeDraft';
export const APPLIED_KEY = 'sbRhythmActiveTheme';

export interface Theme {
  name: string;
  colors: {
    background: string;
    note: string;
    noteBorder: string;
    approach: string;
    textPrimary: string;
    accent: string;
    perfect: string;
    great: string;
    good: string;
    miss: string;
  };
  texts: {
    title: string;
    subtitle: string;
    startCta: string;
    resultsTitle: string;
    playAgainCta: string;
  };
  noteShape: NoteShape;
  gameplay: {
    bpm: number;
    noteCount: number;
    approachMs: number;
    seed: number;
    /** multiplicador de velocidade/dificuldade (0.5 = fácil, 2 = expert) */
    speed: number;
  };
  audio: {
    track: TrackStyle;
    /** 0..1 */
    volume: number;
    hitSounds: boolean;
  };
  lead: {
    enabled: boolean;
    headline: string;
  };
}

export const DEFAULT_THEME: Theme = {
  name: 'SB Rhythm',
  colors: {
    background: '#0a0a0a',
    note: '#2d6cdf',
    noteBorder: '#ffffff',
    approach: '#9a9a9a',
    textPrimary: '#ffffff',
    accent: '#ffd23f',
    perfect: '#ffd23f',
    great: '#4cd964',
    good: '#5ac8fa',
    miss: '#ff3b30',
  },
  texts: {
    title: 'SB RHYTHM',
    subtitle: 'Toque nas notas no ritmo da batida',
    startCta: 'TOQUE',
    resultsTitle: 'RESULTADO',
    playAgainCta: 'DE NOVO',
  },
  noteShape: 'circle',
  gameplay: {
    bpm: 100,
    noteCount: 32,
    approachMs: 900,
    seed: 7,
    speed: 1,
  },
  audio: {
    track: 'beat',
    volume: 0.8,
    hitSounds: true,
  },
  lead: {
    enabled: false,
    headline: 'Cadastre-se para concorrer ao brinde',
  },
};

const NOTE_SHAPES: readonly NoteShape[] = ['circle', 'square', 'diamond', 'hexagon', 'star'];
const TRACK_STYLES: readonly TrackStyle[] = ['metronome', 'beat', 'arcade'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pickString(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
}

function pickColor(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
}

function pickNumber(raw: unknown, fallback: number, min: number, max: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= min && raw <= max ? raw : fallback;
}

function pickBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

/** Mescla JSON não-confiável sobre o DEFAULT_THEME, campo a campo. */
export function resolveTheme(raw: unknown): Theme {
  const d = DEFAULT_THEME;
  if (!isRecord(raw)) return structuredClone(d);
  const colors = isRecord(raw['colors']) ? raw['colors'] : {};
  const texts = isRecord(raw['texts']) ? raw['texts'] : {};
  const gameplay = isRecord(raw['gameplay']) ? raw['gameplay'] : {};
  const audio = isRecord(raw['audio']) ? raw['audio'] : {};
  const lead = isRecord(raw['lead']) ? raw['lead'] : {};
  const shape = raw['noteShape'];
  const track = audio['track'];
  return {
    name: pickString(raw['name'], d.name),
    colors: {
      background: pickColor(colors['background'], d.colors.background),
      note: pickColor(colors['note'], d.colors.note),
      noteBorder: pickColor(colors['noteBorder'], d.colors.noteBorder),
      approach: pickColor(colors['approach'], d.colors.approach),
      textPrimary: pickColor(colors['textPrimary'], d.colors.textPrimary),
      accent: pickColor(colors['accent'], d.colors.accent),
      perfect: pickColor(colors['perfect'], d.colors.perfect),
      great: pickColor(colors['great'], d.colors.great),
      good: pickColor(colors['good'], d.colors.good),
      miss: pickColor(colors['miss'], d.colors.miss),
    },
    texts: {
      title: pickString(texts['title'], d.texts.title),
      subtitle: pickString(texts['subtitle'], d.texts.subtitle),
      startCta: pickString(texts['startCta'], d.texts.startCta),
      resultsTitle: pickString(texts['resultsTitle'], d.texts.resultsTitle),
      playAgainCta: pickString(texts['playAgainCta'], d.texts.playAgainCta),
    },
    noteShape: NOTE_SHAPES.includes(shape as NoteShape) ? (shape as NoteShape) : d.noteShape,
    gameplay: {
      bpm: pickNumber(gameplay['bpm'], d.gameplay.bpm, 40, 220),
      noteCount: pickNumber(gameplay['noteCount'], d.gameplay.noteCount, 4, 500),
      approachMs: pickNumber(gameplay['approachMs'], d.gameplay.approachMs, 300, 3000),
      seed: pickNumber(gameplay['seed'], d.gameplay.seed, 0, 2 ** 31),
      speed: pickNumber(gameplay['speed'], d.gameplay.speed, 0.5, 2),
    },
    audio: {
      track: TRACK_STYLES.includes(track as TrackStyle) ? (track as TrackStyle) : d.audio.track,
      volume: pickNumber(audio['volume'], d.audio.volume, 0, 1),
      hitSounds: pickBool(audio['hitSounds'], d.audio.hitSounds),
    },
    lead: {
      enabled: pickBool(lead['enabled'], d.lead.enabled),
      headline: pickString(lead['headline'], d.lead.headline),
    },
  };
}

function fromStorage(key: string): Theme | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return resolveTheme(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function fromFetch(id: string): Promise<Theme | null> {
  try {
    const res = await fetch(`themes/${id}/theme.json`);
    if (!res.ok) return null;
    return resolveTheme(await res.json());
  } catch {
    return null;
  }
}

/** Resolve a fonte do tema pela prioridade documentada no topo do arquivo. */
export async function loadTheme(): Promise<Theme> {
  const params = new URLSearchParams(window.location.search);
  if (params.get('preview') === '1') {
    return fromStorage(PREVIEW_KEY) ?? structuredClone(DEFAULT_THEME);
  }
  const explicit = params.get('theme');
  if (explicit) {
    return (await fromFetch(explicit)) ?? structuredClone(DEFAULT_THEME);
  }
  return fromStorage(APPLIED_KEY) ?? (await fromFetch('gsb-default')) ?? structuredClone(DEFAULT_THEME);
}

/** '#rrggbb' → número Phaser. */
export function colorToNum(c: string): number {
  return parseInt(c.slice(1), 16);
}
