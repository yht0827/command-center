import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: () => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

describe('ThemeToggle', () => {
  it("초기 상태에서 'System' 라벨을 보여준다", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button').textContent).toContain('System');
  });

  it("저장된 'light'이면 'Light' 라벨로 시작", () => {
    window.localStorage.setItem('cc-theme', 'light');
    render(<ThemeToggle />);
    expect(screen.getByRole('button').textContent).toContain('Light');
  });

  it("클릭하면 System → Light → Dark → System 순으로 라벨이 바뀐다", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    expect(btn.textContent).toContain('System');

    fireEvent.click(btn);
    expect(btn.textContent).toContain('Light');

    fireEvent.click(btn);
    expect(btn.textContent).toContain('Dark');

    fireEvent.click(btn);
    expect(btn.textContent).toContain('System');
  });

  it("aria-label에 현재 테마를 명시한다", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toContain('System');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-label')).toContain('Light');
  });
});
