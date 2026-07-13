/**
 * Análise automática de áudio — o "mapper automático".
 *
 * No osu!, quem faz o upload define manualmente os TimingPoints (offset em ms
 * + beatLength→BPM) e posiciona cada HitObject. Aqui, o pipeline detecta tudo
 * sozinho a partir das amostras do áudio:
 *
 *   samples → lowpass(150 Hz) → onsetEnvelope (fluxo de energia)
 *           → detectPeaks (batidas candidatas)
 *           → estimateBpm (histograma de intervalos, faixa 70–180)
 *           → estimateOffset (fase da grade com mais batidas)
 *
 * Tudo puro (Float32Array + sampleRate), sem Web Audio — testável em Node.
 * A conversão arquivo→samples (decodeAudioData) vive no render.
 */

export interface OnsetPeak {
  timeSec: number;
  strength: number;
}

export interface AudioAnalysis {
  /** batidas por minuto detectadas (70–180) */
  bpm: number;
  /** instante da primeira batida da grade, em ms do início do áudio */
  offsetMs: number;
  /** 0..1 — fração dos intervalos entre picos que concorda com o BPM */
  confidence: number;
  /** onsets detectados (matéria-prima das notas) */
  peaks: OnsetPeak[];
}

const BPM_MIN = 70;
const BPM_MAX = 180;

/** Passa-baixa biquad (Butterworth 2ª ordem) — isola bumbo/baixo, onde mora a batida. */
export function lowpass(samples: Float32Array, sampleRate: number, cutoffHz = 150): Float32Array {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / Math.SQRT2;
  const b0 = (1 - cosW0) / 2;
  const b1 = 1 - cosW0;
  const b2 = b0;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i] ?? 0;
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
  }
  return out;
}

export interface Envelope {
  /** fluxo de energia por frame (meia-onda retificado) */
  flux: Float32Array;
  /** segundos por frame */
  hopSec: number;
}

/** Envelope de onsets: RMS por janela de ~20 ms com passo de ~10 ms, derivada retificada. */
export function onsetEnvelope(samples: Float32Array, sampleRate: number, hopMs = 10): Envelope {
  const hop = Math.max(1, Math.round((sampleRate * hopMs) / 1000));
  const win = hop * 2;
  const frames = Math.max(0, Math.floor((samples.length - win) / hop));
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * hop;
    for (let i = start; i < start + win; i++) {
      const s = samples[i] ?? 0;
      sum += s * s;
    }
    rms[f] = Math.sqrt(sum / win);
  }
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    flux[f] = Math.max(0, (rms[f] ?? 0) - (rms[f - 1] ?? 0));
  }
  return { flux, hopSec: hop / sampleRate };
}

/** Picos do fluxo acima de média+1.5·desvio, com distância mínima (máximo local). */
export function detectPeaks(env: Envelope, minGapSec = 0.18): OnsetPeak[] {
  const { flux, hopSec } = env;
  const n = flux.length;
  if (n === 0) return [];
  let mean = 0;
  for (const v of flux) mean += v;
  mean /= n;
  let variance = 0;
  for (const v of flux) variance += (v - mean) ** 2;
  const threshold = mean + 1.5 * Math.sqrt(variance / n);

  const minGapFrames = Math.max(1, Math.round(minGapSec / hopSec));
  const peaks: OnsetPeak[] = [];
  for (let i = 1; i < n - 1; i++) {
    const v = flux[i] ?? 0;
    if (v <= 0 || v < threshold) continue;
    // máximo local ESTRITO à esquerda: sinal constante não vira pico
    if (!(v > (flux[i - 1] ?? 0) && v >= (flux[i + 1] ?? 0))) continue;
    const last = peaks[peaks.length - 1];
    if (last && i * hopSec - last.timeSec < minGapFrames * hopSec) {
      if (v > last.strength) {
        last.timeSec = i * hopSec;
        last.strength = v;
      }
      continue;
    }
    peaks.push({ timeSec: i * hopSec, strength: v });
  }
  return peaks;
}

