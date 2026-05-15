import { useTheme, type ThemePref } from '@/hooks/useTheme';

const LABEL: Record<ThemePref, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const NEXT_LABEL: Record<ThemePref, string> = {
  system: 'Light',
  light: 'Dark',
  dark: 'System',
};

export function ThemeToggle() {
  const { pref, cycle } = useTheme();

  return (
    <button
      type="button"
      onClick={cycle}
      title={`테마: ${LABEL[pref]} (클릭 → ${NEXT_LABEL[pref]})`}
      aria-label={`테마 전환 (현재 ${LABEL[pref]})`}
      className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] text-text-muted bg-bg-card border border-border hover:bg-bg-hover hover:text-text-primary hover:border-border-hover transition-colors"
    >
      <ThemeIcon pref={pref} />
      <span className="font-medium">{LABEL[pref]}</span>
    </button>
  );
}

function ThemeIcon({ pref }: { pref: ThemePref }) {
  if (pref === 'light') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (pref === 'dark') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  // system
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </svg>
  );
}
