import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom에 matchMedia가 없으므로 기본 stub 제공.
// 개별 테스트에서 더 정교한 mock으로 덮어쓸 수 있다.
beforeEach(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