/**
 * BPM por histograma de intervalos entre picos próximos (até 4 adiante),
 * dobrando/dividindo cada intervalo até a faixa 70–180 BPM e agrupando com
 * tolerância de 30 ms — o maior grupo vence.
 */
export function estimateBpm(peaks: readonly OnsetPeak[]): { bpm: number; confidence: number } {
  const minIvl = 60 / BPM_MAX;
  const maxIvl = 60 / BPM_MIN;
  const intervals: number[] = [];
  for (let i = 0; i < peaks.length; i++) {
    for (let j = i + 1; j <= i + 4 && j < peaks.length; j++) {
      let dt = (peaks[j]?.timeSec ?? 0) - (peaks[i]?.timeSec ?? 0);
      if (dt < 0.05 || dt > 4) continue;
      while (dt < minIvl) dt *= 2;
      while (dt > maxIvl) dt /= 2;
      intervals.push(dt);
    }
  }
  if (intervals.length === 0) return { bpm: 100, confidence: 0 };

  intervals.sort((a, b) => a - b);
  const tol = 0.03;
  let best = { start: 0, count: 0, sum: 0 };
  let start = 0;
  let sum = 0;
  for (let end = 0; end < intervals.length; end++) {
    sum += intervals[end] ?? 0;
    while ((intervals[end] ?? 0) - (intervals[start] ?? 0) > tol) {
      sum -= intervals[start] ?? 0;
      start++;
    }
    const count = end - start + 1;
    if (count > best.count) best = { start, count, sum };
  }
  const meanIvl = best.sum / best.count;
  let bpm = 60 / meanIvl;
  const rounded = Math.round(bpm);
  if (Math.abs(bpm - rounded) < 0.35) bpm = rounded; // BPM de estúdio costuma ser inteiro
  return { bpm: Math.round(bpm * 10) / 10, confidence: best.count / intervals.length };
}

/**
 * Offset: fase da grade (0..1 batida) onde caem mais picos, ponderada pela
 * força de cada um — equivalente automático ao offset do TimingPoint do osu!.
 */
export function estimateOffset(peaks: readonly OnsetPeak[], bpm: number): number {
  if (peaks.length === 0) return 0;
  const beat = 60 / bpm;
  const BINS = 32;
  const hist = new Float64Array(BINS);
  for (const p of peaks) {
    const phase = ((p.timeSec % beat) + beat) % beat;
    const bin = Math.floor((phase / beat) * BINS) % BINS;
    hist[bin] = (hist[bin] ?? 0) + p.strength;
  }
  let bestBin = 0;
  for (let b = 1; b < BINS; b++) {
    if ((hist[b] ?? 0) > (hist[bestBin] ?? 0)) bestBin = b;
  }
  // refina: média ponderada das fases dentro do bin vencedor (±1 vizinho)
  let wSum = 0;
  let pSum = 0;
  for (const p of peaks) {
    const phase = ((p.timeSec % beat) + beat) % beat;
    const bin = Math.floor((phase / beat) * BINS) % BINS;
    if (Math.min(Math.abs(bin - bestBin), BINS - Math.abs(bin - bestBin)) <= 1) {
      // desloca fases próximas de 0/beat para o mesmo lado do bin vencedor
      let ph = phase;
      const center = ((bestBin + 0.5) / BINS) * beat;
      if (ph - center > beat / 2) ph -= beat;
      if (center - ph > beat / 2) ph += beat;
      wSum += p.strength;
      pSum += ph * p.strength;
    }
  }
  const offsetSec = wSum > 0 ? ((pSum / wSum) % beat + beat) % beat : 0;
  return Math.round(offsetSec * 1000);
}

/** Pipeline completo. */
export function analyzeAudio(samples: Float32Array, sampleRate: number): AudioAnalysis {
  const filtered = lowpass(samples, sampleRate);
  const env = onsetEnvelope(filtered, sampleRate);
  const peaks = detectPeaks(env);
  const { bpm, confidence } = estimateBpm(peaks);
  const offsetMs = estimateOffset(peaks, bpm);
  return { bpm, offsetMs, confidence, peaks };
}
