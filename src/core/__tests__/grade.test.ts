import { describe, expect, it } from 'vitest';
import { gradeFor } from '../grade.js';

describe('gradeFor', () => {
  it('SS exige precisão ~perfeita e zero misses', () => {
    expect(gradeFor(1, 0)).toBe('SS');
    expect(gradeFor(0.995, 0)).toBe('SS');
    expect(gradeFor(1, 1)).toBe('S'); // miss derruba de SS mesmo com acc alta
  });

  it('faixas de corte', () => {
    expect(gradeFor(0.93, 2)).toBe('S');
    expect(gradeFor(0.85, 5)).toBe('A');
    expect(gradeFor(0.75, 5)).toBe('B');
    expect(gradeFor(0.6, 5)).toBe('C');
    expect(gradeFor(0.59, 5)).toBe('D');
    expect(gradeFor(0, 32)).toBe('D');
  });
});
