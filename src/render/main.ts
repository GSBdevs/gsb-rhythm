import Phaser from 'phaser';
import { GameScene, HEIGHT, WIDTH } from './scenes/GameScene.js';
import { loadTheme } from './theme.js';

async function boot(): Promise<void> {
  const theme = await loadTheme();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: theme.colors.background,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // Performance no totem (mini-PC/box Android fraco):
    // - high-performance escolhe a GPU dedicada quando existe;
    // - roundPixels evita reamostragem de subpixel a cada frame;
    // - powerPreference/failIfMajorPerformanceCaveat mantêm WebGL, não Canvas.
    render: {
      powerPreference: 'high-performance',
      antialias: true,
      roundPixels: true,
      failIfMajorPerformanceCaveat: false,
      desynchronized: true,
    },
    // teto de 60fps: sem isso o Phaser tenta seguir o rAF do monitor (144Hz+)
    // e gasta CPU à toa; min:30 evita "espiral da morte" quando engasga.
    fps: { target: 60, min: 30, forceSetTimeOut: false },
    disableContextMenu: true,
    scene: [GameScene],
  });
  // tema via registry ANTES do init da cena (padrão validado no kiosk-maze;
  // passar por scene.add(data) deixava a cena sem renderizar).
  game.registry.set('theme', theme);

  // hook DEV-only para dirigir o jogo em testes automatizados (some no build)
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>)['__rhythmGame'] = game;
  }
}

void boot();
