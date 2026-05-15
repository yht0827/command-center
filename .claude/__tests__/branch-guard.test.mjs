#!/usr/bin/env node
/**
 * branch-guard 단위 테스트
 *
 * branch-guard.mjs의 핵심 로직을 검증한다:
 * - DENY_PATTERNS (^ 앵커) vs DENY_ANYWHERE (전체 문자열 검색)
 * - 보호 브랜치 commit/merge 감지 정규식
 * - stripEnvPrefix 후 매칭
 */

import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import {
  DENY_PATTERNS, DENY_ANYWHERE, PROTECTED_BRANCHES,
  matchesAny, stripEnvPrefix,
} from '../hooks/config.mjs';

// ============================================================================
// 1. DENY_PATTERNS — 단순 명령 매칭 (^ 앵커)
// ============================================================================

describe('DENY_PATTERNS (앵커 매칭)', () => {
  const cases = [
    // deny
    ['gh pr merge 1', true],
    ['gh pr close 1', true],
    ['gh pr reopen 1', true],
    ['gh pr review 1', true],
    ['gh issue close 1', true],
    ['gh issue reopen 1', true],
    ['gh api /repos/x -X POST', true],
    ['gh api /repos/x -X DELETE', true],
    ['gh api /repos/x -X PATCH', true],
    ['gh api /repos/x -X PUT', true],
    ['gh api /repos/x --method POST', true],
    ['gh api /repos/x --method DELETE', true],
    // allow (비파괴적)
    ['gh pr view 1', false],
    ['gh pr list', false],
    ['gh pr create --title "t"', false],
    ['gh pr edit 1 --title "t"', false],
    ['gh pr comment 1 --body "b"', false],
    ['gh issue create --title "t"', false],
    ['gh issue comment 1 --body "b"', false],
    ['gh api /repos/x', false],
    ['gh api /repos/x -X GET', false],
    ['gh api /repos/x --method GET', false],
  ];

  for (const [cmd, expected] of cases) {
    it(`${cmd} → ${expected ? 'deny' : 'pass'}`, () => {
      strictEqual(matchesAny(cmd, DENY_PATTERNS), expected);
    });
  }
});

// ============================================================================
// 2. DENY_ANYWHERE — 전체 문자열 검색 (서브셸/인터프리터 내부)
// ============================================================================

describe('DENY_ANYWHERE (전체 문자열 검색)', () => {
  const matchesDenyAnywhere = (cmd) => DENY_ANYWHERE.some(p => p.test(cmd));

  const cases = [
    // 직접 명령
    ['gh pr merge 1', true],
    ['gh issue close 1', true],
    // 서브셸 내부
    ['(cd /path && gh pr merge 1)', true],
    ['(cd /path && gh pr close 1)', true],
    ['(cd /path && gh issue close 1)', true],
    // 인터프리터 내부
    ['node -e "gh pr merge 1"', true],
    ['python3 -c "gh pr review 1"', true],
    ['node -e "gh api /repos/x -X POST"', true],
    // 비파괴적 → 통과
    ['node -e "gh pr view 1"', false],
    ['(cd /path && gh pr create --title "t")', false],
    ['node -e "gh pr comment 1"', false],
    ['node -e "gh pr edit 1"', false],
    ['node -e "gh issue comment 1"', false],
    // 부분 매칭이 아닌 패턴 확인
    // 'merge'가 'merged_at'의 부분 문자열로 매칭됨 (\b 없음)
    // 실제 gh 명령이 아니므로 false positive이지만 안전 측 동작
    ['gh pr merged_at', true],
    ['echo "gh pr merge는 금지"', true],  // 문자열에 패턴 포함
  ];

  for (const [cmd, expected] of cases) {
    it(`${cmd} → ${expected ? 'deny' : 'pass'}`, () => {
      strictEqual(matchesDenyAnywhere(cmd), expected);
    });
  }
});

// ============================================================================
// 3. DENY_PATTERNS vs DENY_ANYWHERE 차이
// ============================================================================

