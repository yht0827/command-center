#!/usr/bin/env node
/**
 * 런타임 강제 — 통합 테스트
 *
 * computeRuntimeDecision은 순수 함수로 단위 테스트(config-utils)에서 다룬다.
 * 이 파일은 사이드이펙트 wrapper(enforceMinRuntime)를 spawn으로 호출하여
 * stderr/stdout/exit code/응답 JSON이 의도대로인지 검증한다.
 *
 * 미달 시나리오는 CLAUDE_HOOK_MIN_NODE_TEST 환경변수로 시뮬레이션 (현재 node major
 * 보다 큰 값을 주입하여 강제로 fail/warn 트리거).
 */

import { describe, it } from 'node:test';
import { strictEqual, match, ok } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CC_ROOT } from '../hooks/config.mjs';

const __filename = fileURLToPath(import.meta.url);
const HOOKS_DIR = resolve(dirname(__filename), '..', 'hooks');
const BIN = process.execPath; // 같은 node 바이너리로 spawn

// 현재 노드 메이저보다 큰 값 — 강제 fail 시뮬레이션용
const FAIL_VERSION = (parseInt(process.versions.node.split('.')[0], 10) + 1).toString();

function runHook(hookFile, { stdin = '', env = {} } = {}) {
  return spawnSync(BIN, [resolve(HOOKS_DIR, hookFile)], {
    input: stdin,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    timeout: 5000,
  });
}

// ============================================================================
// 정상 환경 (override 없음) — 회귀 가드
// ============================================================================

describe('정상 환경 — enforceMinRuntime이 평상 흐름을 방해하지 않음', () => {
  it('pre-tool-use: Edit 워크스페이스 파일 → deny (정상 동작)', () => {
    const r = runHook('pre-tool-use.mjs', {
      stdin: JSON.stringify({
        tool_name: 'Edit',
        tool_input: { file_path: `${CC_ROOT}/CLAUDE.md` },
        cwd: CC_ROOT,
      }),
    });
    strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout);
    strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
  });

  it('branch-guard: 정상 Bash → pass-through (정상 동작)', () => {
    const r = runHook('branch-guard.mjs', {
      stdin: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        cwd: CC_ROOT,
      }),
    });
    strictEqual(r.status, 0);
  });
});

// ============================================================================
// 미달 시나리오 — CLAUDE_HOOK_MIN_NODE_TEST로 강제
// ============================================================================

describe('미달 시나리오 — preToolUse fail-close', () => {
  const env = { CLAUDE_HOOK_MIN_NODE_TEST: FAIL_VERSION };

  it('pre-tool-use: exit code 2 + stderr 메시지', () => {
    const r = runHook('pre-tool-use.mjs', {
      stdin: JSON.stringify({ tool_name: 'Read', tool_input: {}, cwd: '/' }),
      env,
    });
    strictEqual(r.status, 2);
    match(r.stderr, /\[CC hook\] Node \d+\+ 필요/);
    match(r.stderr, new RegExp(`현재: ${process.versions.node.replace(/\./g, '\\.')}`));
  });

  it('branch-guard: exit code 2 + stderr 메시지', () => {
    const r = runHook('branch-guard.mjs', {
      stdin: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: '/' }),
      env,
    });
    strictEqual(r.status, 2);
    match(r.stderr, /Node \d+\+ 필요/);
  });

  it('fail-close 시 stdout에 응답 JSON 없음 (호출자가 deny/allow로 오인 안 함)', () => {
    const r = runHook('pre-tool-use.mjs', {
      stdin: JSON.stringify({ tool_name: 'Read', tool_input: {}, cwd: '/' }),
      env,
    });
    strictEqual(r.stdout, '');
  });

  it('업그레이드 안내 메시지 포함', () => {
    const r = runHook('pre-tool-use.mjs', {
      stdin: JSON.stringify({ tool_name: 'Read', tool_input: {}, cwd: '/' }),
      env,
    });
    match(r.stderr, /brew install node@/);
  });
});

describe('미달 시나리오 — permissionRequest pass-through', () => {
  it('permission-handler: exit 0 + stdout에 {continue:true} + stderr 메시지', () => {
    const r = runHook('permission-handler.mjs', {
      stdin: JSON.stringify({
        tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: '/',
      }),
      env: { CLAUDE_HOOK_MIN_NODE_TEST: FAIL_VERSION },
    });
    strictEqual(r.status, 0);
    match(r.stderr, /Node \d+\+ 필요/);
    const parsed = JSON.parse(r.stdout.trim());
    strictEqual(parsed.continue, true);
  });
});

describe('미달 시나리오 — sessionStart fail-open', () => {
  it('session-start: exit 0 + stdout 메시지 + 세션 진행', () => {
    const r = runHook('session-start.mjs', {
      env: { CLAUDE_HOOK_MIN_NODE_TEST: FAIL_VERSION },
    });
    strictEqual(r.status, 0);
    match(r.stdout, /Node \d+\+ 필요/);
    // 후속 syncRepo 결과 메시지도 포함 (작업 브랜치 등). 미달이라고 세션 안 끊김.
    ok(r.stdout.length > 50);
  });
});

// ============================================================================
// 우회 환경변수
// ============================================================================

describe('CLAUDE_HOOK_SKIP_RUNTIME_CHECK', () => {
  it('=1 이면 미달 환경에서도 enforce가 통과', () => {
    const r = runHook('pre-tool-use.mjs', {
      stdin: JSON.stringify({
        tool_name: 'Edit',
        tool_input: { file_path: `${CC_ROOT}/CLAUDE.md` },
        cwd: CC_ROOT,
      }),
      env: {
        CLAUDE_HOOK_MIN_NODE_TEST: FAIL_VERSION,
        CLAUDE_HOOK_SKIP_RUNTIME_CHECK: '1',
      },
    });
    // 미달인데 우회 → 정상 흐름 진입 → Edit이 워크스페이스 외부라 deny
    strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout);
    strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
    strictEqual(r.stderr, '');
  });
});

// ============================================================================
// 보안: 우회 방향이 단방향(강화)임을 검증
// ============================================================================

describe('CLAUDE_HOOK_MIN_NODE_TEST 보안 (단방향)', () => {
  it('override 값이 현재 minMajor(20)보다 낮으면 무시 → 정상 통과', () => {
    const r = runHook('pre-tool-use.mjs', {
      stdin: JSON.stringify({
        tool_name: 'Read', tool_input: { file_path: '/tmp/x' }, cwd: '/',
      }),
      env: { CLAUDE_HOOK_MIN_NODE_TEST: '5' }, // 현재 node 메이저보다 낮음
    });
    strictEqual(r.status, 0);
    strictEqual(r.stderr, '');
  });
});
