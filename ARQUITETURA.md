# SB Rhythm — Arquitetura e Pesquisa

Jogo de ritmo para **totem interativo vertical de 50" (1080×1920, touch)** em eventos
corporativos GSB. Requisito central: **customização pelo operador** (cores, textos e
formas) sem tocar em código — mesmo modelo dos outros jogos da casa (kiosk-maze,
matching game, roleta).

## 1. Pesquisa (jul/2026)

### osu! (lazer) — a referência de gameplay
- Stack: **C# + osu!framework** (engine própria da ppy), render OpenGL/Vulkan via
  Veldrid, cross-platform Windows/Linux/macOS/Android/iOS via .NET/Xamarin.
- Conclusão: a stack **não** serve para nós — engine proprietária, ecossistema C#
  inteiro, curva de aprendizado alta e nenhuma facilidade para tema editável por
  operador. O que importamos do osu! é o **design**:
  - **Círculos de toque + anel de aproximação** (approach circle): a nota aparece,
    um anel encolhe até o raio da nota, o acerto perfeito é quando o anel encosta.
    É o formato ideal para touch em pé (sem teclado, sem pistas fixas).
  - **Julgamento por janelas de tempo** simétricas (perfect/great/good/miss).
  - **Precisão ponderada** (perfect=1, great=2/3, good=1/3).

### Outros jogos estudados
- **Bemuse** (web, React+Redux+Pixi.js): prova que jogo de ritmo roda bem no
  browser; tem **calibração de latência de áudio** — recurso a considerar depois.
- **StepMania** (C++): modelo de pistas verticais com setas; exige teclado/dance pad,
  não serve para totem touch.
- **Friday Night Funkin'** (HaxeFlixel, open source): mesmo modelo de pistas; a lição
  útil é o formato de chart JSON simples.

### Sincronização de áudio (o problema nº 1 de jogo de ritmo web)
Técnica canônica ("A Tale of Two Clocks", web.dev):
- `setTimeout`/`requestAnimationFrame` **não** têm precisão para música.
- O **`AudioContext.currentTime` é o relógio-mestre**: sons são agendados com
  `osc.start(t)` no relógio de áudio (precisão de amostra), e o **visual é derivado
  do relógio de áudio**, nunca o contrário.
- No nosso código: `Conductor` converte o relógio de áudio em tempo-de-música;
  `GameScene.update()` lê `audio.currentTime` a cada frame; a trilha demo é
  sintetizada (osciladores agendados) — zero arquivo de áudio, zero copyright,
  sincronia perfeita por construção.

## 2. Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Stack | TypeScript + Phaser 3 + Vite | Mesma dos outros totens GSB; time já domina; tema/editor/Electron reaproveitáveis |
| Gameplay | Tap circles estilo osu! | Touch em pé, uma ou duas mãos, sem periférico |
| Relógio | `AudioContext.currentTime` | Única fonte de tempo confiável no browser |
| Resolução | 1080×1920 (portrait), `Scale.FIT` | Totem vertical 50" |
| Área de spawn | x∈[0.15,0.85], y∈[0.35,0.80] | Ergonomia: topo do totem fica a ~1,9 m do chão |
| Portabilidade | Electron (Windows) + Capacitor (Android) depois | Padrão validado no kiosk-maze; `vite base:'./'` já configurado |
| Música demo | Metrônomo sintetizado (Web Audio) | Sem licenciamento; trilhas reais entram como `AudioBufferSourceNode` no mesmo relógio |

## 3. Fronteiras (invioláveis)

```
src/core/    — puro, sem Phaser, sem DOM, sem relógio próprio. 100% testável.
  beatmap.ts     tipos + gerador demo determinístico (rng injetado)
  conductor.ts   relógio-mestre → tempo-de-música (lead-in)
  judgement.ts   janelas de tempo → julgamento
  scoring.ts     pontos, combo (bônus 1%/acerto, teto 2x), precisão ponderada
  game-state.ts  partida: visibleNotes / tap / tick(expira→miss) / results

src/render/  — Phaser 3. Converte pixels↔coordenadas normalizadas, desenha, toca.
  theme.ts             schema do tema + resolveTheme (JSON hostil → tema válido)
  audio/click-track.ts trilha sintetizada agendada no relógio de áudio
  scenes/GameScene.ts  attract → playing → results (uma cena, três fases, por ora)

public/themes/<id>/theme.json — dado puro do operador (cores/textos/forma/gameplay)
```

- `core/` **não importa** `render/`. Coordenadas do core são normalizadas [0..1];
  o raio de acerto usa unidades de altura com correção de aspecto no eixo x.
- O core **não tem relógio**: recebe `songTimeMs` de fora (testes usam números,
  o render usa o Conductor + AudioContext).
- Tema é **dado**: qualquer campo ausente/inválido cai no default — o jogo nunca
  quebra por JSON ruim.

## 4. Customização (estado atual)

**Editor visual em `/editor.html`** (ferramenta do operador, DOM puro, sem Phaser):
- Seções: identidade/textos, cores (10), forma da nota, **dificuldade e velocidade**
  (presets Fácil/Normal/Difícil/Expert + slider 0.5x–2x + tempo de aproximação),
  áudio (3 trilhas sintetizadas + volume + hitsounds), captura de leads
  (liga/desliga, chamada, contagem, exportar CSV, apagar).
- Prévia ao vivo: iframe `index.html?preview=1` lê o rascunho de
  `localStorage[sbRhythmThemeDraft]` (debounce ~450 ms).
- "Aplicar e voltar" grava `localStorage[sbRhythmActiveTheme]` — prioridade do
  loadTheme: `?preview=1` > `?theme=<id>` > aplicado > gsb-default.
- Import/export de `theme.json`; acesso pelo jogo via botão ⚙.

**Velocidade/dificuldade:** `gameplay.speed` (0.5–2) multiplica o BPM efetivo
(ritmo das notas e da trilha); `approachMs` menor = janela visual mais curta.
Só números de gameplay cruzam para o core.

**Design (inspirado nos menus do osu!):** logo circular central que pulsa na
batida (osu! clássico), fundo de triângulos flutuantes (osu!lazer "Triangles"),
contagem regressiva 4-3-2-1 no lead-in, nota-conceito SS–D no resultado,
hitsounds com pitch por julgamento, combo com pulso. Cores continuam 100% do tema.

**Leads:** formulário DOM pós-resultado (nome/e-mail/telefone, validação leve),
`lead.enabled` por tema; armazenamento localStorage + CSV RFC 4180 no editor;
`?terminal=<id>` marca o totem.

Pendências e próximos passos: ver **TODO.md** (músicas reais, Electron/Capacitor,
calibração de latência, leaderboard, reset por inatividade, etc.).

## 5. Fontes

- osu! lazer: https://github.com/ppy/osu · https://grokipedia.com/page/osulazer
- osu!framework .NET Standard: https://github.com/ppy/osu-framework/issues/1098
- Arquitetura osu! (DESOSA): https://delftswa.gitbooks.io/desosa2018/content/osu/chapter.html
- A Tale of Two Clocks (agendamento de áudio): https://web.dev/articles/audio-scheduling
- Web Audio best practices (MDN): https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- Bemuse: https://github.com/bemusic/bemuse
