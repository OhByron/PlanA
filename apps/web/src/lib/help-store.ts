const STORAGE_KEY = 'plana_help_dismissed';

function getDismissed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function isDismissed(id: string): boolean {
  return getDismissed()[id] === true;
}

export function dismiss(id: string): void {
  const current = getDismissed();
  current[id] = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

export function resetAllHelp(): void {
  localStorage.removeItem(STORAGE_KEY);
}
