#!/usr/bin/env node
/**
 * 서브에이전트 allow-list 패턴 검증
 *
 * 서브에이전트는 PreToolUse/PermissionRequest 훅을 실행하지 않으므로,
 * settings.json의 permissions.allow 패턴으로 Edit/Write를 제어한다.
 *
 * 이 테스트는 allow 패턴이 hook의 WRITE_ALLOW_PATTERNS과 동일한 경로를
 * 허용/차단하는지 검증한다.
 */

import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { matchesGlob } from 'node:path';
import { WRITE_ALLOW_PATTERNS } from '../hooks/config.mjs';
import { relative } from 'node:path';

// settings.json에 정의된 allow 패턴 (Edit/Write 공통)
const ALLOW_GLOB = '**/project-command-center/**/worktrees/**';

// CC_ROOT 시뮬레이션 (다양한 머신 환경)
const ROOTS = [
  '/Users/alen.heo/Desktop/project-command-center',
  '/Users/other/project-command-center',
  '/home/ci/workspace/project-command-center',
];

/** hook의 isWriteAllowed와 동일 로직 */
function hookAllows(absPath, ccRoot) {
  if (!absPath.startsWith(ccRoot + '/')) return false;
  const rel = relative(ccRoot, absPath);
  return WRITE_ALLOW_PATTERNS.some(p => p.test(rel));
}

/** settings.allow 글로브 매칭 */
function globAllows(absPath) {
  return matchesGlob(absPath, ALLOW_GLOB);
}

// ============================================================================
// 테스트 케이스
// ============================================================================

/** [설명, 절대경로 생성 함수, hook 기대값, glob 기대값] */
const cases = [
  // --- 허용되어야 하는 경로 ---
  ['CC worktree 파일',
    r => `${r}/worktrees/feat-x/foo.md`, true, true],
  ['CC worktree 중첩 파일',
    r => `${r}/worktrees/feat-x/src/main/App.kt`, true, true],
  ['프로젝트 worktree 파일',
    r => `${r}/projects/myapp/worktrees/feat-1/src/main.kt`, true, true],
  // dotfile(.으로 시작)은 glob **에 매칭 안 됨 — 서브에이전트에서 프롬프트 뜸
  // coder agent가 주로 수정하는 소스 코드(.kt, .ts 등)는 영향 없음
  ['프로젝트 worktree .claude 파일 (dotfile 미매칭)',
    r => `${r}/projects/myapp/worktrees/feat-1/.claude/settings.json`, true, false],
  ['중첩 프로젝트 worktree',
    r => `${r}/projects/group/myapp/worktrees/feat-1/src/App.kt`, true, true],

  // --- 차단되어야 하는 경로 ---
  ['CC 루트 CLAUDE.md',
    r => `${r}/CLAUDE.md`, false, false],
  ['CC 루트 wiki/',
    r => `${r}/wiki/asset-factory/README.md`, false, false],
  ['CC 루트 ontology/',
    r => `${r}/ontology/tbox.yaml`, false, false],
  ['CC 루트 .claude/settings.json',
    r => `${r}/.claude/settings.json`, false, false],
  ['프로젝트 main/ (읽기 전용)',
    r => `${r}/projects/myapp/main/src/App.kt`, false, false],
  ['CC 외부 경로',
    _r => `/tmp/scratch.md`, false, false],
  ['다른 프로젝트의 worktrees/',
    _r => `/Users/other/some-project/worktrees/feat/file.md`, false, false],

  // --- hook은 허용하지만 glob은 매칭 안 되는 경로 (의도적 차이) ---
  ['.lens/ (hook만 허용)',
    r => `${r}/.lens/abc/summaries.md`, true, false],
  ['.slack-digest/ (hook만 허용)',
    r => `${r}/.slack-digest/abc/raw.md`, true, false],
];

for (const root of ROOTS) {
  describe(`CC_ROOT=${root}`, () => {
    for (const [desc, pathFn, expectedHook, expectedGlob] of cases) {
      const absPath = pathFn(root);

      it(`hook: ${desc} → ${expectedHook ? 'allow' : 'deny'}`, () => {
        strictEqual(hookAllows(absPath, root), expectedHook);
      });

      it(`glob: ${desc} → ${expectedGlob ? 'allow' : 'deny'}`, () => {
        strictEqual(globAllows(absPath), expectedGlob);
      });
    }
  });
}

// .lens/.slack-digest 의도적 차이 문서화
describe('의도적 차이 (.lens, .slack-digest)', () => {
  it('.lens/는 hook에서만 허용 (서브에이전트가 사용하지 않는 경로)', () => {
    const p = `${ROOTS[0]}/.lens/abc/summaries.md`;
    strictEqual(hookAllows(p, ROOTS[0]), true);
    strictEqual(globAllows(p), false);
  });
});
