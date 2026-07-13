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
npm run deploy       # publica dist/ no GitHub Pages (branch gh-pages)
```

## Editor de tema (operador)

`/editor.html` (ou botão ⚙ dentro do jogo):
- identidade/textos, cores, forma das notas;
- **dificuldade e velocidade** (presets Fácil→Expert + slider 0.5x–2x);
- **música própria**: escolha um MP3/OGG/WAV — BPM, offset e notas são detectados
  automaticamente (ver [BEATMAP-SISTEMA.md](BEATMAP-SISTEMA.md));
- **calibração de latência** por aparelho ("Calibrar tocando");
- captura de leads (desligada por padrão) com exportação CSV.

"Testar jogo" abre o rascunho; "Aplicar e voltar" persiste no aparelho.

## Overrides de URL

- `?theme=<id>` — carrega `public/themes/<id>/theme.json` (default `gsb-default`).
- `?preview=1` — abre com o rascunho do editor.
- `?terminal=<id>` — identifica o totem nos leads (default `totem-01`).

## Documentação

- [ARQUITETURA.md](ARQUITETURA.md) — pesquisa (osu!, Bemuse, Web Audio), decisões
  de stack e fronteiras do código.
- [BEATMAP-SISTEMA.md](BEATMAP-SISTEMA.md) — especificação do sistema de música
  real e beatmap automático (todas as funções).
- [TODO.md](TODO.md) — pendências (testes físicos Windows/Android, leaderboard...)
  e o que já foi feito.
