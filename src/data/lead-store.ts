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

function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV RFC 4180, colunas fixas, precisão em % com vírgula (pt-BR). */
export function leadsToCsv(leads: readonly Lead[]): string {
  const header = 'timestamp,terminalId,themeName,name,email,phone,score,accuracy,grade';
  const rows = leads.map((l) =>
    [
      l.timestamp,
      l.terminalId,
      l.themeName,
      l.name,
      l.email,
      l.phone,
      String(l.score),
      `${(l.accuracy * 100).toFixed(1).replace('.', ',')}%`,
      l.grade,
    ]
      .map(csvEscape)
      .join(','),
  );
  return [header, ...rows].join('\r\n');
}

/** id do totem: ?terminal=<id>, default totem-01 (consolidação manual pós-evento). */
export function terminalId(): string {
  return new URLSearchParams(window.location.search).get('terminal') ?? 'totem-01';
}
