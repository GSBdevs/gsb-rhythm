import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, resolveTheme } from '../theme.js';

describe('resolveTheme', () => {
  it('JSON vazio ou lixo cai no default completo', () => {
    expect(resolveTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(resolveTheme('lixo')).toEqual(DEFAULT_THEME);
    expect(resolveTheme([1, 2])).toEqual(DEFAULT_THEME);
    expect(resolveTheme({})).toEqual(DEFAULT_THEME);
  });

  it('mescla campos válidos e descarta inválidos', () => {
    const t = resolveTheme({
      name: 'X',
      colors: { note: '#ff0000', background: 'azul' },
      noteShape: 'star',
      gameplay: { speed: 1.5, bpm: 9999 },
      audio: { track: 'arcade', volume: 3, hitSounds: false },
      lead: { enabled: true },
    });
    expect(t.name).toBe('X');
    expect(t.colors.note).toBe('#ff0000');
    expect(t.colors.background).toBe(DEFAULT_THEME.colors.background); // inválida
    expect(t.noteShape).toBe('star');
    expect(t.gameplay.speed).toBe(1.5);
    expect(t.gameplay.bpm).toBe(DEFAULT_THEME.gameplay.bpm); // fora do range
    expect(t.audio.track).toBe('arcade');
    expect(t.audio.volume).toBe(DEFAULT_THEME.audio.volume); // fora do range
    expect(t.audio.hitSounds).toBe(false);
    expect(t.lead.enabled).toBe(true);
    expect(t.lead.headline).toBe(DEFAULT_THEME.lead.headline);
  });

  it('speed é limitado a [0.5, 2] e trilha desconhecida cai no default', () => {
    expect(resolveTheme({ gameplay: { speed: 0.1 } }).gameplay.speed).toBe(1);
    expect(resolveTheme({ gameplay: { speed: 2 } }).gameplay.speed).toBe(2);
    expect(resolveTheme({ audio: { track: 'dubstep' } }).audio.track).toBe(DEFAULT_THEME.audio.track);
  });

  it('images aceita data/blob/http e rejeita o resto', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
    expect(resolveTheme({ images: { startIcon: dataUri, wallpaper: 'blob:xyz' } }).images).toEqual({
      startIcon: dataUri,
      wallpaper: 'blob:xyz',
    });
    // URIs perigosas ou inválidas viram '' (sem imagem)
    expect(resolveTheme({ images: { startIcon: 'javascript:alert(1)', wallpaper: 'data:text/html,x' } }).images).toEqual({
      startIcon: '',
      wallpaper: '',
    });
    expect(resolveTheme({}).images).toEqual({ startIcon: '', wallpaper: '' });
  });
});
