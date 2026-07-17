import Phaser from 'phaser';
import { generateDemoBeatmap, mulberry32, type Beatmap, type Note } from '../../core/beatmap.js';
import { Conductor } from '../../core/conductor.js';
import { DEFAULT_CONFIG, GameState, type HitResult } from '../../core/game-state.js';
import { gradeFor, type Grade } from '../../core/grade.js';
import { CSV_BOM, LeadStore, leadsToCsv, terminalId } from '../../data/lead-store.js';
import { loadMusic } from '../../data/music-db.js';
import { decodeToMono, playMusic } from '../audio/music.js';
import { playHitSound, scheduleTrack } from '../audio/tracks.js';
import { mirrorLeadsCsvNative } from '../../platform/native-store.js';
import { TriangleField } from '../fx/triangles.js';
import { colorToNum, type NoteShape, type Theme } from '../theme.js';

export const WIDTH = 1080;
export const HEIGHT = 1920;

/** raio visual da nota em px (o raio de ACERTO é maior e vive no core) */
const NOTE_RADIUS = 90;
const APPROACH_START_SCALE = 2.6;
const LOGO_RADIUS = 280;

type UiPhase = 'attract' | 'playing' | 'results';

const FONT = 'Arial, sans-serif';

export class GameScene extends Phaser.Scene {
  private theme!: Theme;
  private state!: GameState;
  private conductor!: Conductor;
  private audio: AudioContext | null = null;
  private uiPhase: UiPhase = 'attract';
  private effectiveBpm = 100;

