import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(cleanup);

function Boom(): never {
  throw new Error('boom');
}

test('catches render-time error and shows fallback', () => {
  // suppress React's error log noise for the test
  const orig = console.error;
  console.error = () => {};
  try {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
  } finally {
    console.error = orig;
  }
  expect(screen.getByText(/화면을 그리던 중 오류/)).toBeTruthy();
  expect(screen.getByText(/boom/)).toBeTruthy();
});

test('renders children when no error', () => {
  render(
    <ErrorBoundary>
      <div>safe</div>
    </ErrorBoundary>,
  );
  expect(screen.getByText('safe')).toBeTruthy();
});
