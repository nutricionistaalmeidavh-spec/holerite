/**
 * Coordinates update prompts without coupling business data or the UI to Electron.
 * Update discovery is best-effort; only an explicit choice can download or install.
 */
export interface UpdateBridge {
  configureManual(): void;
  onAvailable(listener: (info: {version: string}) => void | Promise<void>): void;
  onDownloaded(listener: (info: {version: string}) => void | Promise<void>): void;
  onError(listener: (error: Error) => void): void;
  check(): Promise<unknown>;
  download(): Promise<unknown>;
  install(): void;
}

export interface UpdateDialogs {
  confirmDownload(version: string): Promise<boolean>;
  confirmInstall(version: string): Promise<boolean>;
  downloadFailed(): Promise<void>;
}

export function registerUpdateFlow(
  environment: {packaged: boolean; platform: string},
  updater: UpdateBridge,
  dialogs: UpdateDialogs
): () => Promise<void> {
  if (!environment.packaged || environment.platform !== 'win32') {
    return async () => {};
  }

  // No automatic downloads or surprise installations on application exit.
  updater.configureManual();
  // A network error must never turn into an uncaught EventEmitter 'error'.
  updater.onError(() => { /* Offline use continues unchanged. */ });

  let state: 'idle'|'prompting'|'declined'|'downloading'|'downloaded'|'installing'|'failed' = 'idle';

  updater.onAvailable(async info => {
    if (state !== 'idle') return;
    state = 'prompting';
    try {
      if (!await dialogs.confirmDownload(info.version)) {
        state = 'declined';
        return;
      }
      state = 'downloading';
      await updater.download();
    } catch {
      state = 'failed';
      await dialogs.downloadFailed();
    }
  });

  updater.onDownloaded(async info => {
    if (state !== 'downloading') return;
    state = 'downloaded';
    try {
      if (await dialogs.confirmInstall(info.version)) {
        state = 'installing';
        updater.install();
      }
    } catch {
      // A failed/cancelled dialog must never force an installation.
    }
  });

  return async () => {
    try {
      await updater.check();
    } catch {
      // Startup is fully offline-capable; checking GitHub is optional.
    }
  };
}
