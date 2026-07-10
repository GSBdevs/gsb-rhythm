/**
 * Editor de tema — ferramenta do operador. DOM puro, sem Phaser.
 * Rascunho vive em PREVIEW_KEY (iframe ?preview=1 lê de lá); "Aplicar"
 * grava em APPLIED_KEY, que o jogo prioriza ao carregar.
 */

import { LeadStore, leadsToCsv } from '../data/lead-store.js';
import {
  APPLIED_KEY,
  DEFAULT_THEME,
  PREVIEW_KEY,
  resolveTheme,
  type NoteShape,
  type Theme,
  type TrackStyle,
} from '../render/theme.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`elemento #${id} ausente`);
  return el as T;
};

const input = (id: string): HTMLInputElement => $(id);
const select = (id: string): HTMLSelectElement => $(id);

// ---------------------------------------------------------------- form ↔ tema

function populate(t: Theme): void {
  input('t-name').value = t.name;
  input('t-title').value = t.texts.title;
  input('t-subtitle').value = t.texts.subtitle;
  input('t-startCta').value = t.texts.startCta;
  input('t-playAgainCta').value = t.texts.playAgainCta;
  input('t-resultsTitle').value = t.texts.resultsTitle;

  for (const [id, val] of Object.entries(t.colors)) input(`c-${id}`).value = val;

  select('n-shape').value = t.noteShape;

  input('g-speed').value = String(t.gameplay.speed);
  input('g-approach').value = String(t.gameplay.approachMs);
  input('g-bpm').value = String(t.gameplay.bpm);
  input('g-notes').value = String(t.gameplay.noteCount);
  input('g-seed').value = String(t.gameplay.seed);

  select('a-track').value = t.audio.track;
  input('a-volume').value = String(t.audio.volume);
  input('a-hitsounds').checked = t.audio.hitSounds;

  input('l-enabled').checked = t.lead.enabled;
  input('l-headline').value = t.lead.headline;

  refreshOutputs();
}

function buildTheme(): Theme {
  const raw = {
    name: input('t-name').value,
    colors: {
      background: input('c-background').value,
      note: input('c-note').value,
      noteBorder: input('c-noteBorder').value,
      approach: input('c-approach').value,
      textPrimary: input('c-textPrimary').value,
      accent: input('c-accent').value,
      perfect: input('c-perfect').value,
      great: input('c-great').value,
      good: input('c-good').value,
      miss: input('c-miss').value,
    },
    texts: {
      title: input('t-title').value,
      subtitle: input('t-subtitle').value,
      startCta: input('t-startCta').value,
      resultsTitle: input('t-resultsTitle').value,
      playAgainCta: input('t-playAgainCta').value,
    },
    noteShape: select('n-shape').value as NoteShape,
    gameplay: {
      bpm: Number(input('g-bpm').value),
      noteCount: Number(input('g-notes').value),
      approachMs: Number(input('g-approach').value),
      seed: Number(input('g-seed').value),
      speed: Number(input('g-speed').value),
    },
    audio: {
      track: select('a-track').value as TrackStyle,
      volume: Number(input('a-volume').value),
      hitSounds: input('a-hitsounds').checked,
    },
    lead: {
      enabled: input('l-enabled').checked,
      headline: input('l-headline').value,
    },
  };
  return resolveTheme(raw); // valida/clampa tudo
}

// ---------------------------------------------------------------- prévia

let reloadTimer: number | undefined;

function pushDraft(): void {
  const theme = buildTheme();
  window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(theme));
  window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(() => {
    const frame = $<HTMLIFrameElement>('preview');
    frame.contentWindow?.location.reload();
  }, 450);
}

function refreshOutputs(): void {
  $('g-speed-out').textContent = `${Math.round(Number(input('g-speed').value) * 100)}%`;
  $('g-approach-out').textContent = `${input('g-approach').value} ms`;
  $('a-volume-out').textContent = `${Math.round(Number(input('a-volume').value) * 100)}%`;
  syncPresetHighlight();
}

// ---------------------------------------------------------------- dificuldade

const PRESETS: Record<string, { speed: number; approachMs: number }> = {
  facil: { speed: 0.8, approachMs: 1200 },
  normal: { speed: 1, approachMs: 900 },
  dificil: { speed: 1.25, approachMs: 700 },
  expert: { speed: 1.5, approachMs: 550 },
};

function syncPresetHighlight(): void {
  const speed = Number(input('g-speed').value);
  const approach = Number(input('g-approach').value);
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
    const p = PRESETS[btn.dataset['preset'] ?? ''];
    btn.classList.toggle('active', !!p && Math.abs(p.speed - speed) < 0.001 && p.approachMs === approach);
  }
}

// ---------------------------------------------------------------- ações

function download(name: string, content: string, mime: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function refreshLeadCount(): void {
  $('lead-count').textContent = String(new LeadStore(window.localStorage).all().length);
}

function wire(): void {
  document.querySelector('.form-col')?.addEventListener('input', () => {
    refreshOutputs();
    pushDraft();
  });

  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.dataset['preset'] ?? ''];
      if (!p) return;
      input('g-speed').value = String(p.speed);
      input('g-approach').value = String(p.approachMs);
      refreshOutputs();
      pushDraft();
    });
  }

  $('act-apply').addEventListener('click', () => {
    window.localStorage.setItem(APPLIED_KEY, JSON.stringify(buildTheme()));
    window.location.href = 'index.html';
  });

  $('act-download').addEventListener('click', () => {
    download('theme.json', JSON.stringify(buildTheme(), null, 2), 'application/json');
  });

  $('act-import').addEventListener('click', () => $('file-import').click());
  $<HTMLInputElement>('file-import').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      populate(resolveTheme(JSON.parse(await file.text())));
      pushDraft();
    } catch {
      window.alert('Arquivo inválido — esperado um theme.json exportado por este editor.');
    }
  });

  $('act-reset').addEventListener('click', () => {
    if (!window.confirm('Voltar todos os campos para o tema padrão?')) return;
    populate(structuredClone(DEFAULT_THEME));
    pushDraft();
  });

  $('lead-export').addEventListener('click', () => {
    const leads = new LeadStore(window.localStorage).all();
    download('leads.csv', leadsToCsv(leads), 'text/csv');
  });

  $('lead-clear').addEventListener('click', () => {
    const store = new LeadStore(window.localStorage);
    if (!window.confirm(`Apagar ${store.all().length} lead(s) deste aparelho? Exporte o CSV antes.`)) return;
    store.clear();
    refreshLeadCount();
  });
}

// ---------------------------------------------------------------- init

async function init(): Promise<void> {
  let current: Theme | null = null;
  try {
    const applied = window.localStorage.getItem(APPLIED_KEY);
    if (applied) current = resolveTheme(JSON.parse(applied));
  } catch {
    current = null;
  }
  if (!current) {
    try {
      const res = await fetch('themes/gsb-default/theme.json');
      if (res.ok) current = resolveTheme(await res.json());
    } catch {
      current = null;
    }
  }
  populate(current ?? structuredClone(DEFAULT_THEME));
  pushDraft();
  refreshLeadCount();
  wire();
}

void init();
