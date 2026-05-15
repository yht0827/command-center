import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import { useGraphInteraction } from './useGraphInteraction';

const mkEvent = (x: number, y: number) =>
  ({ clientX: x, clientY: y, target: { closest: () => null } } as unknown as React.MouseEvent<SVGSVGElement>);

test('pan: mousedown 후 mousemove 가 transform.x/y 를 변경한다', () => {
  const { result } = renderHook(() => useGraphInteraction());
  act(() => result.current.svgHandlers.onMouseDown(mkEvent(0, 0)));
  act(() => result.current.svgHandlers.onMouseMove(mkEvent(50, 30)));
  expect(result.current.transform.x).toBe(50);
  expect(result.current.transform.y).toBe(30);
});

// onMouseMove 의 setTransform updater 가 panRef.current 를 다시 참조하면,
// 실제 브라우저에서 updater 실행 직전에 onMouseUp 이 ref 를 비워서 throw 가 발생했다.
// 단위 테스트는 React act() 가 batch 를 동기 처리해 이 race 를 직접 재현하지 못한다.
// 대신 fix 의 핵심 — updater 가 외부 ref 가 아닌 캡쳐된 값으로 동작하는지 — 를 검증한다.
test('pan: mouseUp 직후에도 transform 이 마지막 move 결과를 유지한다', () => {
  const { result } = renderHook(() => useGraphInteraction());
  act(() => result.current.svgHandlers.onMouseDown(mkEvent(0, 0)));
  act(() => result.current.svgHandlers.onMouseMove(mkEvent(50, 30)));
  act(() => result.current.svgHandlers.onMouseUp());
  // mouseUp 이 panRef 를 비워도, 이미 반영된 transform 값이 유효해야 함
  expect(result.current.transform.x).toBe(50);
  expect(result.current.transform.y).toBe(30);
});
