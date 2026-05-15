import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTheme } from './useTheme';

function setMatchMedia(matches: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.push(l),
      removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => {
        const i = listeners.indexOf(l);
        if (i >= 0) listeners.splice(i, 1);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  return {
    fire(newMatches: boolean) {
      listeners.forEach((l) => l({ matches: newMatches } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.length,
  };
}

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it("localStorage가 비어 있으면 기본값은 'system'", () => {
    setMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.pref).toBe('system');
  });

  it("저장된 'light'/'dark'를 그대로 읽는다", () => {
    window.localStorage.setItem('cc-theme', 'dark');
    setMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.pref).toBe('dark');
  });

  it("system 모드는 prefers-color-scheme: dark를 따라 data-theme를 적용", () => {
    setMatchMedia(true); // OS = dark
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it("system 모드에서 OS가 light면 data-theme도 light", () => {
    setMatchMedia(false); // OS = light
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it("light 선호는 OS와 무관하게 data-theme=light", () => {
    window.localStorage.setItem('cc-theme', 'light');
    setMatchMedia(true); // OS는 dark지만 무시
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it("cycle은 system → light → dark → system 순으로 순환", () => {
    setMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.pref).toBe('system');

    act(() => result.current.cycle());
    expect(result.current.pref).toBe('light');

    act(() => result.current.cycle());
    expect(result.current.pref).toBe('dark');

    act(() => result.current.cycle());
    expect(result.current.pref).toBe('system');
  });

  it("pref 변경은 localStorage에 저장된다", () => {
    setMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.cycle()); // system → light
    expect(window.localStorage.getItem('cc-theme')).toBe('light');
    act(() => result.current.cycle()); // light → dark
    expect(window.localStorage.getItem('cc-theme')).toBe('dark');
  });

  it("system 모드일 때만 matchMedia change 리스너를 등록한다", () => {
    const mm = setMatchMedia(false);
    // 초기 system → 리스너 1개
    const { result, unmount } = renderHook(() => useTheme());
    expect(mm.listenerCount()).toBe(1);

    // system → light로 바꾸면 리스너 해제
    act(() => result.current.cycle());
    expect(mm.listenerCount()).toBe(0);

    unmount();
  });

  it("system 모드에서 OS 테마 변경 이벤트가 data-theme를 갱신한다", () => {
    const mm = setMatchMedia(false);
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // OS를 dark로 전환
    act(() => {
      setMatchMedia(true);
      mm.fire(true);
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
