/**
 * Editor de tema — ferramenta do operador. DOM puro, sem Phaser.
 * Rascunho vive em PREVIEW_KEY (botão "Testar jogo" abre ?preview=1);
 * "Aplicar" grava em APPLIED_KEY, que o jogo prioriza ao carregar.
 * Música do operador: analisada aqui (BPM/offset/notas automáticos) e
 * gravada no IndexedDB; o chart resultante viaja dentro do tema.
 */

import { analyzeAudio } from '../core/audio-analysis.js';
import { mulberry32 } from '../core/beatmap.js';
import { generateChart, type Chart } from '../core/chart.js';
import { LeadStore, leadsToCsv } from '../data/lead-store.js';
import { deleteMusic, loadMusic, saveMusic } from '../data/music-db.js';
import { decodeToMono } from '../render/audio/music.js';
import {
  APPLIED_KEY,
  DEFAULT_THEME,
  PREVIEW_KEY,
  resolveTheme,
  type AudioMode,
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

/** estado que não mora em inputs do form */
const musicState: { mode: AudioMode; name: string; chart: Chart | null } = {
  mode: 'synth',
  name: '',
  chart: null,
};
let noteShape: NoteShape = DEFAULT_THEME.noteShape;

// ---------------------------------------------------------------- form ↔ tema

function populate(t: Theme): void {
  input('t-name').value = t.name;
  input('t-title').value = t.texts.title;
  input('t-subtitle').value = t.texts.subtitle;
  input('t-startCta').value = t.texts.startCta;
  input('t-playAgainCta').value = t.texts.playAgainCta;
  input('t-resultsTitle').value = t.texts.resultsTitle;

  for (const [id, val] of Object.entries(t.colors)) input(`c-${id}`).value = val;

  noteShape = t.noteShape;

  input('g-speed').value = String(t.gameplay.speed);
  input('g-approach').value = String(t.gameplay.approachMs);
  input('g-bpm').value = String(t.gameplay.bpm);
  input('g-notes').value = String(t.gameplay.noteCount);
  input('g-seed').value = String(t.gameplay.seed);
  input('g-inputOffset').value = String(t.gameplay.inputOffsetMs);

  select('a-track').value = t.audio.track;
  input('a-volume').value = String(t.audio.volume);
  input('a-hitsounds').checked = t.audio.hitSounds;
  musicState.mode = t.audio.mode;
  musicState.name = t.audio.musicName;
  musicState.chart = t.audio.chart;

  input('l-enabled').checked = t.lead.enabled;
  input('l-headline').value = t.lead.headline;

  refreshOutputs();
  refreshMusicUi();
}

function buildTheme(): Theme {
  return resolveTheme({
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
    noteShape,
    gameplay: {
      bpm: Number(input('g-bpm').value),
      noteCount: Number(input('g-notes').value),
      approachMs: Number(input('g-approach').value),
      seed: Number(input('g-seed').value),
      speed: Number(input('g-speed').value),
      inputOffsetMs: Number(input('g-inputOffset').value),
    },
    audio: {
      mode: musicState.mode,
      track: select('a-track').value as TrackStyle,
      volume: Number(input('a-volume').value),
      hitSounds: input('a-hitsounds').checked,
      musicName: musicState.name,
      chart: musicState.chart,
    },
    lead: {
      enabled: input('l-enabled').checked,
      headline: input('l-headline').value,
    },
  });
}

function pushDraft(): void {
  window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(buildTheme()));
}

function refreshOutputs(): void {
  $('g-speed-out').textContent = `${Math.round(Number(input('g-speed').value) * 100)}%`;
  $('g-approach-out').textContent = `${input('g-approach').value} ms`;
  $('a-volume-out').textContent = `${Math.round(Number(input('a-volume').value) * 100)}%`;
  syncSegmented();
}

// ---------------------------------------------------------------- segmentados

const PRESETS: Record<string, { speed: number; approachMs: number }> = {
  facil: { speed: 0.8, approachMs: 1200 },
  normal: { speed: 1, approachMs: 900 },
  dificil: { speed: 1.25, approachMs: 700 },
  expert: { speed: 1.5, approachMs: 550 },
};

function syncSegmented(): void {
  const speed = Number(input('g-speed').value);
  const approach = Number(input('g-approach').value);
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
    const p = PRESETS[btn.dataset['preset'] ?? ''];
    btn.classList.toggle('active', !!p && Math.abs(p.speed - speed) < 0.001 && p.approachMs === approach);
  }
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-shape]')) {
    btn.classList.toggle('active', btn.dataset['shape'] === noteShape);
  }
}

// ---------------------------------------------------------------- música

function refreshMusicUi(): void {
  const has = musicState.mode === 'music' && musicState.chart !== null;
  $('music-info').hidden = !has;
  $('music-drop').style.display = has ? 'none' : '';
  if (has && musicState.chart) {
    input('music-name').value = musicState.name || '(sem nome)';
    const c = musicState.chart;
    $('music-badges').innerHTML = `
      <span class="badge gold">${c.bpm} BPM</span>
      <span class="badge">offset ${c.offsetMs} ms</span>
      <span class="badge">${c.notes.length} notas</span>
      <span class="badge">${Math.round(c.durationMs / 1000)}s</span>`;
    void loadMusic().then((m) => {
      const audio = $<HTMLAudioElement>('music-audio');
      if (m) audio.src = URL.createObjectURL(m.blob);
    });
  }
}

