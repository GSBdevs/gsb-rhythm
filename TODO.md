# TODO — o que falta e por quê

Atualizado em 2026-07-16. Itens em ordem de prioridade sugerida.

## 0. Performance e latência (feito na sessão 4) — ver seção "Feito"
Se ainda houver engasgo no totem, checar nesta ordem: (a) abrir com `?fps=1` e
observar — se cair de 60 com poucas notas, é GPU/driver do totem (atualizar
driver, garantir aceleração de hardware do WebView/Electron); (b) `?fps=1` estável
mas a MÚSICA/toque atrasam → recalibrar a compensação no editor; (c) travadas só
em música → arquivo muito longo/pesado, testar faixa menor.

## 1. Testes físicos de portabilidade (código pronto, falta o aparelho)
- **Windows:** `npm run electron` (janela) e `npm run dist` (gera `release/win-unpacked/`
  + zip). Nunca aberto numa máquina com display neste ambiente.
- **Android:** `npm run android:sync && npm run android:open` (exige Android Studio/SDK).
  Scaffold criado, APK nunca compilado. Verificar: IndexedDB (música) e localStorage
  (tema/leads) persistem no WebView; latência de toque → calibrar no aparelho.
- Lockdown de kiosk (fullscreen travado, bloquear atalhos/screen pinning) — decidir
  grau de trava por evento; hoje a janela é fullscreen simples (ESC sai).

## 2. Música no totem — melhorias
- Áudio vive no IndexedDB e o chart no tema; exportar theme.json NÃO leva o áudio.
  Para replicar em N totens: importar o arquivo de música em cada um (ou implementar
  export .zip tema+áudio).
- Múltiplas faixas + seletor na tela inicial (hoje: uma música por tema).
- Ajuste manual de BPM/offset pós-análise (para faixas difíceis) — o editor já
  mostra a confiança; adicionar campos editáveis é simples.
- LICENÇA: música em evento corporativo exige ECAD ou royalty-free (aviso já
  está no editor).

## 3. Leads — o que ainda falta
- Campos configuráveis pelo editor (hoje fixo: nome/e-mail/telefone), como o
  `leadForm.fields` do kiosk-maze. (obrigatório + consentimento LGPD já foram feitos)
- No totem/Electron: gravar leads em disco também no Windows via `window.kiosk`
  (no Android já espelha o CSV; no web/Electron saem pelo CSV do editor).

## 4. Música — o que ainda falta
- Ajuste manual de BPM/offset pós-análise (precisa guardar os `peaks` da análise
  para re-quantizar; hoje o mapa é gerado uma vez no upload).
- Múltiplas faixas + seletor de música na tela inicial (hoje uma por tema).
- Export .zip com tema + áudio (hoje o theme.json leva só o chart, não o áudio).

## 5. Leaderboard — DISPENSADO pelo user (não fazer por enquanto).

## 6. Polimento de gameplay — o que ainda falta
- Padrões ricos também no modo MÚSICA (hoje o chart da análise é só tap; os
  padrões ricos — colcheias/acordes — valem no modo sintetizado).
- (feito e MANTIDO: multi-toque/acordes, colcheias por dificuldade, partículas,
  anel de impacto, screen shake.)
- REMOVIDO A PEDIDO DO USER (atrapalhavam iniciantes): hold notes E slides
  (retas, curvas bézier e curvas "S"). O jogo voltou a ser só tap notes. Não
  refazer sem pedido explícito.

## 7. Operação em evento — o que ainda falta
- Modo atração: demo automática (auto-play fantasma) após N segundos na tela inicial.
  (o reset por inatividade em todas as telas já foi feito)

## Feito (não refazer)
- **[REMOVIDO na sessão 11 a pedido do user] Slide notes (sessão 8)**: hold que se MOVE — `Note.endX/endY` (destino);
  helpers `isSlide`/`noteEnd`. Gerador: fração dos holds (slideChance 0.6·richness)
  vira slide com destino sorteado pela SEED (`pickReachable`, dist 0.18–0.42,
  dentro da área), duração em batidas (movimento beat-sincronizado). Core reusa
  a lógica de hold (julga por TEMPO), zero mudança de julgamento. Render: trilha
  (faixa início→destino + marca do destino) + bolinha/anel que viajam ao longo
  da duração; feedback do fim sai no destino (`feedbackPos`). +2 testes. Só modo
  sintetizado. Electron: removido o modo tela cheia (janela normal 540×960).
- **Mecânicas de gameplay (sessão 7; HOLD NOTES REMOVIDAS na sessão 11 — só ficaram multi-toque e padrões ricos)**: HOLD NOTES (segure no lugar) — `Note.kind`
  'tap'|'hold' + `durationMs`; core: `tap` → hold-start, `releaseHold` (soltar
  cedo = miss/quebra combo; segurar até a cauda = perfect), `tick` auto-conclui;
  render: anel que encolhe + marca interna, `heldByPointer` mapeia dedo→hold,
  `onRelease`. MULTI-TOQUE — `input.addPointer(2)`, acordes (2 notas no mesmo
  instante) no gerador; cada dedo julga a nota mais próxima. PADRÕES RICOS —
  `generateDemoBeatmap({richness})` (0..1, derivado da dificuldade/speed):
  colcheias, acordes e holds; richness=0 = clássico (1/batida), sem rng extra.
  16 testes de core (holds/acordes/richness). Só no modo sintetizado.
- **Seeds no editor (sessão 7)**: botão "🎲 Gerar aleatória" (auto-salva) +
  lista de chips de seeds salvas (localStorage `sbRhythmSavedSeeds`, máx 30,
  clicar reusa, × remove, destaque na seed ativa).
