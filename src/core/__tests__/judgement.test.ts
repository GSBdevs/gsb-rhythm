import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOWS, judge } from '../judgement.js';

describe('judge', () => {
  it('julga pelos limites exatos das janelas', () => {
    expect(judge(0)).toBe('perfect');
    expect(judge(DEFAULT_WINDOWS.perfectMs)).toBe('perfect');
    expect(judge(DEFAULT_WINDOWS.perfectMs + 1)).toBe('great');
    expect(judge(DEFAULT_WINDOWS.greatMs)).toBe('great');
    expect(judge(DEFAULT_WINDOWS.greatMs + 1)).toBe('good');
    expect(judge(DEFAULT_WINDOWS.goodMs)).toBe('good');
    expect(judge(DEFAULT_WINDOWS.goodMs + 1)).toBeNull();
  });

  it('é simétrico para adiantado e atrasado', () => {
    expect(judge(-40)).toBe('perfect');
    expect(judge(-100)).toBe('great');
    expect(judge(-500)).toBeNull();
  });
});