async function handleMusicFile(file: File): Promise<void> {
  const status = $('music-status');
  status.textContent = '⏳ Decodificando e analisando a música…';
  try {
    const ctx = new AudioContext();
    const decoded = await decodeToMono(ctx, await file.arrayBuffer());
    void ctx.close();
    const analysis = analyzeAudio(decoded.samples, decoded.sampleRate);
    if (analysis.peaks.length < 8 || analysis.confidence < 0.15) {
      status.textContent = '❌ Não encontrei uma batida clara nesse áudio. Tente outra faixa (batida marcada funciona melhor).';
      return;
    }
    const chart = generateChart(analysis, decoded.durationMs, {
      rng: mulberry32(Number(input('g-seed').value) || 7),
    });
    if (chart.notes.length < 8) {
      status.textContent = '❌ Poucas notas geradas — áudio muito curto ou sem batidas fortes.';
      return;
    }
    await saveMusic({ blob: file, name: file.name });
    musicState.mode = 'music';
    musicState.name = file.name;
    musicState.chart = chart;
    const confPct = Math.round(analysis.confidence * 100);
    status.textContent = `✅ Mapa gerado: ${chart.bpm} BPM, ${chart.notes.length} notas (confiança ${confPct}%). Use “Testar jogo” para sentir e ajuste a velocidade se precisar.`;
    refreshMusicUi();
    pushDraft();
  } catch (err) {
    status.textContent = `❌ Falha ao processar o áudio: ${err instanceof Error ? err.message : 'erro desconhecido'}`;
  }
}

// ---------------------------------------------------------------- calibração

async function runCalibration(): Promise<void> {
  const BEATS = 12;
  const BPM = 90;
  const beatSec = 60 / BPM;

  const overlay = document.createElement('div');
  overlay.className = 'cal-overlay';
  overlay.innerHTML = `
    <p class="big">Toque na tela acompanhando a batida</p>
    <div class="cal-circle" id="cal-circle">👆</div>
    <p id="cal-progress">preparando…</p>
    <button class="btn" id="cal-cancel">Cancelar</button>`;
  document.body.appendChild(overlay);

  const ctx = new AudioContext();
  await ctx.resume();
  const startAt = ctx.currentTime + 1.2;
  // agenda os ticks
  for (let b = 0; b < BEATS; b++) {
    const t = startAt + b * beatSec;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = b % 4 === 0 ? 880 : 440;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  const deltas: number[] = [];
  const circle = $('cal-circle');
  const progress = $('cal-progress');

  const pulse = window.setInterval(() => {
    const pos = (ctx.currentTime - startAt) / beatSec;
    if (pos >= 0) circle.style.transform = `scale(${1 + 0.1 * (1 - (pos % 1)) ** 2})`;
  }, 33);

  const finish = (cancelled: boolean) => {
    window.clearInterval(pulse);
    overlay.remove();
    void ctx.close();
    if (cancelled || deltas.length < 4) return;
    deltas.sort((a, b) => a - b);
    const median = deltas[Math.floor(deltas.length / 2)] ?? 0;
    const suggested = Math.round(median / 5) * 5;
    input('g-inputOffset').value = String(Math.max(-300, Math.min(300, suggested)));
    pushDraft();
    window.alert(`Calibração concluída: seu toque chega em média ${median > 0 ? '+' : ''}${Math.round(median)} ms.\nCompensação ajustada para ${input('g-inputOffset').value} ms.`);
  };

  $('cal-cancel').addEventListener('click', () => finish(true));
  overlay.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).id === 'cal-cancel') {
      finish(true);
      return;
    }
    const tapSec = ctx.currentTime;
    const beatIndex = Math.round((tapSec - startAt) / beatSec);
    if (beatIndex < 0 || beatIndex >= BEATS) return;
    const deltaMs = (tapSec - (startAt + beatIndex * beatSec)) * 1000;
    if (Math.abs(deltaMs) > 250) return; // toque perdido não conta
    deltas.push(deltaMs);
    progress.textContent = `${deltas.length} toque(s) registrados`;
    if (deltas.length >= 8) finish(false);
  });

  // fim automático quando os ticks acabam
  window.setTimeout(() => {
    if (document.body.contains(overlay)) finish(deltas.length < 4);
  }, (1.2 + BEATS * beatSec + 1) * 1000);
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
  // cards abrem/fecham
  for (const head of document.querySelectorAll('.card-head')) {
    head.addEventListener('click', () => head.parentElement?.classList.toggle('open'));
  }

  document.querySelector('main')?.addEventListener('input', () => {
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

  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-shape]')) {
    btn.addEventListener('click', () => {
      noteShape = (btn.dataset['shape'] as NoteShape) ?? 'circle';
      syncSegmented();
      pushDraft();
    });
  }

  $('act-test').addEventListener('click', () => {
    pushDraft();
    window.open('index.html?preview=1', '_blank');
  });

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
    if (!window.confirm('Voltar todos os campos para o tema padrão? (a música importada também sai)')) return;
    populate(structuredClone(DEFAULT_THEME));
    void deleteMusic();
    pushDraft();
  });

  // música
  $('music-drop').addEventListener('click', () => $('file-music').click());
  $('music-replace').addEventListener('click', () => $('file-music').click());
  $<HTMLInputElement>('file-music').addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void handleMusicFile(file);
    (e.target as HTMLInputElement).value = '';
  });
  $('music-remove').addEventListener('click', () => {
    void deleteMusic();
    musicState.mode = 'synth';
    musicState.name = '';
    musicState.chart = null;
    $('music-status').textContent = 'Música removida — o jogo volta à trilha sintetizada.';
    refreshMusicUi();
    pushDraft();
  });

  $('act-calibrate').addEventListener('click', () => void runCalibration());

  // leads
  $('lead-export').addEventListener('click', () => {
    download('leads.csv', leadsToCsv(new LeadStore(window.localStorage).all()), 'text/csv');
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
