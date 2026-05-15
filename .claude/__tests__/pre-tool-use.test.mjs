#!/usr/bin/env node
/**
 * pre-tool-use 단위 테스트
 *
 * pre-tool-use.mjs의 핵심 로직을 검증한다:
 * - READ_TOOLS → 어디서든 allow
 * - WRITE_TOOLS → 경로 기반 allow/deny/pass-through
 * - 그 외 도구 → pass-through
 */

import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import {
  isInsideCC, isWriteAllowed,
} from '../hooks/config.mjs';
import { resolve } from 'node:path';

const CC_ROOT = '/Users/test/project-command-center';

// pre-tool-use.mjs의 도구 분류 재현
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

// ============================================================================
// 1. 도구 분류
// ============================================================================

describe('도구 분류', () => {
  describe('READ_TOOLS', () => {
    for (const tool of ['Read', 'Glob', 'Grep']) {
      it(`${tool}은 읽기 도구`, () => {
        strictEqual(READ_TOOLS.has(tool), true);
      });
    }

    for (const tool of ['Edit', 'Write', 'Bash', 'Agent', 'NotebookEdit']) {
      it(`${tool}은 읽기 도구가 아님`, () => {
        strictEqual(READ_TOOLS.has(tool), false);
      });
    }
  });

  describe('WRITE_TOOLS', () => {
    for (const tool of ['Edit', 'Write', 'NotebookEdit']) {
      it(`${tool}은 쓰기 도구`, () => {
        strictEqual(WRITE_TOOLS.has(tool), true);
      });
    }

    for (const tool of ['Read', 'Glob', 'Grep', 'Bash', 'Agent']) {
      it(`${tool}은 쓰기 도구가 아님`, () => {
        strictEqual(WRITE_TOOLS.has(tool), false);
      });
    }
  });

  describe('그 외 도구 (pass-through)', () => {
    for (const tool of ['Bash', 'Agent', 'WebSearch', 'WebFetch', 'Skill', 'TodoWrite']) {
      it(`${tool}은 읽기/쓰기 모두 아님 → pass-through`, () => {
        strictEqual(READ_TOOLS.has(tool), false);
        strictEqual(WRITE_TOOLS.has(tool), false);
      });
    }
  });
});

// ============================================================================
// 2. isInsideCC — CC 루트 내부 판별
// ============================================================================

describe('isInsideCC', () => {
  it('CC_ROOT 자체 → 내부', () => {
    strictEqual(isInsideCC(CC_ROOT, CC_ROOT), true);
  });

  it('CC_ROOT 하위 → 내부', () => {
    strictEqual(isInsideCC(`${CC_ROOT}/wiki/README.md`, CC_ROOT), true);
  });

  it('CC_ROOT 하위 깊은 경로 → 내부', () => {
    strictEqual(isInsideCC(`${CC_ROOT}/projects/foo/main/src/App.kt`, CC_ROOT), true);
  });

  it('CC_ROOT 외부 → 외부', () => {
    strictEqual(isInsideCC('/tmp/file.txt', CC_ROOT), false);
  });

  it('CC_ROOT와 prefix만 겹침 → 외부', () => {
    // project-command-center-v2 는 project-command-center 의 sibling
    strictEqual(isInsideCC('/Users/test/project-command-center-v2/file.txt', CC_ROOT), false);
  });

  it('루트 경로 → 외부', () => {
    strictEqual(isInsideCC('/', CC_ROOT), false);
  });

  it('빈 경로 → 외부', () => {
    strictEqual(isInsideCC('', CC_ROOT), false);
  });
});

// ============================================================================
// 3. 쓰기 도구 경로 판단 시뮬레이션
// ============================================================================

/**
 * pre-tool-use.mjs의 쓰기 도구 판단 로직 재현.
 * @returns 'allow' | 'deny' | 'pass-through'
 */
