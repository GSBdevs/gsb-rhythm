# TODO — o que falta e por quê

Atualizado em 2026-07-13. Itens em ordem de prioridade sugerida.

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

## 3. Leads — melhorias
- Campos configuráveis pelo editor (hoje fixo: nome/e-mail/telefone), como o
  `leadForm.fields` do kiosk-maze.
- Opção de formulário OBRIGATÓRIO (hoje tem "agora não") — decisão por evento.
- LGPD: consentimento presencial (padrão dos outros totens GSB); avaliar checkbox.
- No totem: gravar leads em disco (CSV ao lado do .exe) via bridge `window.kiosk`
  — hoje ficam no localStorage e saem pelo CSV do editor.

## 4. Leaderboard / ranking local
Top 10 por pontuação (nome do lead), tela acessível da attract — reusar o
desenho do kiosk-maze (`data/leaderboard.ts` de lá é injetável e testado).

## 5. Polimento de gameplay
- Padrões rítmicos mais ricos por dificuldade (colcheias/rajadas no chart).
- Sliders/hold notes (arrastar segurando) — segunda mecânica do osu!.
- Multi-toque real (duas notas simultâneas para duas mãos).
- Partículas no acerto perfeito; screen shake sutil em combo alto.

## 6. Operação em evento
- Reset por inatividade em TODAS as telas (hoje o jogo não volta sozinho ao
  attract se abandonado no meio da partida — só termina quando as notas acabam).
- Modo atração: demo automática após N segundos parado.
- `?fullscreen=1` → requestFullscreen no primeiro toque (web/PWA).
- Auto-latência: usar `AudioContext.outputLatency` como valor inicial da calibração.

## Feito (não refazer)
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
