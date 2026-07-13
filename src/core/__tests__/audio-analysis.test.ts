import { describe, expect, it } from 'vitest';
import { analyzeAudio, detectPeaks, estimateBpm, estimateOffset, onsetEnvelope } from '../audio-analysis.js';

/**
 * Sintetiza uma "música" de teste: pulsos graves (80 Hz, 60 ms) num BPM e
 * offset conhecidos, sobre ruído fraco — o pipeline deve recuperar ambos.
 */
function clickTrack(bpm: number, offsetSec: number, durSec: number, sampleRate = 22050): Float32Array {
  const samples = new Float32Array(Math.floor(durSec * sampleRate));
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * 0.01;
  const beatSec = 60 / bpm;
  for (let t = offsetSec; t < durSec; t += beatSec) {
    const start = Math.floor(t * sampleRate);
    const len = Math.floor(0.06 * sampleRate);
    for (let i = 0; i < len && start + i < samples.length; i++) {
      const env = 1 - i / len;
      samples[start + i] = (samples[start + i] ?? 0) + Math.sin((2 * Math.PI * 80 * i) / sampleRate) * env;
    }
  }
  return samples;
}

describe('analyzeAudio (pipeline)', () => {
  it('recupera BPM e offset de um click track de 120 BPM', () => {
    const a = analyzeAudio(clickTrack(120, 0.25, 15), 22050);
    expect(a.bpm).toBeGreaterThan(118);
    expect(a.bpm).toBeLessThan(122);
    expect(Math.abs(a.offsetMs - 250)).toBeLessThanOrEqual(40);
    expect(a.confidence).toBeGreaterThan(0.5);
    expect(a.peaks.length).toBeGreaterThan(20);
  });

  it('recupera BPM de 90 (faixa lenta)', () => {
    const a = analyzeAudio(clickTrack(90, 0.1, 15), 22050);
    expect(a.bpm).toBeGreaterThan(88);
    expect(a.bpm).toBeLessThan(92);
  });

  it('BPM fora da faixa 70–180 é dobrado para dentro (60 → 120)', () => {
    const a = analyzeAudio(clickTrack(60, 0.2, 16), 22050);
    expect(a.bpm).toBeGreaterThan(118);
    expect(a.bpm).toBeLessThan(122);
  });

  it('silêncio não quebra (confiança 0)', () => {
    const a = analyzeAudio(new Float32Array(22050 * 3), 22050);
    expect(a.confidence).toBe(0);
    expect(a.peaks).toHaveLength(0);
  });
});

describe('funções isoladas', () => {
  it('onsetEnvelope produz frames na taxa esperada', () => {
    const env = onsetEnvelope(new Float32Array(22050), 22050, 10);
    expect(env.hopSec).toBeCloseTo(0.01, 3);
    expect(env.flux.length).toBeGreaterThan(90);
  });

  it('estimateBpm com picos perfeitos a 100 BPM', () => {
    const peaks = Array.from({ length: 30 }, (_, i) => ({ timeSec: i * 0.6, strength: 1 }));
    const { bpm, confidence } = estimateBpm(peaks);
    expect(bpm).toBe(100);
    // intervalos de 3 batidas dobram para fora do cluster → teto real ~0.75
    expect(confidence).toBeGreaterThan(0.7);
  });

  it('estimateOffset encontra a fase da grade', () => {
    const peaks = Array.from({ length: 30 }, (_, i) => ({ timeSec: 0.3 + i * 0.5, strength: 1 }));
    expect(Math.abs(estimateOffset(peaks, 120) - 300)).toBeLessThanOrEqual(20);
  });

  it('detectPeaks ignora ruído abaixo do limiar', () => {
    const flux = new Float32Array(1000).map(() => 0.01);
    flux[500] = 1;
    const peaks = detectPeaks({ flux, hopSec: 0.01 });
    expect(peaks).toHaveLength(1);
    expect(peaks[0]?.timeSec).toBeCloseTo(5, 1);
  });
});