function decideWrite(filePath, cwd, ccRoot) {
  if (!filePath) return 'deny';
  const absPath = resolve(cwd, filePath);
  if (!isInsideCC(absPath, ccRoot)) return 'pass-through';
  if (isWriteAllowed(absPath, ccRoot)) return 'allow';
  return 'deny';
}

describe('쓰기 도구 경로 판단', () => {
  describe('CC worktree → allow', () => {
    const cases = [
      ['worktrees/feat-x/file.md', CC_ROOT],
      [`${CC_ROOT}/worktrees/feat-x/file.md`, CC_ROOT],
    ];
    for (const [path, cwd] of cases) {
      it(`${path} → allow`, () => {
        strictEqual(decideWrite(path, cwd, CC_ROOT), 'allow');
      });
    }
  });

  describe('프로젝트 worktree → allow', () => {
    const cases = [
      ['projects/myapp/worktrees/feat-1/src/App.kt', CC_ROOT],
      ['projects/group/myapp/worktrees/feat-1/file.kt', CC_ROOT],
    ];
    for (const [path, cwd] of cases) {
      it(`${path} → allow`, () => {
        strictEqual(decideWrite(path, cwd, CC_ROOT), 'allow');
      });
    }
  });

  describe('.lens/, .slack-digest/ → allow', () => {
    it('.lens/ → allow', () => {
      strictEqual(decideWrite('.lens/abc/summaries.md', CC_ROOT, CC_ROOT), 'allow');
    });
    it('.slack-digest/ → allow', () => {
      strictEqual(decideWrite('.slack-digest/abc/raw.md', CC_ROOT, CC_ROOT), 'allow');
    });
  });

  describe('CC 내부 비-worktree → deny', () => {
    const cases = [
      ['CLAUDE.md', CC_ROOT],
      ['wiki/asset-factory/README.md', CC_ROOT],
      ['ontology/tbox.yaml', CC_ROOT],
      ['.claude/settings.json', CC_ROOT],
      ['projects/myapp/main/src/App.kt', CC_ROOT],
    ];
    for (const [path, cwd] of cases) {
      it(`${path} → deny`, () => {
        strictEqual(decideWrite(path, cwd, CC_ROOT), 'deny');
      });
    }
  });

  describe('CC 외부 → pass-through', () => {
    const cases = [
      ['/tmp/file.txt', CC_ROOT],
      ['/Users/other/project/file.kt', CC_ROOT],
      ['../sibling/file.md', CC_ROOT],
    ];
    for (const [path, cwd] of cases) {
      it(`${path} → pass-through`, () => {
        strictEqual(decideWrite(path, cwd, CC_ROOT), 'pass-through');
      });
    }
  });

  describe('file_path 누락 → deny', () => {
    it('undefined → deny', () => {
      strictEqual(decideWrite(undefined, CC_ROOT, CC_ROOT), 'deny');
    });
    it('null → deny', () => {
      strictEqual(decideWrite(null, CC_ROOT, CC_ROOT), 'deny');
    });
    it('빈 문자열 → deny', () => {
      strictEqual(decideWrite('', CC_ROOT, CC_ROOT), 'deny');
    });
  });
});

// ============================================================================
// 4. CWD가 프로젝트 worktree일 때 상대 경로 해석
// ============================================================================

describe('CWD가 프로젝트 worktree', () => {
  const projectWtCwd = `${CC_ROOT}/projects/myapp/worktrees/feat-1`;

  it('상대 경로 src/App.kt → allow', () => {
    strictEqual(decideWrite('src/App.kt', projectWtCwd, CC_ROOT), 'allow');
  });

  it('상대 경로 ../../main/src/App.kt → deny (main/ 탈출)', () => {
    strictEqual(decideWrite('../../main/src/App.kt', projectWtCwd, CC_ROOT), 'deny');
  });

  it('상대 경로 ../../../../ → deny (CC 루트)', () => {
    strictEqual(decideWrite('../../../../CLAUDE.md', projectWtCwd, CC_ROOT), 'deny');
  });
});
