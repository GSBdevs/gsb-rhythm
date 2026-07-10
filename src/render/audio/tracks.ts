/**
 * Trilhas 100% sintetizadas via Web Audio (sem arquivo, sem copyright) e
 * sons de acerto (hitsounds, como no osu!). Tudo agendado no relógio do
 * AudioContext — a fonte da verdade de tempo do jogo.
 *
 * Estilos:
 *   metronome — tique de ensaio (triângulo 440/880 Hz, acento a cada 4)
 *   beat      — bateria: bumbo por batida, caixa em 2 e 4, chimbal nas colcheias
 *   arcade    — baixo quadrado em arpejo + bumbo, clima 8-bit
 *
 * Músicas reais (arquivos) entram depois como AudioBufferSourceNode iniciado
 * no mesmo zeroAtSec — ver TODO.md.
 */

import type { Judgement } from '../../core/judgement.js';
import type { TrackStyle } from '../theme.js';

export interface TrackOptions {
  bpm: number;
  /** primeira batida a soar (negativa = contagem de entrada) */
  fromBeat: number;
  /** última batida (inclusive) */
  toBeat: number;
  /** instante do beat 0 no relógio do AudioContext, em segundos */
  zeroAtSec: number;
  /** 0..1 */
  volume: number;
}

// ---------------------------------------------------------------- instrumentos

let noiseCache: AudioBuffer | null = null;

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseCache && noiseCache.sampleRate === ctx.sampleRate) return noiseCache;
  const len = Math.floor(ctx.sampleRate * 0.25);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseCache = buf;
  return buf;
}

function envGain(ctx: AudioContext, dest: AudioNode, t: number, peak: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  g.connect(dest);
  return g;
}

function kick(ctx: AudioContext, dest: AudioNode, t: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  osc.connect(envGain(ctx, dest, t, 1, 0.25));
  osc.start(t);
  osc.stop(t + 0.3);
}

function hihat(ctx: AudioContext, dest: AudioNode, t: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  src.connect(hp);
  hp.connect(envGain(ctx, dest, t, 0.25, 0.05));
  src.start(t);
  src.stop(t + 0.06);
}

function snare(ctx: AudioContext, dest: AudioNode, t: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  src.connect(bp);
  bp.connect(envGain(ctx, dest, t, 0.6, 0.15));
  src.start(t);
  src.stop(t + 0.18);
}

function tick(ctx: AudioContext, dest: AudioNode, t: number, accent: boolean): void {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = accent ? 880 : 440;
  osc.connect(envGain(ctx, dest, t, accent ? 0.9 : 0.5, 0.12));
  osc.start(t);
  osc.stop(t + 0.15);
}

function bass(ctx: AudioContext, dest: AudioNode, t: number, freq: number, dur: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  osc.connect(envGain(ctx, dest, t, 0.22, dur));
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------- trilhas

/** arpejo A2 → E3 → A3 → E3 (lá menor, neutro e enérgico) */
const ARCADE_PATTERN = [110, 164.81, 220, 164.81];

export function scheduleTrack(ctx: AudioContext, style: TrackStyle, opts: TrackOptions): void {
  const secPerBeat = 60 / opts.bpm;
  const master = ctx.createGain();
  master.gain.value = 0.6 * opts.volume;
  master.connect(ctx.destination);

  for (let beat = opts.fromBeat; beat <= opts.toBeat; beat++) {
    const t = opts.zeroAtSec + beat * secPerBeat;
    if (t < ctx.currentTime + 0.01) continue;
    const pos = ((beat % 4) + 4) % 4; // posição no compasso 4/4

    switch (style) {
      case 'metronome':
        tick(ctx, master, t, pos === 0);
        break;
      case 'beat':
        kick(ctx, master, t);
        if (pos === 1 || pos === 3) snare(ctx, master, t);
        hihat(ctx, master, t);
        hihat(ctx, master, t + secPerBeat / 2);
        break;
      case 'arcade': {
        kick(ctx, master, t);
        const freq = ARCADE_PATTERN[pos] ?? 110;
        bass(ctx, master, t, freq, secPerBeat * 0.4);
        bass(ctx, master, t + secPerBeat / 2, freq * 2, secPerBeat * 0.2);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- hitsounds

const HIT_FREQ: Record<Exclude<Judgement, 'miss'>, number> = {
  perfect: 1318.5, // E6
  great: 1046.5, // C6
  good: 784, // G5
};

/** Blip imediato ao acertar uma nota — feedback tátil sonoro, como no osu!. */
export function playHitSound(ctx: AudioContext, judgement: Judgement, volume: number): void {
  if (judgement === 'miss') return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = HIT_FREQ[judgement];
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.45 * volume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.1);
}
