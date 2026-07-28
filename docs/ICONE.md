# Ícone do app (build)

O ícone é a forma de "pulso" da marca, gerada por código — sem depender de
ferramentas externas de imagem.

## Regenerar

```bash
npm run icons
```

Isso roda `scripts/generate-icon.cjs` (Node puro: rasteriza a polilinha do pulso
por distância a segmentos, com anti-aliasing, e codifica o PNG pelo `zlib`) e
depois `@capacitor/assets` para gerar todas as densidades do Android.

## Saídas

| Arquivo | Uso |
|---|---|
| `assets/icon.png` (1024) | mestre para `@capacitor/assets` (Android) |
| `assets/splash.png` / `splash-dark.png` (2732) | telas de abertura Android |
| `build/icon.png` (1024) | `electron-builder` lê daqui p/ o `.exe` (Windows) |
| `android/app/src/main/res/mipmap-*/ic_launcher*.png` | ícones do launcher (gerados) |

A janela do Electron em dev (`npm run electron`) usa `build/icon.png`; o ícone
do `.exe` empacotado vem do `electron-builder` (mesmo arquivo).

## Mudar cor/forma

Edite as constantes no topo de `scripts/generate-icon.cjs`:
- `FG` (cor do pulso) e `BG` (fundo do tile);
- `PTS` (vértices do pulso, no espaço 1024) e `STROKE` (espessura).

Depois rode `npm run icons` de novo.

> Escolha de cor: o pulso é amarelo de destaque (`#ffd23f`) sobre fundo escuro
> (`#0f0f14`) — o ícone anexado é preto sobre transparente, mas um ícone
> transparente/preto some no launcher escuro; a versão em amarelo mantém a mesma
> forma e fica visível em qualquer aparelho. Para o preto original, troque `FG`
> por `#000000` e `BG` por uma cor clara.
