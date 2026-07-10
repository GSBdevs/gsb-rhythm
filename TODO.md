# TODO — o que falta e por quê

Atualizado em 2026-07-10. Itens em ordem de prioridade sugerida.

## 1. Músicas reais (arquivos de áudio) + beatmaps por faixa
Hoje as 3 trilhas são sintetizadas (metrônomo/batida/arcade) — proposital: zero
copyright e sincronia perfeita. Para músicas reais:
- Carregar MP3/OGG com `decodeAudioData` → `AudioBufferSourceNode.start(zeroAtSec)`
  no MESMO relógio do Conductor (nada mais muda).
- Beatmap deixa de ser gerado e vira arquivo `chart.json` por faixa
  (`{bpm, offsetMs, notes:[{timeMs,x,y}]}`) + seletor de música na tela inicial.
- Upload da música pelo editor (cuidado: arquivo grande não cabe em localStorage —
  no totem vai para disco via bridge kiosk; na web, IndexedDB).
- ATENÇÃO LICENÇA: música em evento corporativo exige licenciamento (ECAD) ou
  faixas royalty-free — decisão de negócio antes de implementar.

## 2. Casca Electron (Windows) + Capacitor (Android)
Espelhar o kiosk-maze/roleta (padrões já validados nos outros projetos):
- `shell/main.cjs` + preload com `window.kiosk` (loadTheme/saveTheme/saveLead do disco).
- **Porta HTTP fixa** (gotcha resolvido na roleta/matching: porta efêmera muda o
  origin e zera o localStorage a cada abertura). Sugestão: 39219.
- `electron-builder` target `dir`+`zip` com `signAndEditExecutable:false`
  (winCodeSign falha sem privilégio de symlink).
- Android: Capacitor + `@capacitor/filesystem`, mesma KioskBridge.
- Lockdown de kiosk (fullscreen, bloquear atalhos) — decidir grau de trava.

## 3. Calibração de latência (padrão Bemuse)
Touchscreens de totem têm latência de toque variável (30–100 ms). Adicionar:
- `theme.gameplay.inputOffsetMs` (deslocamento aplicado ao julgar o toque).
- Tela de calibração no editor: usuário toca 8 batidas do metrônomo, mediana do
  desvio vira o offset sugerido.

## 4. Leads — melhorias
- Campos configuráveis pelo editor (hoje fixo: nome/e-mail/telefone), como o
  `leadForm.fields` do kiosk-maze.
- Opção de formulário OBRIGATÓRIO (hoje tem "pular") — decisão de negócio por evento.
- LGPD: consentimento presencial (padrão dos outros totens GSB); avaliar checkbox.
- No totem: gravar em disco (CSV ao lado do .exe) via bridge — item 2.

## 5. Leaderboard / ranking local
Top 10 por pontuação (nome do lead), tela acessível da attract — reusar o
desenho do kiosk-maze (`data/leaderboard.ts` de lá é injetável e testado).

## 6. Polimento de gameplay
- Padrões rítmicos mais ricos no gerador (colcheias, pausas, rajadas) por dificuldade.
- Sliders/hold notes (arrastar segurando) — segunda mecânica do osu!.
- Multi-toque real (duas notas simultâneas para duas mãos — o core já aceita,
  o gerador é que nunca sobrepõe janelas).
- Efeito de partículas no acerto perfeito; screen shake sutil em combo alto.
- Vinheta/attract loop com demonstração automática (auto-play fantasma).

## 7. Operação em evento
- Reset por inatividade em TODAS as telas (hoje o jogo não volta sozinho ao
  attract se abandonado no meio da partida — só termina quando as notas acabam).
- Modo atração: após N segundos parado na tela inicial, rodar demo automática.
- `?fullscreen=1` → requestFullscreen no primeiro toque (web/PWA).

## Feito (não refazer)
- Core puro testado (beatmap/conductor/judgement/scoring/game-state/grade).
- Design osu!-like: logo circular pulsante, triângulos lazer, contagem 4-3-2-1,
  nota-conceito SS–D, hitsounds, combo com pulso.
- Editor completo com prévia ao vivo, presets de dificuldade + velocidade
  (0.5x–2x), 3 trilhas sintetizadas, volume, cores/textos/formas, import/export,
  aplicar (localStorage), leads (contagem/CSV/apagar).
- Fluxo de lead pós-resultado (opcional por tema).
