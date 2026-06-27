/**
 * Notification preferences — persisted in localStorage.
 *
 * Defaults:
 *   soundEnabled: true
 *   mutedTypes: []   — notification types that should NOT play sound
 */

const STORAGE_KEY = "notifPrefs";

const DEFAULTS = {
  soundEnabled: true,
  mutedTypes: [],
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage full or unavailable — ignore */
  }
}

/**
 * Returns the current preferences (always a fresh copy).
 */
export function getPrefs() {
  return load();
}

/**
 * Update one or more preference keys.
 * @param {object} patch — e.g. { soundEnabled: false }
 */
export function updatePrefs(patch) {
  const current = load();
  const next = { ...current, ...patch };
  save(next);
  return next;
}

/**
 * Should a notification type play a sound?
 * @param {string} notificationType — e.g. "TASK", "PAYROLL", etc.
 * @returns {boolean}
 */
export function shouldPlaySound(notificationType) {
  const prefs = load();
  if (!prefs.soundEnabled) return false;
  if (prefs.mutedTypes.includes(notificationType)) return false;
  return true;
}
