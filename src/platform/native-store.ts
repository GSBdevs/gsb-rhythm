/**
 * Persistencia nativa (Android/Capacitor) — backup em DISCO do que na web vive
 * no localStorage, seguindo o padrao do maze-game (tema gravado via ponte).
 *
 * O WebView pode descartar localStorage/IndexedDB sob pressao de armazenamento
 * ou "limpar dados"; arquivo em disco sobrevive. No web/Electron estas funcoes
 * sao no-op (o Electron ja persiste via porta fixa 39219).
 *
 *   applied-theme.json      -> Directory.Data (privado do app): ultimo tema aplicado
 *   leads/leads.csv         -> Directory.External (/Android/data/<appId>/files/):
 *                              espelho do CSV, acessivel por USB para o operador
 */

import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

const THEME_FILE = 'applied-theme.json';

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** Grava o tema aplicado em disco (best-effort; localStorage continua a fonte primaria). */
export async function saveAppliedThemeNative(json: string): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await Filesystem.writeFile({
      path: THEME_FILE,
      directory: Directory.Data,
      data: json,
      encoding: Encoding.UTF8,
    });
  } catch {
    /* sem espaco/permissao: o localStorage segue valendo */
  }
}

/** Le o backup do tema aplicado (null se nao existe ou nao e nativo). */
export async function loadAppliedThemeNative(): Promise<unknown | null> {
  if (!isNativePlatform()) return null;
  try {
    const res = await Filesystem.readFile({
      path: THEME_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return JSON.parse(res.data as string) as unknown;
  } catch {
    return null;
  }
}

/** Espelha o CSV consolidado de leads em pasta acessivel por USB (best-effort). */
export async function mirrorLeadsCsvNative(csv: string): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await Filesystem.writeFile({
      path: 'leads/leads.csv',
      directory: Directory.External,
      data: csv,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  } catch {
    /* best-effort */
  }
}
