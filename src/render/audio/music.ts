/**
 * Ponte arquivo de música ↔ Web Audio.
 * - decodeToMono: arquivo → amostras mono (entrada do analisador do core)
 * - playMusic: agenda o AudioBuffer no relógio-mestre (zeroAtSec), com
 *   playbackRate = speed (efeito Double Time do osu!: mais rápido = mais agudo)
 */

export interface DecodedAudio {
  buffer: AudioBuffer;
  /** mono (média dos canais) para análise */
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
}

export async function decodeToMono(ctx: BaseAudioContext, data: ArrayBuffer): Promise<DecodedAudio> {
  const buffer = await ctx.decodeAudioData(data.slice(0));
  const samples = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const chan = buffer.getChannelData(ch);
    for (let i = 0; i < chan.length; i++) {
      (samples as Float32Array)[i] = (samples[i] ?? 0) + (chan[i] ?? 0) / buffer.numberOfChannels;
    }
  }
  return { buffer, samples, sampleRate: buffer.sampleRate, durationMs: buffer.duration * 1000 };
}

/**
 * Latência de saída do aparelho, em ms: o som que o jogador OUVE está este
 * tanto atrás de `audio.currentTime`. Serve de chute inicial para a
 * compensação de toque (o jogador reage ao que ouve, não ao relógio).
 * Nem todo navegador expõe `outputLatency` (fallback: baseLatency).
 */
export function outputLatencyMs(ctx: AudioContext): number {
  const out = typeof ctx.outputLatency === 'number' ? ctx.outputLatency : 0;
  const base = typeof ctx.baseLatency === 'number' ? ctx.baseLatency : 0;
  return Math.round((out + base) * 1000);
}

/** Inicia a música no instante zeroAtSec do relógio de áudio. Retorna o source (para stop). */
export function playMusic(
  ctx: AudioContext,
  buffer: AudioBuffer,
  zeroAtSec: number,
  speed: number,
  volume: number,
): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = speed;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(Math.max(zeroAtSec, ctx.currentTime));
  return source;
}
