type BrowserStorageKind = 'local' | 'session';

function resolveStorage(kind: BrowserStorageKind): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function safeGetSessionItem(key: string): string | null {
  try {
    return resolveStorage('session')?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeGetLocalItem(key: string): string | null {
  try {
    return resolveStorage('local')?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeSetSessionItem(key: string, value: string): boolean {
  try {
    const storage = resolveStorage('session');
    if (!storage) {
      return false;
    }

    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeSetLocalItem(key: string, value: string): boolean {
  try {
    const storage = resolveStorage('local');
    if (!storage) {
      return false;
    }

    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveSessionItem(key: string): void {
  try {
    resolveStorage('session')?.removeItem(key);
  } catch {
    // Cleanup is best-effort when browser policy blocks storage access.
  }
}

export function safeRemoveLocalItem(key: string): void {
  try {
    resolveStorage('local')?.removeItem(key);
  } catch {
    // Legacy cleanup is best-effort when browser policy blocks storage access.
  }
}
