# SB Rhythm

Jogo de ritmo (tap circles estilo osu!) para totem vertical 50" touch — eventos GSB.
Totalmente customizável pelo operador: cores, textos, forma das notas, dificuldade/
velocidade, música própria (com beatmap automático) e captura de leads.

## Comandos

```bash
npm install          # primeira vez
npm run dev          # dev server (Vite) — jogo em / e editor em /editor.html
npm test             # 43 testes do core (Vitest)
npm run typecheck    # TypeScript estrito
npm run build        # produção (dist/)

npm run electron     # build + abre no Electron (Windows)
npm run dist         # gera release/win-unpacked + .zip (electron-builder)
npm run android:sync # build + sincroniza no projeto android/ (Capacitor)
npm run android:open # abre no Android Studio (exige SDK)
npm run android:apk  # gera o APK direto (Gradle assembleDebug, acha o JDK sozinho)
npm run deploy       # publica dist/ no GitHub Pages (branch gh-pages)
```

Build Android: o primeiro build baixa o Gradle e as dependências (demora); os
seguintes reutilizam os caches (`org.gradle.caching`/`parallel` ligados em
`android/gradle.properties`). O APK sai assinado com a keystore de debug em
`android/app/build/outputs/apk/debug/app-debug.apk` — instala direto no
aparelho (o `release` do template Capacitor não tem assinatura configurada).
Electron: `npm run dist` gera `release/win-unpacked/` + `.zip`, sem assinatura
de código (alvo `dir`+`zip` dispensa o winCodeSign).

## Editor de tema (operador)

`/editor.html` (ou botão ⚙ dentro do jogo):
- identidade/textos, cores, forma das notas;
- **dificuldade e velocidade** (presets Fácil→Expert + slider 0.5x–2x): a
  dificuldade também enriquece o ritmo (colcheias, acordes/multi-toque, holds e
  slides — holds que se movem, no ritmo e sorteadas pela seed);
- **seeds**: gerar seed aleatória e salvar/reusar seeds na própria tela;
- **imagens**: ícone/logo na tela inicial + papel de parede durante o jogo;
- **música própria**: escolha um MP3/OGG/WAV — BPM, offset e notas são detectados
  automaticamente (ver [BEATMAP-SISTEMA.md](BEATMAP-SISTEMA.md));
- **calibração de latência** por aparelho ("Calibrar tocando");
- captura de leads (desligada por padrão) com exportação CSV.

O ícone do app (APK/Electron) é gerado por código — `npm run icons`, ver
[docs/ICONE.md](docs/ICONE.md).

"Testar jogo" abre o rascunho; "Aplicar e voltar" persiste no aparelho
(localStorage + backup em disco no Android — sobrevive a reaberturas).
"Exportar tema"/CSV: download no web/Electron; no Android abre a folha nativa
de compartilhamento (e-mail/Drive/WhatsApp). No Android o CSV consolidado
também é espelhado em `/Android/data/com.gsb.sbrhythm/files/leads/leads.csv`
(acessível por USB).

## Overrides de URL

- `?theme=<id>` — carrega `public/themes/<id>/theme.json` (default `gsb-default`).
- `?preview=1` — abre com o rascunho do editor.
- `?terminal=<id>` — identifica o totem nos leads (default `totem-01`).
- `?idle=<ms>` — tempo de inatividade p/ voltar à tela inicial (default 45000; 0 desliga).
- `?fullscreen=1` — entra em tela cheia no primeiro toque (kiosk web/PWA).
- `?fps=1` — mostra o FPS no canto (diagnóstico de performance no totem).

## Documentação

- [ARQUITETURA.md](ARQUITETURA.md) — pesquisa (osu!, Bemuse, Web Audio), decisões
  de stack e fronteiras do código.
- [BEATMAP-SISTEMA.md](BEATMAP-SISTEMA.md) — especificação do sistema de música
  real e beatmap automático (todas as funções).
- [TODO.md](TODO.md) — pendências (testes físicos Windows/Android, leaderboard...)
  e o que já foi feito.
