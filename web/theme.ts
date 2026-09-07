// theme.ts — the one place the page's theme is decided. Dark by default; the
// header button cycles auto → light → dark → auto and the choice persists in
// localStorage. `auto` leaves data-theme unset so editor.css's
// prefers-color-scheme block decides, and re-decides when the OS flips.
import type { AppShell } from './appshell.ts';

export const THEME_KEY = 'galley-theme';
export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const CYCLE: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };

export function readTheme(raw: string | null): ThemeChoice {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}
export function nextTheme(t: ThemeChoice): ThemeChoice { return CYCLE[t]; }
export function resolveTheme(t: ThemeChoice, prefersDark: boolean): Theme {
  return t === 'system' ? (prefersDark ? 'dark' : 'light') : t;
}
export function themeLabel(t: ThemeChoice): string { return t === 'system' ? 'auto' : t; }

function storedTheme(): ThemeChoice {
  try { return readTheme(localStorage.getItem(THEME_KEY)); } catch { return 'system'; }
}
function storeTheme(t: ThemeChoice): void {
  try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode: the choice lasts the page */ }
}

const media = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)');

export function initTheme(this: AppShell): void {
  this.theme = storedTheme();
  media().addEventListener('change', () => this.applyTheme());
  this.applyTheme();
}

export function applyTheme(this: AppShell): void {
  const root = document.documentElement;
  if (this.theme === 'system') delete root.dataset.theme; else root.dataset.theme = this.theme;
  const b = this.themeButton;
  if (!b) return;
  const resolved = resolveTheme(this.theme, media().matches);
  b.querySelector('.gly-theme-label')!.textContent = themeLabel(this.theme);
  b.querySelector<HTMLElement>('.gly-theme-swatch')!.dataset.theme = resolved;
  b.title = `theme: ${themeLabel(this.theme)}${this.theme === 'system' ? ` (following browser: ${resolved})` : ''} · click to change`;
}

export function cycleTheme(this: AppShell): void {
  this.theme = nextTheme(this.theme);
  storeTheme(this.theme);
  this.applyTheme();
}

// The button sits AFTER hold and BEFORE #gly-revise while the button is still
// in the bar (Task 4 moves Revise to the footer; the theme button stays here).
export function makeThemeButton(this: AppShell): void {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'gly-theme';
  const swatch = document.createElement('span');
  swatch.className = 'gly-theme-swatch';
  const label = document.createElement('span');
  label.className = 'gly-theme-label';
  b.append(swatch, label);
  b.addEventListener('click', () => this.cycleTheme());
  const anchor = document.querySelector<HTMLElement>('.gly-hold') ?? document.querySelector<HTMLElement>('.gly-mode');
  if (anchor) anchor.insertAdjacentElement('afterend', b); else document.querySelector('.gly-bar')?.appendChild(b);
  this.themeButton = b;
  this.applyTheme();
}
