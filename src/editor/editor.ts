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
import { CSV_BOM, LeadStore, leadsToCsv } from '../data/lead-store.js';
import { deleteMusic, loadMusic, saveMusic } from '../data/music-db.js';
import { exportTextFile } from '../platform/file-export.js';
import { saveAppliedThemeNative } from '../platform/native-store.js';
import { decodeToMono, outputLatencyMs } from '../render/audio/music.js';
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
const imagesState: { startIcon: string; wallpaper: string; noteImages: string[] } = {
  startIcon: '',
  wallpaper: '',
  noteImages: [],
};
const MAX_NOTE_IMAGES = 40;
let noteShape: NoteShape = DEFAULT_THEME.noteShape;

/**
 * Redimensiona uma imagem no upload: sem isso, um PNG/JPEG cru estoura o
 * localStorage (limite ~5 MB) e o tema fica grande demais para exportar.
 * Retorna data-URI. Ícone → PNG (mantém transparência); parede → JPEG.
 */
function resizeImage(file: File, maxDim: number, mime: 'image/png' | 'image/jpeg', quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas indisponível'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL(mime, quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('imagem inválida'));
    };
    img.src = url;
  });
}

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
  imagesState.startIcon = t.images.startIcon;
  imagesState.wallpaper = t.images.wallpaper;
  imagesState.noteImages = [...t.images.noteImages];

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
  input('l-required').checked = t.lead.required;
  input('l-consent').value = t.lead.consentText;

  refreshOutputs();
  refreshMusicUi();
  refreshImagesUi();
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
    images: {
      startIcon: imagesState.startIcon,
      wallpaper: imagesState.wallpaper,
      noteImages: imagesState.noteImages,
    },
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
      required: input('l-required').checked,
      consentText: input('l-consent').value,
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

// ---------------------------------------------------------------- imagens

function refreshImageThumb(thumbId: string, dataUri: string): void {
  const thumb = $(thumbId);
  if (dataUri) {
    thumb.style.backgroundImage = `url("${dataUri}")`;
    thumb.textContent = '';
    delete thumb.dataset['empty'];
  } else {
    thumb.style.backgroundImage = '';
    thumb.textContent = 'sem imagem';
    thumb.dataset['empty'] = '1';
  }
}

function refreshImagesUi(): void {
  refreshImageThumb('img-icon-thumb', imagesState.startIcon);
  refreshImageThumb('img-wall-thumb', imagesState.wallpaper);
  ($('img-icon-remove') as HTMLButtonElement).hidden = imagesState.startIcon === '';
  ($('img-wall-remove') as HTMLButtonElement).hidden = imagesState.wallpaper === '';
  refreshNoteImagesUi();
}

function refreshNoteImagesUi(): void {
  const grid = $('note-imgs-grid');
  grid.replaceChildren();
  imagesState.noteImages.forEach((uri, i) => {
    const cell = document.createElement('div');
    cell.className = 'note-img';
    cell.style.backgroundImage = `url("${uri}")`;
    const idx = document.createElement('span');
    idx.className = 'idx';
    idx.textContent = String(i + 1);
    const rm = document.createElement('button');
    rm.className = 'rm';
    rm.type = 'button';
    rm.textContent = '×';
    rm.title = 'remover';
    rm.addEventListener('click', () => {
      imagesState.noteImages.splice(i, 1);
      refreshNoteImagesUi();
      pushDraft();
    });
    cell.append(idx, rm);
    grid.appendChild(cell);
  });
  ($('note-imgs-clear') as HTMLButtonElement).hidden = imagesState.noteImages.length === 0;
}

async function addNoteImages(files: FileList): Promise<void> {
  const room = MAX_NOTE_IMAGES - imagesState.noteImages.length;
  const list = [...files].slice(0, Math.max(0, room));
  for (const file of list) {
    try {
      // notas são pequenas na tela; 256px PNG preserva transparência e recorte
      imagesState.noteImages.push(await resizeImage(file, 256, 'image/png', 1));
    } catch {
      /* ignora arquivo inválido */
    }
  }
  if (files.length > room) {
    window.alert(`Limite de ${MAX_NOTE_IMAGES} imagens de nota. As excedentes foram ignoradas.`);
  }
  refreshNoteImagesUi();
  pushDraft();
}

// ---------------------------------------------------------------- seeds

const SAVED_SEEDS_KEY = 'sbRhythmSavedSeeds';
const MAX_SAVED_SEEDS = 30;

