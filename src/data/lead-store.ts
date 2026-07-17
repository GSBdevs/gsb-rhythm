/**
 * Captura de leads — o produto de negócio do totem (a pontuação é isca).
 * Armazenamento em localStorage (web); a futura casca Electron/Capacitor
 * troca por gravação em disco via window.kiosk (padrão kiosk-maze).
 */

import type { Grade } from '../core/grade.js';

export interface Lead {
  name: string;
  email: string;
  phone: string;
  score: number;
  accuracy: number;
  grade: Grade;
  themeName: string;
  terminalId: string;
  /** ISO 8601 */
  timestamp: string;
}

export const LEADS_KEY = 'sbRhythmLeads';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class LeadStore {
  constructor(private readonly storage: StorageLike) {}

  all(): Lead[] {
    try {
      const raw = this.storage.getItem(LEADS_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Lead[]) : [];
    } catch {
      return [];
    }
  }

  save(lead: Lead): void {
    const leads = this.all();
    leads.push(lead);
    this.storage.setItem(LEADS_KEY, JSON.stringify(leads));
  }

  clear(): void {
    this.storage.removeItem(LEADS_KEY);
  }
}

// Formato COMUM aos tres jogos (maze/memoria/rhythm), desenhado para o Excel
// pt-BR: separador `;` (padrao da localidade), BOM UTF-8 na gravacao (CSV_BOM),
// data/hora locais em colunas separadas, cabecalhos em portugues e linhas em
// ordem cronologica. Os metadados (data;hora;terminal;jogo;pontuacao) casam com
// os outros dois; as colunas de campo aqui sao fixas (nome/email/telefone).

const CSV_SEP = ';';

/** BOM (U+FEFF) para o Excel abrir UTF-8 com acentuacao correta. */
export const CSV_BOM = String.fromCharCode(0xfeff);

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** ISO 8601 -> [dd/mm/aaaa, hh:mm:ss] no fuso local (mantem o cru se invalido). */
function localDateTime(iso: string): [string, string] {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return [iso, ''];
  return [
    `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`,
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
  ];
}

function csvEscape(v: string): string {
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function leadsToCsv(leads: readonly Lead[]): string {
  const sorted = [...leads].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const header = ['data', 'hora', 'terminal', 'jogo', 'pontuacao', 'nome', 'email', 'telefone', 'precisao', 'nota'];
  const rows = sorted.map((l) => {
    const [data, hora] = localDateTime(l.timestamp);
    return [
      data,
      hora,
      l.terminalId,
      l.themeName,
      String(l.score),
      l.name,
      l.email,
      l.phone,
      `${(l.accuracy * 100).toFixed(1).replace('.', ',')}%`,
      l.grade,
    ];
  });
  return [header, ...rows].map((row) => row.map(csvEscape).join(CSV_SEP)).join('\r\n');
}

/** id do totem: ?terminal=<id>, default totem-01 (consolidação manual pós-evento). */
export function terminalId(): string {
  return new URLSearchParams(window.location.search).get('terminal') ?? 'totem-01';
}
