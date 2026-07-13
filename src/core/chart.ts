/**
 * Chart: o equivalente do nosso sistema ao arquivo .osu — um TimingPoint
 * único (bpm + offsetMs) + a lista de notas com tempo absoluto no áudio.
 * Gerado automaticamente a partir da análise (generateChart), guardado no
 * tema como JSON puro.
 */

import type { Note } from './beatmap.js';
import { placeNotes } from './beatmap.js';
import type { AudioAnalysis, OnsetPeak } from './audio-analysis.js';

export interface Chart {
  bpm: number;
  /** primeira batida da grade, ms do início do áudio (TimingPoint.time) */
  offsetMs: number;
  durationMs: number;
  /** notas com timeMs na linha do tempo DO ÁUDIO (não escalado por speed) */
  notes: Note[];
}

export interface ChartGenOptions {
  /** gerador [0,1) para as posições x/y */
  rng: () => number;
  /** não criar notas antes disso (intro respirar + anel de aproximação) */
  minStartMs?: number;
  /** margem sem notas no fim do áudio */
  endMarginMs?: number;
  /** intervalo mínimo entre notas, em frações de batida (1 = uma por batida) */
  minGapBeats?: number;
  /** teto de notas (as mais fortes vencem) */
  maxNotes?: number;
}

/**
 * Converte a análise em chart jogável:
 * 1. quantiza cada onset para a meia-batida mais próxima da grade (bpm/offset);
 * 2. mantém o onset mais forte de cada slot;
 * 3. aplica intervalo mínimo entre notas (legibilidade em totem);
 * 4. limita ao teto (descartando os mais fracos);
 * 5. sorteia posições com distância mínima entre consecutivas (placeNotes).
 */
export function generateChart(analysis: AudioAnalysis, durationMs: number, opts: ChartGenOptions): Chart {
  const minStartMs = opts.minStartMs ?? 2000;
  const endMarginMs = opts.endMarginMs ?? 800;
  const minGapBeats = opts.minGapBeats ?? 0.9;
  const maxNotes = opts.maxNotes ?? 200;

  const beatMs = 60000 / analysis.bpm;
  const slotMs = beatMs / 2;

  // 1-2: melhor onset por slot de meia-batida
  const bySlot = new Map<number, OnsetPeak>();
  for (const p of analysis.peaks) {
    const tMs = p.timeSec * 1000;
    if (tMs < minStartMs || tMs > durationMs - endMarginMs) continue;
    const slot = Math.round((tMs - analysis.offsetMs) / slotMs);
    const cur = bySlot.get(slot);
    if (!cur || p.strength > cur.strength) bySlot.set(slot, p);
  }

  let picked = [...bySlot.entries()]
    .map(([slot, peak]) => ({ timeMs: Math.round(analysis.offsetMs + slot * slotMs), strength: peak.strength }))
    .sort((a, b) => a.timeMs - b.timeMs);

  // 3: intervalo mínimo (mantém a mais forte quando duas brigam)
  const minGapMs = beatMs * minGapBeats - 1;
  const spaced: typeof picked = [];
  for (const n of picked) {
    const last = spaced[spaced.length - 1];
    if (!last || n.timeMs - last.timeMs >= minGapMs) {
      spaced.push(n);
    } else if (n.strength > last.strength) {
      spaced[spaced.length - 1] = n;
    }
  }
  picked = spaced;

  // 4: teto — descarta os mais fracos, preservando a ordem temporal
  if (picked.length > maxNotes) {
    picked = [...picked]
      .sort((a, b) => b.strength - a.strength)
      .slice(0, maxNotes)
      .sort((a, b) => a.timeMs - b.timeMs);
  }

  return {
    bpm: analysis.bpm,
    offsetMs: analysis.offsetMs,
    durationMs: Math.round(durationMs),
    notes: placeNotes(picked.map((n) => n.timeMs), opts.rng),
  };
}
