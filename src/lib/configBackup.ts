/**
 * Sistema de Backup/Restore de Configurações do Usuário.
 *
 * Funcionalidades:
 * - Snapshot de configurações (settings, shortcuts, UI state)
 * - Export para JSON (downloadable)
 * - Import de JSON (validation + merge)
 * - Auto-backup periódico para localStorage
 *
 * Uso:
 * ```typescript
 * import { configBackup } from '@/lib/configBackup';
 *
 * // Criar snapshot
 * const snapshot = configBackup.createSnapshot();
 *
 * // Export
 * configBackup.downloadSnapshot(snapshot);
 *
 * // Import
 * const result = await configBackup.importSnapshot(file);
 * ```
 */

export interface ConfigSnapshot {
  version: string;
  timestamp: string;
  userId?: string;
  settings: {
    theme?: string;
    language?: string;
    notifications?: Record<string, boolean>;
    shortcuts?: Record<string, string>;
    ui?: Record<string, unknown>;
  };
  data?: {
    savedFilters?: unknown[];
    pinnedChats?: string[];
    contacts?: unknown[];
  };
  checksum: string;
}

interface BackupOptions {
  /** Incluir dados pesados (contatos, chats) */
  includeData?: boolean;
  /** User ID para rastreamento */
  userId?: string;
}

class ConfigBackupService {
  private readonly STORAGE_KEY = 'zapp:config-backup';
  private readonly AUTO_BACKUP_INTERVAL_MS = 60 * 60 * 1000; // 1h

  /**
   * Cria snapshot das configurações atuais.
   */
  createSnapshot(options: BackupOptions = {}): ConfigSnapshot {
    const settings = {
      theme: this.getLocalStorageItem<string>('zapp:theme'),
      language: this.getLocalStorageItem<string>('zapp:language'),
      notifications: this.getLocalStorageItem<Record<string, boolean>>('zapp:notifications', {}),
      shortcuts: this.getLocalStorageItem<Record<string, string>>('zapp:shortcuts', {}),
      ui: this.getLocalStorageItem<Record<string, unknown>>('zapp:ui-state', {}),
    };

    const snapshot: ConfigSnapshot = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      userId: options.userId,
      settings,
      checksum: '',
    };

    // Calcula checksum
    snapshot.checksum = this.calculateChecksum(snapshot);

    return snapshot;
  }

  /**
   * Export snapshot como arquivo JSON.
   */
  downloadSnapshot(snapshot: ConfigSnapshot): void {
    if (typeof window === 'undefined') return;

    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const filename = `zapp-backup-${new Date().toISOString().split('T')[0]}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    // Cleanup
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  /**
   * Import snapshot de arquivo JSON.
   */
  async importSnapshot(file: File): Promise<
    | { ok: true; snapshot: ConfigSnapshot }
    | { ok: false; error: string }
  > {
    try {
      const text = await file.text();
      const snapshot = JSON.parse(text) as ConfigSnapshot;

      // Validação básica
      const validation = this.validateSnapshot(snapshot);
      if (!validation.ok) {
        return validation;
      }

      // Verifica checksum
      const expectedChecksum = snapshot.checksum;
      snapshot.checksum = ''; // Limpa para recalcular
      const actualChecksum = this.calculateChecksum(snapshot);

      if (expectedChecksum !== actualChecksum) {
        return {
          ok: false,
          error: 'Checksum inválido - arquivo pode estar corrompido',
        };
      }

      snapshot.checksum = expectedChecksum;

      return { ok: true, snapshot };
    } catch (e) {
      return {
        ok: false,
        error: `Falha ao parsear arquivo: ${e instanceof Error ? e.message : 'Erro desconhecido'}`,
      };
    }
  }

  /**
   * Aplica snapshot (restore).
   */
  applySnapshot(snapshot: ConfigSnapshot): void {
    const { settings } = snapshot;

    if (settings.theme) {
      this.setLocalStorageItem('zapp:theme', settings.theme);
    }
    if (settings.language) {
      this.setLocalStorageItem('zapp:language', settings.language);
    }
    if (settings.notifications) {
      this.setLocalStorageItem('zapp:notifications', settings.notifications);
    }
    if (settings.shortcuts) {
      this.setLocalStorageItem('zapp:shortcuts', settings.shortcuts);
    }
    if (settings.ui) {
      this.setLocalStorageItem('zapp:ui-state', settings.ui);
    }
  }

  /**
   * Auto-backup para localStorage (silencioso).
   */
  autoBackup(): void {
    if (typeof window === 'undefined') return;

    try {
      const snapshot = this.createSnapshot();
      this.setLocalStorageItem(this.STORAGE_KEY, snapshot);
    } catch {
      // localStorage full - skip
    }
  }

  /**
   * Recupera último auto-backup.
   */
  getLastAutoBackup(): ConfigSnapshot | null {
    const backup = this.getLocalStorageItem<ConfigSnapshot | null>(this.STORAGE_KEY, null);
    if (!backup) return null;

    const validation = this.validateSnapshot(backup);
    return validation.ok ? backup : null;
  }

  /**
   * Inicia auto-backup periódico.
   */
  startAutoBackup(): () => void {
    if (typeof window === 'undefined') {
      return () => undefined;
    }

    const interval = setInterval(() => this.autoBackup(), this.AUTO_BACKUP_INTERVAL_MS);

    // Backup inicial
    this.autoBackup();

    // Cleanup
    return () => clearInterval(interval);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getLocalStorageItem<T>(key: string, defaultValue?: T): T | undefined {
    if (typeof window === 'undefined') return defaultValue;

    try {
      const item = localStorage.getItem(key);
      if (!item) return defaultValue;
      return JSON.parse(item) as T;
    } catch {
      return defaultValue;
    }
  }

  private setLocalStorageItem(key: string, value: unknown): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded - skip
    }
  }

  private calculateChecksum(snapshot: ConfigSnapshot): string {
    // Simple hash para detectar corrupção
    const str = JSON.stringify({
      version: snapshot.version,
      timestamp: snapshot.timestamp,
      settings: snapshot.settings,
    });

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  private validateSnapshot(snapshot: unknown):
    | { ok: true; snapshot: ConfigSnapshot }
    | { ok: false; error: string } {
    if (!snapshot || typeof snapshot !== 'object') {
      return { ok: false, error: 'Snapshot inválido' };
    }

    const s = snapshot as Partial<ConfigSnapshot>;

    if (!s.version || !s.timestamp || !s.settings) {
      return { ok: false, error: 'Snapshot incompleto' };
    }

    if (!s.version.match(/^\d+\.\d+\.\d+$/)) {
      return { ok: false, error: 'Versão inválida' };
    }

    return { ok: true, snapshot: s as ConfigSnapshot };
  }
}

export const configBackup = new ConfigBackupService();
