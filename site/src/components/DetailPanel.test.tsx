import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailPanel } from './DetailPanel';
import type { Entity } from '@/lib/types';

const baseEntity: Entity = {
  id: 'order-create',
  name: '주문 생성',
  type: 'process',
  summary: '주문을 생성하는 프로세스',
};

describe('DetailPanel - wiki link', () => {
  it("wikiDoc이 있으면 href를 '#/wiki/{wikiDoc}' 형태로 만든다", () => {
    const entity: Entity = {
      ...baseEntity,
      wikiDoc: 'commerce-order/주문-생성/README.md',
    };
    render(
      <DetailPanel
        entity={entity}
        relations={[]}
        repoBaseUrl=""
        onSelectEntity={() => {}}
        onClose={() => {}}
      />,
    );
    const link = screen.getByRole('link', { name: /주문-생성/ });
    expect(link.getAttribute('href')).toBe('#/wiki/commerce-order/주문-생성/README.md');
  });

  it("href에 'wiki/' 접두사를 이중으로 붙이지 않는다 (회귀 방지)", () => {
    const entity: Entity = {
      ...baseEntity,
      wikiDoc: 'commerce-order/주문-생성/README.md',
    };
    render(
      <DetailPanel
        entity={entity}
        relations={[]}
        repoBaseUrl=""
        onSelectEntity={() => {}}
        onClose={() => {}}
      />,
    );
    const link = screen.getByRole('link', { name: /주문-생성/ });
    expect(link.getAttribute('href')).not.toContain('/wiki/wiki/');
  });

  it('wikiDoc이 없으면 Wiki 섹션을 렌더링하지 않는다', () => {
    render(
      <DetailPanel
        entity={baseEntity}
        relations={[]}
        repoBaseUrl=""
        onSelectEntity={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText('Wiki')).toBeNull();
  });
});