  private triangles!: TriangleField;
  private noteVisuals = new Map<number, { body: Phaser.GameObjects.Graphics; ring: Phaser.GameObjects.Graphics; note: Note }>();
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private accText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private logo: Phaser.GameObjects.Container | null = null;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private lastCombo = 0;
  private lastCountdown = -1;
  private leadFormEl: HTMLElement | null = null;
  /** deslocamento da grade de batida (music: chart.offsetMs/speed) p/ pulso visual */
  private phaseOffsetMs = 0;
  /** blob da música do operador, pré-carregado do IndexedDB no create */
  private musicPromise: Promise<ArrayBuffer | null> | null = null;
  private starting = false;
  // Pausa: audio.suspend() congela o relógio-mestre (som + julgamento juntos).
  private paused = false;
  private pauseUi: Phaser.GameObjects.GameObject[] = [];
  private pauseBtn: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('game');
  }

  init(): void {
    this.theme = this.registry.get('theme') as Theme;
  }

  create(): void {
    const g = this.theme.gameplay;
    const chart = this.theme.audio.mode === 'music' ? this.theme.audio.chart : null;
    let beatmap: Beatmap;
    if (chart) {
      // música real: tempos do chart escalados por speed (Double Time do osu!)
      this.effectiveBpm = Phaser.Math.Clamp(chart.bpm * g.speed, 30, 300);
      const beatMs = 60000 / this.effectiveBpm;
      beatmap = {
        title: this.theme.audio.musicName || this.theme.name,
        bpm: this.effectiveBpm,
        leadInMs: Math.max(1500, Math.round(beatMs * 4)),
        notes: chart.notes.map((n) => ({ ...n, timeMs: Math.round(n.timeMs / g.speed) })),
      };
      this.phaseOffsetMs = chart.offsetMs / g.speed;
      this.musicPromise = loadMusic().then((m) => (m ? m.blob.arrayBuffer() : null)).catch(() => null);
    } else {
      this.effectiveBpm = Phaser.Math.Clamp(g.bpm * g.speed, 30, 300);
      beatmap = generateDemoBeatmap({
        bpm: this.effectiveBpm,
        noteCount: g.noteCount,
        rng: mulberry32(g.seed),
        title: this.theme.name,
      });
      this.phaseOffsetMs = 0;
      this.musicPromise = null;
    }
    this.state = new GameState(beatmap, { ...DEFAULT_CONFIG, approachMs: g.approachMs });
    this.conductor = new Conductor(beatmap.leadInMs);
    this.uiPhase = 'attract';
    this.noteVisuals.clear();
    this.lastCombo = 0;
    this.lastCountdown = -1;
    this.starting = false;
    this.paused = false;
    this.pauseUi = [];
    this.pauseBtn = null;

    const c = this.theme.colors;
    this.cameras.main.setBackgroundColor(c.background);

    // fundo estilo osu!lazer: triângulos flutuando, pulsando na batida
    this.triangles = new TriangleField(this, {
      colors: [colorToNum(c.note), colorToNum(c.accent), colorToNum(c.approach)],
      count: 18,
      width: WIDTH,
      height: HEIGHT,
      depth: 0,
      maxAlpha: 0.13,
    });

    this.scoreText = this.text(WIDTH / 2, 110, '', 86, c.textPrimary, true).setDepth(10);
    this.comboText = this.text(WIDTH / 2, 205, '', 54, c.accent, true).setDepth(10);
    // precisão ao vivo no canto superior direito, como no osu!
    this.accText = this.text(WIDTH - 60, 90, '', 48, c.textPrimary, true).setOrigin(1, 0.5).setDepth(10);
    this.countdownText = this.text(WIDTH / 2, HEIGHT * 0.45, '', 260, c.accent, true).setDepth(25);

    this.showAttract();
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => this.onTap(ptr));
    this.events.once('shutdown', () => {
      this.stopAudio();
      this.destroyLeadForm();
    });
  }

  // ---------------------------------------------------------------- fases

  private showAttract(): void {
    const t = this.theme.texts;
    const c = this.theme.colors;
    this.logo = this.buildCircleButton(WIDTH / 2, HEIGHT * 0.47, LOGO_RADIUS, t.startCta, 92);
    this.overlay = [
      this.text(WIDTH / 2, HEIGHT * 0.14, t.title, 150, c.accent, true),
      this.text(WIDTH / 2, HEIGHT * 0.24, t.subtitle, 52, c.textPrimary),
      this.text(WIDTH / 2, HEIGHT * 0.72, 'toque em qualquer lugar para começar', 38, c.approach),
      this.logo,
      this.gearButton(),
    ];
  }

  private async startSong(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    this.clearOverlay();

    // AudioContext só pode nascer depois de um gesto do usuário.
    this.audio = new AudioContext();

    // música do operador: decodifica ANTES de armar o relógio (evita atraso)
    let musicBuffer: AudioBuffer | null = null;
    if (this.musicPromise) {
      const loading = this.text(WIDTH / 2, HEIGHT * 0.47, 'CARREGANDO…', 72, this.theme.colors.accent, true);
      try {
        const data = await this.musicPromise;
        if (data) musicBuffer = (await decodeToMono(this.audio, data)).buffer;
      } catch {
        musicBuffer = null;
      }
      loading.destroy();
    }

    this.uiPhase = 'playing';
    this.buildPauseButton();
    this.state.start();
    this.conductor.start(this.audio.currentTime * 1000);
    const zeroAtSec = this.conductor.zeroAtMs / 1000;
    const speed = this.theme.gameplay.speed;
    const beatMs = 60000 / this.effectiveBpm;
    const lastNote = this.state.beatmap.notes[this.state.beatmap.notes.length - 1];

    if (musicBuffer) {
      playMusic(this.audio, musicBuffer, zeroAtSec, speed, this.theme.audio.volume);
      // contagem de entrada audível (a música só começa no beat 0)
      scheduleTrack(this.audio, 'metronome', {
        bpm: this.effectiveBpm,
        fromBeat: -4,
        toBeat: -1,
        zeroAtSec,
        volume: this.theme.audio.volume * 0.8,
      });
    } else {
      // modo synth — ou fallback se a música sumiu do IndexedDB
      scheduleTrack(this.audio, this.theme.audio.track, {
        bpm: this.effectiveBpm,
        fromBeat: -4,
        toBeat: Math.ceil((lastNote?.timeMs ?? 0) / beatMs),
        zeroAtSec,
        volume: this.theme.audio.volume,
      });
    }
  }

  private showResults(): void {
    this.uiPhase = 'results';
    this.pauseBtn?.destroy();
    this.pauseBtn = null;
    this.stopAudio();
    this.countdownText.setText('');
    this.scoreText.setText('');
    this.comboText.setText('');
    this.accText.setText('');

    const r = this.state.results();
    const grade = gradeFor(r.accuracy, r.counts.miss);
    const t = this.theme.texts;
    const c = this.theme.colors;
    const gradeColor: Record<Grade, string> = {
      SS: c.accent,
      S: c.accent,
      A: c.great,
      B: c.good,
      C: c.approach,
      D: c.miss,
    };
    const acc = (r.accuracy * 100).toFixed(1).replace('.', ',');

    const gradeText = this.text(WIDTH / 2, HEIGHT * 0.3, grade, 320, gradeColor[grade], true);
    gradeText.setScale(2.2).setAlpha(0);
    this.tweens.add({ targets: gradeText, scale: 1, alpha: 1, duration: 450, ease: 'Back.Out' });

    this.overlay = [
      this.text(WIDTH / 2, HEIGHT * 0.15, t.resultsTitle, 64, c.textPrimary, true),
      gradeText,
      this.text(WIDTH / 2, HEIGHT * 0.45, `${r.score}`, 140, c.textPrimary, true),
      this.text(WIDTH / 2, HEIGHT * 0.53, `Precisão ${acc}%   ·   Combo máx ${r.maxCombo}`, 52, c.textPrimary),
      this.text(
        WIDTH / 2,
        HEIGHT * 0.59,
        `Perfeito ${r.counts.perfect}   Ótimo ${r.counts.great}   Bom ${r.counts.good}   Erro ${r.counts.miss}`,
        44,
        c.approach,
      ),
      (this.logo = this.buildCircleButton(WIDTH / 2, HEIGHT * 0.74, 180, t.playAgainCta, 56)),
      this.gearButton(),
    ];
  }

  // ---------------------------------------------------------------- input

  private onTap(ptr: Phaser.Input.Pointer): void {
    if (this.paused) return; // toques do menu de pausa não julgam notas
    if (this.uiPhase === 'attract') {
      void this.startSong();
      return;
    }
    if (this.uiPhase === 'results') {
      if (this.theme.lead.enabled) this.showLeadForm();
      else this.scene.restart();
      return;
    }
    // compensação de latência calibrada: toque atrasado é adiantado no julgamento
    const hit = this.state.tap(ptr.x / WIDTH, ptr.y / HEIGHT, this.songNowMs() - this.theme.gameplay.inputOffsetMs);
    if (hit) {
      this.resolveNoteVisual(hit.note.id);
      this.judgementPopup(hit);
      if (this.audio && this.theme.audio.hitSounds) {
        playHitSound(this.audio, hit.judgement, this.theme.audio.volume);
      }
    }
  }

  // ---------------------------------------------------------------- loop

  override update(_time: number, delta: number): void {
    if (this.paused) return;
    this.triangles.update(delta, this.beatPulse());

    if (this.logo && this.uiPhase !== 'playing') {
      // logo pulsa na batida — assinatura do menu do osu! clássico
      this.logo.setScale(1 + 0.05 * this.beatPulse());
    }

    if (this.uiPhase !== 'playing') return;
    const t = this.songNowMs();

    this.updateCountdown(t);

    for (const missed of this.state.tick(t)) {
      this.resolveNoteVisual(missed.note.id);
      this.judgementPopup(missed);
    }

    this.syncNoteVisuals(t);

    const r = this.state.results();
    this.scoreText.setText(`${r.score}`);
    this.accText.setText(`${(r.accuracy * 100).toFixed(1).replace('.', ',')}%`);
    this.comboText.setText(r.combo > 1 ? `${r.combo}x` : '');
    if (r.combo > this.lastCombo && r.combo > 1) {
      this.comboText.setScale(1.35);
      this.tweens.add({ targets: this.comboText, scale: 1, duration: 160, ease: 'Cubic.Out' });
    }
    this.lastCombo = r.combo;

    if (this.state.currentPhase === 'finished') this.showResults();
  }

  // ---------------------------------------------------------------- pausa

  private buildPauseButton(): void {
    this.pauseBtn = this.text(70, 90, '⏸', 64, this.theme.colors.textPrimary, true)
      .setInteractive({ useHandCursor: true });
    this.pauseBtn.on('pointerdown', () => this.togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());
  }

  private togglePause(): void {
    if (this.uiPhase !== 'playing') return;
    if (this.paused) this.resumePause();
    else this.enterPause();
  }

  private enterPause(): void {
    this.paused = true;
    // suspend() congela audio.currentTime -> música, notas e julgamento
    // param juntos e retomam em sincronia perfeita no resume().
    void this.audio?.suspend();
    this.tweens.pauseAll();
    const c = this.theme.colors;
    const bg = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.75).setOrigin(0).setDepth(40).setInteractive();
    const title = this.text(WIDTH / 2, HEIGHT * 0.32, 'PAUSADO', 110, c.textPrimary, true).setDepth(41);
    const resume = this.pauseButton(HEIGHT * 0.46, 'RETOMAR', c.accent, () => this.resumePause());
    const menu = this.pauseButton(HEIGHT * 0.56, 'MENU INICIAL', c.approach, () => this.scene.restart());
    this.pauseUi = [bg, title, resume, menu];
  }

  private pauseButton(y: number, label: string, bgColor: string, cb: () => void): Phaser.GameObjects.Text {
    const t = this.text(WIDTH / 2, y, label, 56, this.theme.colors.background, true)
      .setDepth(41)
      .setPadding(46, 22, 46, 22)
      .setInteractive({ useHandCursor: true });
    t.setBackgroundColor(bgColor);
    t.on('pointerdown', cb);
    return t;
  }

  private resumePause(): void {
    this.paused = false;
    void this.audio?.resume();
    this.tweens.resumeAll();
    for (const o of this.pauseUi) o.destroy();
    this.pauseUi = [];
  }

  private songNowMs(): number {
    return this.audio ? this.conductor.songTimeMs(this.audio.currentTime * 1000) : Number.NEGATIVE_INFINITY;
  }

  /** 1 no instante da batida, decaindo até a próxima (dirige logo/triângulos). */
  private beatPulse(): number {
    const beatMs = 60000 / this.effectiveBpm;
    const raw = this.uiPhase === 'playing' && this.audio ? this.songNowMs() - this.phaseOffsetMs : this.time.now;
    if (!Number.isFinite(raw)) return 0;
    const phase = (((raw % beatMs) + beatMs) % beatMs) / beatMs;
    return (1 - phase) ** 2;
  }

  private updateCountdown(songTimeMs: number): void {
    if (songTimeMs >= 0) {
      if (this.countdownText.text !== '') this.countdownText.setText('');
      return;
    }
    const beatMs = 60000 / this.effectiveBpm;
    const n = Math.ceil(-songTimeMs / beatMs);
    if (n > 4) return;
    if (n !== this.lastCountdown) {
      this.lastCountdown = n;
      this.countdownText.setText(`${n}`);
      this.countdownText.setScale(1.5).setAlpha(1);
      this.tweens.add({ targets: this.countdownText, scale: 1, duration: 220, ease: 'Cubic.Out' });
    }
  }

  // ---------------------------------------------------------------- notas

  private syncNoteVisuals(songTimeMs: number): void {
    for (const note of this.state.visibleNotes(songTimeMs)) {
      let vis = this.noteVisuals.get(note.id);
      if (!vis) {
        vis = this.createNoteVisual(note);
        this.noteVisuals.set(note.id, vis);
      }
      const progress = Phaser.Math.Clamp(
        (songTimeMs - (note.timeMs - this.state.config.approachMs)) / this.state.config.approachMs,
        0,
        1,
      );
      const scale = APPROACH_START_SCALE - (APPROACH_START_SCALE - 1) * progress;
      vis.ring.setScale(scale);
      vis.ring.setAlpha(0.35 + 0.65 * progress);
    }
  }

  private createNoteVisual(note: Note): { body: Phaser.GameObjects.Graphics; ring: Phaser.GameObjects.Graphics; note: Note } {
    const x = note.x * WIDTH;
    const y = note.y * HEIGHT;
    const c = this.theme.colors;

    const body = this.add.graphics({ x, y }).setDepth(2);
    body.fillStyle(colorToNum(c.note), 1);
    body.lineStyle(8, colorToNum(c.noteBorder), 1);
    drawShape(body, this.theme.noteShape, NOTE_RADIUS);

    const ring = this.add.graphics({ x, y }).setDepth(1);
    ring.lineStyle(6, colorToNum(c.approach), 1);
    drawShapeOutline(ring, this.theme.noteShape, NOTE_RADIUS + 12);

    this.tweens.add({ targets: body, scale: { from: 0.6, to: 1 }, duration: 150, ease: 'Back.Out' });
    return { body, ring, note };
  }

  private resolveNoteVisual(noteId: number): void {
    const vis = this.noteVisuals.get(noteId);
    if (!vis) return;
    this.noteVisuals.delete(noteId);
    vis.ring.destroy();
    this.tweens.add({
      targets: vis.body,
      scale: 1.4,
      alpha: 0,
      duration: 180,
      onComplete: () => vis.body.destroy(),
    });
  }

  private judgementPopup(hit: HitResult): void {
    const labels = { perfect: 'PERFEITO!', great: 'ÓTIMO!', good: 'BOM', miss: 'ERROU' } as const;
    const colors = {
      perfect: this.theme.colors.perfect,
      great: this.theme.colors.great,
      good: this.theme.colors.good,
      miss: this.theme.colors.miss,
    } as const;
    const txt = this.text(hit.note.x * WIDTH, hit.note.y * HEIGHT - NOTE_RADIUS, labels[hit.judgement], 58, colors[hit.judgement], true).setDepth(20);
    this.tweens.add({
      targets: txt,
      y: txt.y - 110,
      alpha: 0,
      duration: 650,
      ease: 'Cubic.Out',
      onComplete: () => txt.destroy(),
    });
  }

  // ---------------------------------------------------------------- lead

  private showLeadForm(): void {
    if (this.leadFormEl) return;
    const c = this.theme.colors;
    const r = this.state.results();
    const grade = gradeFor(r.accuracy, r.counts.miss);

    const inputCss = `font-size:30px;padding:22px 24px;border-radius:18px;border:1.5px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:${c.textPrimary};outline:none;width:100%;box-sizing:border-box;transition:border-color .15s;`;
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);z-index:10;font-family:Arial,sans-serif;';
    wrap.innerHTML = `
      <style>
        @keyframes sbLeadIn { from { transform: translateY(48px); opacity: 0; } to { transform: none; opacity: 1; } }
        [data-lead-card] input:focus { border-color: ${c.accent} !important; }
        [data-lead-card] input::placeholder { color: rgba(255,255,255,.35); }
        [data-lead-card] button[type=submit]:active { transform: scale(.97); }
      </style>
      <form data-lead-card style="background:linear-gradient(170deg, rgba(255,255,255,.08), rgba(255,255,255,.02)) ${c.background};border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 80px rgba(0,0,0,.6);border-radius:32px;padding:48px 44px;width:min(88vw,620px);display:flex;flex-direction:column;gap:18px;animation:sbLeadIn .35s cubic-bezier(.2,.9,.3,1.2);">
        <div style="width:64px;height:6px;border-radius:3px;background:${c.accent};margin:0 auto 6px;"></div>
        <h2 style="color:${c.textPrimary};margin:0 0 6px;text-align:center;font-size:36px;line-height:1.25;">${escapeHtml(this.theme.lead.headline)}</h2>
        <input name="name" placeholder="Nome *" autocomplete="off" style="${inputCss}">
        <input name="email" placeholder="E-mail *" autocomplete="off" inputmode="email" style="${inputCss}">
        <input name="phone" placeholder="Telefone (opcional)" autocomplete="off" inputmode="tel" style="${inputCss}">
        <div data-err style="color:${c.miss};font-size:25px;min-height:30px;text-align:center;"></div>
        <button type="submit" style="font-size:32px;font-weight:bold;letter-spacing:.06em;padding:24px;border-radius:20px;border:none;background:${c.accent};color:#000;cursor:pointer;box-shadow:0 10px 30px ${c.accent}44;transition:transform .1s;">ENVIAR</button>
        <button type="button" data-skip style="font-size:24px;padding:8px;border:none;background:none;color:rgba(255,255,255,.4);cursor:pointer;">agora não</button>
      </form>`;
    document.body.appendChild(wrap);
    this.leadFormEl = wrap;

    const form = wrap.querySelector('form') as HTMLFormElement;
    const err = wrap.querySelector('[data-err]') as HTMLElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const name = String(data.get('name') ?? '').trim();
      const email = String(data.get('email') ?? '').trim();
      const phone = String(data.get('phone') ?? '').trim();
      if (name.length < 2) {
        err.textContent = 'Informe seu nome.';
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        err.textContent = 'E-mail inválido.';
        return;
      }
      const store = new LeadStore(window.localStorage);
      store.save({
        name,
        email,
        phone,
        score: r.score,
        accuracy: r.accuracy,
        grade,
        themeName: this.theme.name,
        terminalId: terminalId(),
        timestamp: new Date().toISOString(),
      });
      // Android: espelha o CSV consolidado em disco (pasta acessivel por USB),
      // como no maze-game. Best-effort — no web/Electron e no-op.
      void mirrorLeadsCsvNative(CSV_BOM + leadsToCsv(store.all()));
      wrap.innerHTML = `
        <div style="text-align:center;font-family:Arial,sans-serif;">
          <div style="font-size:110px;line-height:1;">🎉</div>
          <div style="color:${c.accent};font-size:64px;font-weight:bold;margin-top:12px;">OBRIGADO!</div>
          <div style="color:${c.textPrimary};font-size:30px;opacity:.7;margin-top:10px;">Boa sorte no sorteio</div>
        </div>`;
      window.setTimeout(() => this.closeLeadFormAndRestart(), 1500);
    });
    (wrap.querySelector('[data-skip]') as HTMLElement).addEventListener('click', () => this.closeLeadFormAndRestart());
  }

  private closeLeadFormAndRestart(): void {
    this.destroyLeadForm();
    this.scene.restart();
  }

  private destroyLeadForm(): void {
    this.leadFormEl?.remove();
    this.leadFormEl = null;
  }

  // ---------------------------------------------------------------- helpers

  /** Botão circular estilo logo do osu!: disco + anel, pulsando na batida. */
  private buildCircleButton(x: number, y: number, radius: number, label: string, fontSize: number): Phaser.GameObjects.Container {
    const c = this.theme.colors;
    const gfx = this.add.graphics();
    gfx.fillStyle(colorToNum(c.note), 0.28);
    gfx.fillCircle(0, 0, radius);
    gfx.lineStyle(14, colorToNum(c.accent), 1);
    gfx.strokeCircle(0, 0, radius);
    gfx.lineStyle(3, colorToNum(c.noteBorder), 0.5);
    gfx.strokeCircle(0, 0, radius - 26);
    const txt = this.add
      .text(0, 0, label, {
        fontFamily: FONT,
        fontSize: `${fontSize}px`,
        fontStyle: 'bold',
        color: c.accent,
        align: 'center',
        wordWrap: { width: radius * 1.6 },
      })
      .setOrigin(0.5);
    return this.add.container(x, y, [gfx, txt]).setDepth(30);
  }

  private gearButton(): Phaser.GameObjects.Text {
    const gear = this.text(WIDTH - 90, HEIGHT - 70, '⚙', 64, this.theme.colors.approach).setDepth(40);
    gear.setInteractive({ useHandCursor: true });
    gear.on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        window.location.href = 'editor.html';
      },
    );
    return gear;
  }

  private text(x: number, y: number, content: string, size: number, color: string, bold = false): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, content, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: bold ? 'bold' : 'normal',
        color,
        align: 'center',
        wordWrap: { width: WIDTH * 0.9 },
      })
      .setOrigin(0.5)
      .setDepth(30);
  }

  private clearOverlay(): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
    this.logo = null;
  }

  private stopAudio(): void {
    void this.audio?.close().catch(() => undefined);
    this.audio = null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

// desenho das formas customizáveis ------------------------------------------

function shapePoints(shape: Exclude<NoteShape, 'circle'>, r: number): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  const push = (angleDeg: number, radius: number) => {
    const a = Phaser.Math.DegToRad(angleDeg - 90);
    pts.push(new Phaser.Math.Vector2(Math.cos(a) * radius, Math.sin(a) * radius));
  };
  switch (shape) {
    case 'square':
      for (const a of [45, 135, 225, 315]) push(a, r * 1.15);
      break;
    case 'diamond':
      for (const a of [0, 90, 180, 270]) push(a, r * 1.15);
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) push(i * 60, r * 1.05);
      break;
    case 'star':
      for (let i = 0; i < 10; i++) push(i * 36, i % 2 === 0 ? r * 1.25 : r * 0.55);
      break;
  }
  return pts;
}

function drawShape(gfx: Phaser.GameObjects.Graphics, shape: NoteShape, r: number): void {
  if (shape === 'circle') {
    gfx.fillCircle(0, 0, r);
    gfx.strokeCircle(0, 0, r);
    return;
  }
  const pts = shapePoints(shape, r);
  gfx.fillPoints(pts, true);
  gfx.strokePoints(pts, true, true);
}

function drawShapeOutline(gfx: Phaser.GameObjects.Graphics, shape: NoteShape, r: number): void {
  if (shape === 'circle') {
    gfx.strokeCircle(0, 0, r);
    return;
  }
  gfx.strokePoints(shapePoints(shape, r), true, true);
}