function loadSavedSeeds(): number[] {
  try {
    const raw = window.localStorage.getItem(SAVED_SEEDS_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : [];
  } catch {
    return [];
  }
}

function writeSavedSeeds(seeds: number[]): void {
  window.localStorage.setItem(SAVED_SEEDS_KEY, JSON.stringify(seeds.slice(0, MAX_SAVED_SEEDS)));
}

/** Guarda a seed (mais recente primeiro, sem duplicar). */
function rememberSeed(seed: number): void {
  writeSavedSeeds([seed, ...loadSavedSeeds().filter((s) => s !== seed)]);
}

function renderSeedChips(): void {
  const box = $('seed-chips');
  const current = Number(input('g-seed').value);
  box.replaceChildren();
  for (const seed of loadSavedSeeds()) {
    const chip = document.createElement('span');
    chip.className = 'seed-chip' + (seed === current ? ' active' : '');
    const label = document.createElement('span');
    label.textContent = String(seed);
    label.addEventListener('click', () => {
      input('g-seed').value = String(seed);
      renderSeedChips();
      pushDraft();
    });
    const rm = document.createElement('span');
    rm.className = 'rm';
    rm.textContent = '×';
    rm.title = 'remover';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      writeSavedSeeds(loadSavedSeeds().filter((s) => s !== seed));
      renderSeedChips();
    });
    chip.append(label, rm);
    box.appendChild(chip);
  }
}

async function handleImageFile(file: File, kind: 'startIcon' | 'wallpaper'): Promise<void> {
  try {
    imagesState[kind] =
      kind === 'startIcon'
        ? await resizeImage(file, 512, 'image/png', 1) // logo: preserva transparência
        : await resizeImage(file, 1440, 'image/jpeg', 0.82); // parede: JPEG leve
    refreshImagesUi();
    pushDraft();
  } catch {
    window.alert('Não consegui ler essa imagem. Tente um PNG ou JPEG.');
  }
}

async function handleMusicFile(file: File): Promise<void> {
  const status = $('music-status');
  status.textContent = '⏳ Decodificando e analisando a música…';
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const decoded = await decodeToMono(ctx, await file.arrayBuffer());
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

  const ctx = new AudioContext({ latencyHint: 'interactive' });
  await ctx.resume();
  const autoLatency = outputLatencyMs(ctx); // chute do aparelho, caso falte toque
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
    if (cancelled) return;
    if (deltas.length < 4) {
      // poucos toques: cai para a latência de saída medida do aparelho
      if (autoLatency > 0) {
        input('g-inputOffset').value = String(Math.max(-300, Math.min(300, autoLatency)));
        pushDraft();
        window.alert(`Toques insuficientes para calibrar. Usei a latência de saída detectada do aparelho: ${autoLatency} ms.`);
      }
      return;
    }
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

// No Android a ancora <a download> nao funciona — o helper decide entre
// download (web/Electron) e folha de compartilhamento nativa (Capacitor).
function download(name: string, content: string, mime: string): void {
  void exportTextFile(name, content, mime);
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

  // seeds: gerar aleatória (auto-salva) + destacar a seed ativa ao digitar
  $('seed-random').addEventListener('click', () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    input('g-seed').value = String(seed);
    rememberSeed(seed);
    renderSeedChips();
    pushDraft();
  });
  input('g-seed').addEventListener('input', () => renderSeedChips());

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
    const json = JSON.stringify(buildTheme());
    window.localStorage.setItem(APPLIED_KEY, json);
    // No Android grava tambem em disco (backup: o WebView pode descartar o
    // localStorage); so navega depois, senao o unload cancela a escrita.
    void saveAppliedThemeNative(json).finally(() => {
      window.location.href = 'index.html';
    });
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

  // imagens
  const wireImage = (kind: 'startIcon' | 'wallpaper', pickId: string, fileId: string, removeId: string) => {
    $(pickId).addEventListener('click', () => $(fileId).click());
    $<HTMLInputElement>(fileId).addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) void handleImageFile(file, kind);
      (e.target as HTMLInputElement).value = '';
    });
    $(removeId).addEventListener('click', () => {
      imagesState[kind] = '';
      refreshImagesUi();
      pushDraft();
    });
  };
  wireImage('startIcon', 'img-icon-pick', 'img-icon-file', 'img-icon-remove');
  wireImage('wallpaper', 'img-wall-pick', 'img-wall-file', 'img-wall-remove');

  // imagens das notas (múltiplas)
  $('note-imgs-add').addEventListener('click', () => $('note-imgs-file').click());
  $<HTMLInputElement>('note-imgs-file').addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length) void addNoteImages(files);
    (e.target as HTMLInputElement).value = '';
  });
  $('note-imgs-clear').addEventListener('click', () => {
    if (!window.confirm('Remover todas as imagens de nota?')) return;
    imagesState.noteImages = [];
    refreshNoteImagesUi();
    pushDraft();
  });

  $('act-calibrate').addEventListener('click', () => void runCalibration());

  // leads
  $('lead-export').addEventListener('click', () => {
    download('leads.csv', CSV_BOM + leadsToCsv(new LeadStore(window.localStorage).all()), 'text/csv');
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
  renderSeedChips();
  wire();
}

void init();
