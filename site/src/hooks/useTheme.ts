import { useEffect, useState, useCallback } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'cc-theme';

function readPref(): ThemePref {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function systemIsDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(pref: ThemePref) {
  const resolved = pref === 'system' ? (systemIsDark() ? 'dark' : 'light') : pref;
  document.documentElement.setAttribute('data-theme', resolved);
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readPref);

  // pref 변경 시 data-theme 반영 + localStorage 저장
  useEffect(() => {
    applyTheme(pref);
    window.localStorage.setItem(STORAGE_KEY, pref);
  }, [pref]);

  // system 모드일 때만 OS 변경 추종
  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const cycle = useCallback(() => {
    setPrefState((cur) => (cur === 'system' ? 'light' : cur === 'light' ? 'dark' : 'system'));
  }, []);

  return { pref, cycle };
}
