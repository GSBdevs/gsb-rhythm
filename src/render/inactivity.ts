/**
 * Monitor de inatividade — em evento o totem fica sozinho: se abandonado no
 * meio da partida ou na tela de resultado, precisa voltar à tela inicial.
 *
 * Escuta atividade no NÍVEL DA JANELA (pointerdown/keydown), então enxerga
 * tanto os toques no canvas do Phaser quanto os do formulário de lead (DOM),
 * que não passam pelo pipeline de input do jogo.
 */
export class InactivityMonitor {
  private lastActivityMs: number;
  private readonly onActivity = () => {
    this.lastActivityMs = performance.now();
  };

  constructor(private readonly timeoutMs: number) {
    this.lastActivityMs = performance.now();
    window.addEventListener('pointerdown', this.onActivity, { passive: true });
    window.addEventListener('keydown', this.onActivity, { passive: true });
    window.addEventListener('touchstart', this.onActivity, { passive: true });
  }

  /** true quando passou do limite sem nenhuma interação. */
  isIdle(): boolean {
    return performance.now() - this.lastActivityMs > this.timeoutMs;
  }

  /** força o relógio a "agora" (ex.: ao iniciar uma partida). */
  poke(): void {
    this.onActivity();
  }

  destroy(): void {
    window.removeEventListener('pointerdown', this.onActivity);
    window.removeEventListener('keydown', this.onActivity);
    window.removeEventListener('touchstart', this.onActivity);
  }
}

/** Lê o limite de inatividade: ?idle=<ms> (0 desliga), default 45s. */
export function inactivityTimeoutMs(): number {
  const raw = new URLSearchParams(window.location.search).get('idle');
  if (raw === null) return 45_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 45_000;
}
