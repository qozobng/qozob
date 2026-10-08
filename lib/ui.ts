// =========================================================================
// SHARED UI CLASS RECIPES
// One place for the look of inputs, buttons and cards, built on the design tokens
// in app/globals.css. Every pairing here meets WCAG AA in light and dark mode.
// =========================================================================

export const ui = {
  // Layout
  card: 'bg-surface border border-line rounded-xl shadow-[0_1px_2px_rgb(var(--shadow-color)/0.06)]',
  cardPad: 'p-5 sm:p-6',

  // Typography
  eyebrow: 'text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle',
  h1: 'text-2xl sm:text-3xl font-semibold tracking-tight text-fg',
  h2: 'text-lg font-semibold tracking-tight text-fg',
  body: 'text-sm text-fg-muted leading-relaxed',

  // Forms
  label: 'block text-sm font-medium text-fg mb-1.5',
  hint: 'mt-1.5 text-xs text-fg-subtle',
  input:
    'block w-full h-11 px-3.5 rounded-lg bg-surface border border-line-strong text-fg text-sm placeholder:text-fg-subtle ' +
    'outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-accent-solid/25 disabled:opacity-60',
  inputWithIcon: 'pl-10',
  select:
    'block w-full h-11 px-3 rounded-lg bg-surface border border-line-strong text-fg text-sm outline-none cursor-pointer ' +
    'transition-colors focus:border-primary focus:ring-4 focus:ring-accent-solid/25',
  file:
    'block w-full text-sm text-fg-muted rounded-lg border border-line-strong bg-surface p-1.5 cursor-pointer ' +
    'file:mr-3 file:h-8 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-on-primary hover:file:bg-primary-hover',

  // Buttons
  btn: 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]',
  btnLg: 'h-11 px-5',
  btnMd: 'h-10 px-4',
  btnSm: 'h-8 px-3 text-xs',
  btnPrimary: 'bg-primary text-on-primary hover:bg-primary-hover',
  btnAccent: 'bg-accent-solid text-on-accent hover:bg-accent-hover',
  btnSecondary: 'bg-surface text-fg border border-line-strong hover:bg-surface-2',
  btnSoft: 'bg-surface-2 text-fg border border-line hover:bg-surface-3',
  btnGhost: 'text-fg-muted hover:text-fg hover:bg-surface-2',
  btnDanger: 'bg-danger-soft text-on-danger-soft border border-danger-line hover:brightness-95',
  btnSuccess: 'bg-success-soft text-on-success-soft border border-success-line hover:brightness-95',

  link: 'font-semibold text-accent underline-offset-4 hover:underline',

  // Feedback
  alertError: 'flex items-start gap-2 rounded-lg border border-danger-line bg-danger-soft text-on-danger-soft p-3 text-sm',
  alertSuccess: 'flex items-start gap-2 rounded-lg border border-success-line bg-success-soft text-on-success-soft p-3 text-sm',
  alertWarning: 'flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft text-on-warning-soft p-3 text-sm',

  // Modals
  overlay: 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[var(--overlay)] backdrop-blur-[2px]',
  modal: 'relative w-full bg-surface text-fg border border-line rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200',
  modalClose: 'absolute top-4 right-4 p-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors',
} as const;

/** Joins class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
