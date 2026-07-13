# Sistema de Beatmap Automático — especificação completa

Como o osu! funciona e o que o nosso sistema faz de forma automática.

## 1. Referência: como o osu! faz

No osu! (clássico e lazer — o lazer usa o mesmo formato `.osu`, versão v128), quem
faz o upload da música **configura tudo manualmente**:

| Conceito osu! | Onde vive | Quem define |
|---|---|---|
| **TimingPoint** | `[TimingPoints]` → `time,beatLength,...` | O mapper ouve a música e define o **offset** (ms da primeira batida) e o **beatLength** (ms por batida → BPM) na mão |
| **HitObject** | `[HitObjects]` → `x,y,time,type,...` | O mapper posiciona cada círculo manualmente no editor, batida por batida |
| Velocidade (DT) | mod Double Time | Multiplica a taxa de reprodução do áudio em 1.5x e comprime os tempos |

## 2. O que o nosso sistema automatiza

O operador só escolhe o arquivo (MP3/OGG/WAV) no editor. O pipeline detecta
BPM, offset e gera as notas sozinho — o equivalente automático do trabalho do
mapper. Precisão validada por teste: BPM exato e offset com erro ≤ 40 ms num
click track sintético (na prática, música com batida marcada funciona melhor;
o editor mostra a **confiança** da detecção).

## 3. Módulos e funções

### `src/core/audio-analysis.ts` — análise (puro, testável em Node)

| Função | Assinatura | O que faz |
|---|---|---|
| `lowpass` | `(samples: Float32Array, sampleRate, cutoffHz=150) → Float32Array` | Filtro passa-baixa biquad (Butterworth 2ª ordem). Isola bumbo/baixo, onde mora a batida |
| `onsetEnvelope` | `(samples, sampleRate, hopMs=10) → {flux, hopSec}` | Envelope RMS por janela de ~20 ms a cada ~10 ms; derivada retificada (só subidas de energia = ataques) |
| `detectPeaks` | `(env, minGapSec=0.18) → OnsetPeak[]` | Picos do fluxo acima de média+1.5·desvio, máximo local estrito, distância mínima de 180 ms. Cada pico = `{timeSec, strength}` |
| `estimateBpm` | `(peaks) → {bpm, confidence}` | Intervalos entre picos próximos (até 4 adiante), cada um dobrado/dividido até a faixa **70–180 BPM**; clustering com tolerância de 30 ms; o maior cluster vence. BPM quase inteiro é arredondado (música de estúdio). `confidence` = fração dos intervalos que concorda |
| `estimateOffset` | `(peaks, bpm) → offsetMs` | Fase da grade: histograma circular (32 bins) de `tempo mod batida`, ponderado pela força; o bin mais denso, refinado pela média ponderada, é o offset — equivalente automático do TimingPoint |
| `analyzeAudio` | `(samples, sampleRate) → AudioAnalysis` | Pipeline completo: lowpass → envelope → picos → BPM → offset |

### `src/core/chart.ts` — geração do mapa

| Função/Tipo | Especificação |
|---|---|
| `Chart` | `{bpm, offsetMs, durationMs, notes: Note[]}` — nosso ".osu": um TimingPoint + HitObjects. `Note = {id, timeMs, x, y}` com x/y normalizados [0..1] e timeMs na linha do tempo **do áudio** |
| `generateChart(analysis, durationMs, opts)` | 1) quantiza cada onset para a **meia-batida** mais próxima da grade (bpm/offset); 2) mantém o mais forte por slot; 3) intervalo mínimo entre notas (`minGapBeats`, default 0.9 batida — legibilidade em totem); 4) teto de notas (`maxNotes`, default 200 — descarta os mais fracos); 5) sem notas antes de `minStartMs` (2 s) nem nos últimos 800 ms; 6) posições sorteadas por `placeNotes` |

### `src/core/beatmap.ts`

| Função | Especificação |
|---|---|
| `placeNotes(timesMs, rng, area?, minGap?)` | Posições aleatórias (rng injetado = determinístico) na área ergonômica x∈[0.15,0.85], y∈[0.35,0.80], com distância mínima de 0.12 entre consecutivas. Compartilhado entre o modo demo e o chart de música |

### `src/render/audio/music.ts` — ponte Web Audio

| Função | Especificação |
|---|---|
| `decodeToMono(ctx, arrayBuffer)` | `decodeAudioData` → `{buffer, samples (mono, média dos canais), sampleRate, durationMs}`. As `samples` alimentam o analisador |
| `playMusic(ctx, buffer, zeroAtSec, speed, volume)` | Agenda o `AudioBufferSourceNode` para começar exatamente no beat 0 do relógio-mestre (`zeroAtSec`), com `playbackRate = speed` — o **Double Time do osu!**: velocidade 1.5x toca a música 1.5x mais rápido (e mais aguda) |

### `src/data/music-db.ts` — armazenamento

`saveMusic/loadMusic/deleteMusic` no **IndexedDB** (db `sb-rhythm`, store `music`) —
áudio não cabe no localStorage. O **chart** (JSON pequeno) viaja dentro do tema
(`theme.audio.chart`), então exportar o theme.json leva o mapa junto — só o
áudio precisa ser importado de novo em outro aparelho.

## 4. Fluxo no jogo (GameScene)

1. `create()`: se `theme.audio.mode === 'music'` e há chart → beatmap = notas do
   chart com `timeMs / speed`; `effectiveBpm = chart.bpm × speed`; o blob começa
   a carregar do IndexedDB em paralelo.
2. Toque em iniciar → `startSong()`: decodifica o áudio, **então** arma o
   relógio (Conductor) — a decodificação nunca atrasa a sincronia.
3. Contagem 4-3-2-1 com ticks de metrônomo; a música entra exata no beat 0.
4. Pulso visual (logo/triângulos) alinhado pela fase `chart.offsetMs / speed`.
5. Se o áudio sumiu do IndexedDB → fallback automático para a trilha sintetizada
   (o chart continua valendo).

## 5. Latência (relacionado)

`theme.gameplay.inputOffsetMs` (−300..+300): compensação **por aparelho**, aplicada
só no julgamento do toque (`songTime − inputOffset`). Calibrável no editor
("Calibrar tocando"): 12 batidas a 90 BPM, mediana do desvio dos toques vira a
sugestão. Refazer em cada totem/celular — cada touchscreen tem atraso próprio.

## 6. Limites conhecidos

- Faixa de detecção 70–180 BPM (fora disso, dobra/divide — 60 BPM vira 120, ok na prática).
- Música sem batida clara (ambient, clássica, rubato) → confiança baixa; o editor
  avisa e recusa (<15%).
- BPM variável (música ao vivo) não é suportado — um TimingPoint só, como um mapa
  simples do osu!.
- Licença: música em evento corporativo exige ECAD/royalty-free — aviso no editor.

## 7. Fontes da pesquisa

- Formato .osu: https://osu.ppy.sh/wiki/en/Client/File_formats/osu_(file_format)
- Discussão formato lazer: https://github.com/ppy/osu/discussions/12976
- Técnica de detecção: http://joesul.li/van/beat-detection-using-web-audio/
- Lib de referência: https://github.com/chrisguttandin/web-audio-beat-detector
