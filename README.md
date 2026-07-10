# SB Rhythm

Jogo de ritmo (tap circles estilo osu!) para totem vertical 50" touch — eventos GSB.
Customizável pelo operador via `theme.json` (cores, textos, forma das notas, gameplay).

## Comandos

```bash
npm install        # primeira vez
npm run dev        # dev server (Vite)
npm test           # testes do core (Vitest)
npm run typecheck  # TypeScript estrito
npm run build      # produção (dist/)
```

## Editor de tema (operador)

`/editor.html` (ou botão ⚙ dentro do jogo): cores, textos, forma das notas,
**dificuldade/velocidade** (presets + slider 0.5x–2x), trilha de áudio
(batida/metrônomo/arcade), volume, hitsounds e captura de leads (com export CSV).
Prévia ao vivo; "Aplicar e voltar" persiste o tema no aparelho.

## Overrides de URL

- `?theme=<id>` — carrega `public/themes/<id>/theme.json` (default `gsb-default`;
  há um `cliente-exemplo` verde com notas em estrela, 1.25x, trilha arcade e lead ligado).
- `?preview=1` — modo prévia do editor (lê o rascunho do localStorage).
- `?terminal=<id>` — identifica o totem nos leads (default `totem-01`).

## Documentação

- [ARQUITETURA.md](ARQUITETURA.md) — pesquisa (osu!, Bemuse, Web Audio),
  decisões de stack e fronteiras do código.
- [TODO.md](TODO.md) — o que falta (músicas reais, Electron/Capacitor,
  calibração de latência, leaderboard...) e o que já foi feito.
