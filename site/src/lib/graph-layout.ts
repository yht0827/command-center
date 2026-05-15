import type { Entity } from '@/lib/types';
import { TYPE_ORDER, TYPE_LABELS, TYPE_COLORS } from '@/lib/constants';

export const NODE_W = 200;
export const NODE_H = 72;
const GAP_X = 24;
const GAP_Y = 20;
const COLS = 4;
const SECTION_PAD = 20;
const SECTION_GAP = 40;
const LABEL_H = 32;

export interface PositionedNode {
  id: string;
  entity: Entity;
  x: number;
  y: number;
}

export interface Section {
  type: string;
  label: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  nodes: PositionedNode[];
}

export function buildGridLayout(entities: Entity[]): { sections: Section[]; totalW: number; totalH: number } {
  const byType = new Map<string, Entity[]>();
  for (const e of entities) {
    const list = byType.get(e.type) ?? [];
    list.push(e);
    byType.set(e.type, list);
  }

  const sections: Section[] = [];
  let curY = 0;

  for (const type of TYPE_ORDER) {
    const typeEntities = byType.get(type);
    if (!typeEntities || typeEntities.length === 0) continue;

    const cols = Math.min(COLS, typeEntities.length);
    const rows = Math.ceil(typeEntities.length / cols);
    const sectionW = cols * NODE_W + (cols - 1) * GAP_X + SECTION_PAD * 2;
    const sectionH = LABEL_H + rows * NODE_H + (rows - 1) * GAP_Y + SECTION_PAD * 2;

    const sectionNodes: PositionedNode[] = typeEntities.map((e, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        id: e.id,
        entity: e,
        x: SECTION_PAD + col * (NODE_W + GAP_X),
        y: LABEL_H + SECTION_PAD + row * (NODE_H + GAP_Y),
      };
    });

    sections.push({
      type,
      label: TYPE_LABELS[type] ?? type,
      color: TYPE_COLORS[type] ?? '#71717a',
      x: 0,
      y: curY,
      w: sectionW,
      h: sectionH,
      nodes: sectionNodes,
    });

    curY += sectionH + SECTION_GAP;
  }

  // Center all sections to the widest one
  const maxW = Math.max(...sections.map((s) => s.w));
  for (const s of sections) {
    s.x = (maxW - s.w) / 2;
  }

  return { sections, totalW: maxW, totalH: curY - SECTION_GAP };
}
