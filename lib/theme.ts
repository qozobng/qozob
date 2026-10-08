// =========================================================================
// THEME (light / dark / follow device)
// The choice is saved in localStorage under `qozob-theme`. "system" (the default)
// follows the phone/computer setting and updates live if that setting changes.
// =========================================================================

export type ThemePreference = 'light' | 'dark' | 'system';
export const THEME_STORAGE_KEY = 'qozob-theme';

/** Runs in <head> before the page paints, so dark-mode users never see a white flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.dataset.theme=p;}catch(e){}})();`;

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(THEME_STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies a preference to <html> (with a brief colour cross-fade) and saves it. */
export function applyThemePreference(pref: ThemePreference) {
  const root = document.documentElement;
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark());
  root.classList.add('theme-transition');
  root.classList.toggle('dark', dark);
  root.dataset.theme = pref;
  window.setTimeout(() => root.classList.remove('theme-transition'), 250);
  try {
    if (pref === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* private mode: ignore */
  }
}