describe('DENY_PATTERNS vs DENY_ANYWHERE 차이', () => {
  const matchesPatterns = (cmd) => matchesAny(cmd, DENY_PATTERNS);
  const matchesAnywhere = (cmd) => DENY_ANYWHERE.some(p => p.test(cmd));

  it('직접 명령: 둘 다 매칭', () => {
    strictEqual(matchesPatterns('gh pr merge 1'), true);
    strictEqual(matchesAnywhere('gh pr merge 1'), true);
  });

  it('서브셸 내부: DENY_PATTERNS 미매칭, DENY_ANYWHERE 매칭', () => {
    const cmd = '(cd /path && gh pr merge 1)';
    strictEqual(matchesPatterns(cmd), false);  // ^ 앵커 때문에 매칭 안 됨
    strictEqual(matchesAnywhere(cmd), true);   // 문자열 전체에서 검색
  });

  it('인터프리터 내부: DENY_PATTERNS 미매칭, DENY_ANYWHERE 매칭', () => {
    const cmd = 'node -e "gh pr merge 1"';
    strictEqual(matchesPatterns(cmd), false);
    strictEqual(matchesAnywhere(cmd), true);
  });
});

// ============================================================================
// 4. 보호 브랜치 감지
// ============================================================================

describe('PROTECTED_BRANCHES', () => {
  const cases = [
    ['main', true],
    ['master', true],
    ['develop', true],
    ['feat/login', false],
    ['fix/main-bug', false],      // 'main'을 포함하지만 정확 매칭 아님
    ['main-feature', false],
    ['develop/v2', false],
    ['release/1.0', false],
    ['', false],
  ];

  for (const [branch, expected] of cases) {
    it(`${branch || '(empty)'} → ${expected ? 'protected' : 'not protected'}`, () => {
      strictEqual(PROTECTED_BRANCHES.test(branch), expected);
    });
  }
});

// ============================================================================
// 5. git commit/merge 정규식 (branch-guard 내부 로직)
// ============================================================================

describe('git commit 감지 정규식', () => {
  const GIT_COMMIT = /\bgit\b\s+(-C\s+\S+\s+)?commit\b/;

  const cases = [
    ['git commit -m "msg"', true],
    ['git commit --amend', true],
    ['git -C /path commit -m "msg"', true],
    ['git -C projects/foo/main commit', true],
    ['git status', false],
    ['git committed', false],          // commit 뒤에 글자가 이어지면 \b로 차단
    ['echo git commit', true],         // 중간에도 매칭 (DENY_ANYWHERE와 유사)
    ['GH_HOST=x git commit', true],    // env prefix 후에도 매칭
  ];

  for (const [cmd, expected] of cases) {
    it(`${cmd} → ${expected ? 'match' : 'no match'}`, () => {
      const effective = stripEnvPrefix(cmd.trim());
      strictEqual(GIT_COMMIT.test(effective), expected);
    });
  }
});

describe('git merge 감지 정규식', () => {
  const GIT_MERGE = /\bgit\b\s+(-C\s+\S+\s+)?merge\b/;

  const cases = [
    ['git merge feature', true],
    ['git merge --no-ff feature', true],
    ['git -C /path merge feature', true],
    ['git status', false],
    ['git merged', false],
    ['git rebase', false],
  ];

  for (const [cmd, expected] of cases) {
    it(`${cmd} → ${expected ? 'match' : 'no match'}`, () => {
      const effective = stripEnvPrefix(cmd.trim());
      strictEqual(GIT_MERGE.test(effective), expected);
    });
  }
});

// ============================================================================
// 6. env prefix + deny 패턴 조합
// ============================================================================

describe('env prefix + deny 패턴', () => {
  it('GH_HOST=x gh pr merge → DENY_PATTERNS 매칭 (stripEnvPrefix)', () => {
    strictEqual(matchesAny('GH_HOST=github.com gh pr merge 1', DENY_PATTERNS), true);
  });

  it('env GH_HOST=x gh issue close → DENY_PATTERNS 매칭', () => {
    strictEqual(matchesAny('env GH_HOST=github.com gh issue close 1', DENY_PATTERNS), true);
  });

  it('다중 env prefix → DENY_PATTERNS 매칭', () => {
    strictEqual(matchesAny('A=1 B=2 gh pr merge 1', DENY_PATTERNS), true);
  });

  it('env prefix + 비파괴적 → 통과', () => {
    strictEqual(matchesAny('GH_HOST=x gh pr view 1', DENY_PATTERNS), false);
  });
});
