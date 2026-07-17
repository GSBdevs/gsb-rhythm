/**
 * Exportacao de arquivo de texto multiplataforma (padrao comum aos tres jogos).
 *
 * - Web/Electron: download via ancora (o Electron mostra o "Salvar como" nativo).
 * - Android (Capacitor): ancora NAO dispara download no WebView — grava o
 *   arquivo no cache e abre a folha nativa de compartilhamento (e-mail, Drive,
 *   WhatsApp...), o mesmo caminho ja usado para o CSV de leads.
 */

import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function exportTextFile(filename: string, content: string, mime: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: filename,
      directory: Directory.Cache,
      data: content,
      encoding: Encoding.UTF8,
    });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    try {
      await Share.share({ title: filename, url: uri, dialogTitle: `Compartilhar ${filename}` });
    } catch {
      /* usuario fechou a folha de compartilhamento — nao e erro */
    }
    return;
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
