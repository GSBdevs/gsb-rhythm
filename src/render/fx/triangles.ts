/**
 * Campo de triângulos flutuantes — assinatura visual do osu!lazer (tema
 * "Triangles"): triângulos sobem lentamente pelo fundo e pulsam na batida.
 */

import Phaser from 'phaser';

interface Tri {
  gfx: Phaser.GameObjects.Graphics;
  speed: number;
  size: number;
  drift: number;
  baseAlpha: number;
}

export interface TriangleFieldOptions {
  /** cores (números Phaser) sorteadas por triângulo */
  colors: number[];
  count: number;
  width: number;
  height: number;
  depth: number;
  /** alpha máximo (o campo é sutil de propósito) */
  maxAlpha: number;
}

export class TriangleField {
  private readonly tris: Tri[] = [];
  private readonly opts: TriangleFieldOptions;

  constructor(scene: Phaser.Scene, opts: TriangleFieldOptions) {
    this.opts = opts;
    for (let i = 0; i < opts.count; i++) {
      const size = Phaser.Math.Between(40, 170);
      const color = opts.colors[i % opts.colors.length] ?? 0xffffff;
      const gfx = scene.add.graphics({
        x: Phaser.Math.Between(0, opts.width),
        y: Phaser.Math.Between(0, opts.height),
      });
      gfx.fillStyle(color, 1);
      gfx.fillTriangle(-size, size * 0.85, size, size * 0.85, 0, -size);
      gfx.setDepth(opts.depth);
      const baseAlpha = Phaser.Math.FloatBetween(0.04, opts.maxAlpha);
      gfx.setAlpha(baseAlpha);
      this.tris.push({
        gfx,
        size,
        speed: Phaser.Math.FloatBetween(18, 60) * (size / 100), // maiores sobem mais rápido (paralaxe)
        drift: Phaser.Math.FloatBetween(-8, 8),
        baseAlpha,
      });
    }
  }

  /** pulse ∈ [0,1]: 1 no instante da batida, decaindo até a próxima. */
  update(deltaMs: number, pulse: number): void {
    const dt = deltaMs / 1000;
    for (const t of this.tris) {
      t.gfx.y -= t.speed * dt;
      t.gfx.x += t.drift * dt;
      if (t.gfx.y < -t.size * 1.2) {
        t.gfx.y = this.opts.height + t.size * 1.2;
        t.gfx.x = Phaser.Math.Between(0, this.opts.width);
      }
      t.gfx.setScale(1 + 0.12 * pulse);
      t.gfx.setAlpha(t.baseAlpha * (0.75 + 0.25 * pulse));
    }
  }

  setVisible(v: boolean): void {
    for (const t of this.tris) t.gfx.setVisible(v);
  }
}