- **Polimento de gameplay (sessão 6)**: partículas no acerto (`hitBurst`, textura
  `sb_particle` gerada em runtime, cor por julgamento, blend ADD, 22/16/10
  partículas p/ perfect/great/good, miss não emite) + anel de impacto que expande
  e some (perfect/great) + tremor sutil da câmera nos marcos de combo (25/50/…,
  `cameras.main.shake`). Só render — não toca no core/timing.
- **Imagens customizáveis (sessão 5)**: `theme.images.startIcon` (ícone/logo na
  tela inicial, PNG com transparência) e `theme.images.wallpaper` (papel de parede
  do jogo, cobre a tela + véu sutil p/ legibilidade). Upload+resize no editor
  (card "Imagens": ícone→PNG 512, parede→JPEG 1440 q0.82), data-URI no tema (viaja
  no export). GameScene carrega via loader (chaves fixas), ícone só na attract
  (some ao começar), parede fica durante a partida. pickImage valida data:/blob:/http.
- **Ícone de build (sessão 5)**: forma de "pulso" da marca gerada por
  `scripts/generate-icon.cjs` (Node puro: rasteriza a polilinha por distância +
  codifica PNG via zlib — pulso amarelo #ffd23f sobre fundo #0f0f14). Saídas:
  `assets/icon.png` + `assets/splash*.png` (mestre @capacitor/assets) e
  `build/icon.png` (electron-builder). `npm run icons` regenera tudo (100 assets
  Android + Electron). Janela Electron (dev) usa build/icon.png.
- **Performance (sessão 4)**: HUD com cache de texto — só chama `setText` quando o
  valor muda (antes eram 3 uploads de textura/frame = engasgo no totem; medido
  ~87µs/chamada no desktop, muito pior em GPU fraca). Config do Phaser tunada:
  `powerPreference:'high-performance'`, `roundPixels`, `desynchronized`, teto de
  60fps (`fps.target/min`). Overlay de FPS via `?fps=1` para diagnosticar no totem.
- **Latência (sessão 4)**: `AudioContext({latencyHint:'interactive'})` reduz a
  latência de saída audível; auto-latência (`outputLatencyMs`) usada como fallback
  na calibração quando faltam toques; decode da música em `OfflineAudioContext`.
- **Reset por inatividade (sessão 4)**: `InactivityMonitor` (listeners de janela,
  enxerga toque no canvas E no form de lead); volta à tela inicial de qualquer
  tela após 45s (`?idle=<ms>`, 0 desliga) — inclusive pausado ou no resultado.
- **Fullscreen (sessão 4)**: `?fullscreen=1` entra em tela cheia no 1º toque.
- **Leads obrigatório + LGPD (sessão 4)**: `lead.required` (esconde "agora não")
  e `lead.consentText` (checkbox que bloqueia o envio; vazio = sem checkbox).
- Core puro testado: beatmap/conductor/judgement/scoring/game-state/grade +
  **audio-analysis** (BPM/offset automáticos) + **chart** (quantização) — 44 testes.
- **Músicas reais**: upload no editor → análise automática (BPM/offset/notas) →
  IndexedDB + chart no tema → toca sincronizada no relógio de áudio com
  playbackRate = speed (Double Time). Espec completa em BEATMAP-SISTEMA.md.
- **Calibração de latência**: `gameplay.inputOffsetMs` aplicado no julgamento +
  assistente "Calibrar tocando" no editor (12 batidas, mediana).
- **Precisão ao vivo no HUD** (canto superior direito, estilo osu!).
- Design osu!-like: logo pulsante, triângulos lazer, contagem, nota SS–D,
  hitsounds, combo com pulso, botão de pausa (audio.suspend congela tudo junto).
- **Editor redesenhado** (v2, sem prévia embutida; base de design p/ outros apps):
  cards com ícones, switches, segmented controls, presets de dificuldade,
  velocidade 0.5x–2x, música, calibração, leads. "Testar jogo" abre ?preview=1.
- **Lead form v2** (glassmorphism, animação, "agora não") — desligado por padrão.
- **Electron** (shell/main.cjs, porta fixa 39219) + **Capacitor** (android/ scaffold).
- **GitHub + Pages**: repo GSBdevs/gsb-rhythm, deploy via `npm run deploy`.
- Core puro testado: beatmap/conductor/judgement/scoring/game-state/grade +
  **audio-analysis** (BPM/offset automáticos) + **chart** (quantização) — 43 testes.
- **Músicas reais**: upload no editor → análise automática (BPM/offset/notas) →
  IndexedDB + chart no tema → toca sincronizada no relógio de áudio com
  playbackRate = speed (Double Time). Espec completa em BEATMAP-SISTEMA.md.
- **Calibração de latência**: `gameplay.inputOffsetMs` aplicado no julgamento +
  assistente "Calibrar tocando" no editor (12 batidas, mediana).
- **Precisão ao vivo no HUD** (canto superior direito, estilo osu!).
- Design osu!-like: logo pulsante, triângulos lazer, contagem, nota SS–D,
  hitsounds, combo com pulso.
- **Editor redesenhado** (v2, sem prévia embutida; base de design p/ outros apps):
  cards com ícones, switches, segmented controls, presets de dificuldade,
  velocidade 0.5x–2x, música, calibração, leads. "Testar jogo" abre ?preview=1.
- **Lead form v2** (glassmorphism, animação, "agora não") — desligado por padrão.
- **Electron** (shell/main.cjs, porta fixa 39219) + **Capacitor** (android/ scaffold).
- **GitHub + Pages**: repo Paszmani/sb-rhythm-game, deploy via `npm run deploy`.
