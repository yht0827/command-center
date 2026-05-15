import { describe, it, expect } from 'vitest';
import { normalizeWikiDoc } from './wiki-path.mjs';

describe('normalizeWikiDoc', () => {
  it("선두 'wiki/' 접두사를 제거한다", () => {
    expect(normalizeWikiDoc('wiki/commerce-order/주문-생성/README.md')).toBe(
      'commerce-order/주문-생성/README.md',
    );
  });

  it('접두사가 없는 경로는 그대로 둔다', () => {
    expect(normalizeWikiDoc('commerce-order/README.md')).toBe('commerce-order/README.md');
  });

  it("선두 'wiki/'만 제거하고 내부의 'wiki/'는 보존한다", () => {
    expect(normalizeWikiDoc('wiki/foo/wiki/bar.md')).toBe('foo/wiki/bar.md');
  });
});
