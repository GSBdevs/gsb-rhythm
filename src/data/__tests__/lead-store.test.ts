import { describe, expect, it } from 'vitest';
import { CSV_BOM, LeadStore, leadsToCsv, type Lead } from '../lead-store.js';

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const lead: Lead = {
  name: 'Ana, "a rápida"',
  email: 'ana@ex.com',
  phone: '11 99999-0000',
  score: 8450,
  accuracy: 0.917,
  grade: 'S',
  themeName: 'SB Rhythm',
  terminalId: 'totem-01',
  timestamp: '2026-07-10T14:00:00.000Z',
};

describe('LeadStore', () => {
  it('salva, lista e limpa', () => {
    const s = new LeadStore(memStorage());
    expect(s.all()).toEqual([]);
    s.save(lead);
    s.save({ ...lead, name: 'Bruno' });
    expect(s.all()).toHaveLength(2);
    expect(s.all()[1]?.name).toBe('Bruno');
    s.clear();
    expect(s.all()).toEqual([]);
  });

  it('storage corrompido não quebra', () => {
    const st = memStorage();
    st.setItem('sbRhythmLeads', '{lixo');
    expect(new LeadStore(st).all()).toEqual([]);
  });
});

describe('leadsToCsv', () => {
  it('formato comum pt-BR: cabeçalho, separador ; e precisão com vírgula', () => {
    const csv = leadsToCsv([{ ...lead, name: 'Ana; "a rápida"' }]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('data;hora;terminal;jogo;pontuacao;nome;email;telefone;precisao;nota');
    expect(lines[1]).toContain('"Ana; ""a rápida"""');
    expect(lines[1]).toContain('91,7%');
    expect(lines[1]!.endsWith(';S')).toBe(true);
    // data/hora locais derivadas do timestamp ISO (mesma conversão do módulo)
    const d = new Date(lead.timestamp);
    const pad2 = (n: number) => String(n).padStart(2, '0');
    expect(lines[1]!.startsWith(`${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()};`)).toBe(true);
  });

  it('ordena por timestamp e expõe o BOM do Excel', () => {
    const csv = leadsToCsv([
      { ...lead, name: 'Tarde', timestamp: '2026-07-10T18:00:00.000Z' },
      { ...lead, name: 'Cedo', timestamp: '2026-07-10T08:00:00.000Z' },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toContain('Cedo');
    expect(lines[2]).toContain('Tarde');
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff);
  });
});
