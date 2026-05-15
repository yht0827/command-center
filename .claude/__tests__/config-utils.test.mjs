#!/usr/bin/env node
/**
 * config.mjs 유틸리티 함수 단위 테스트
 *
 * permission-handler.test.mjs에서 커버하지 않는 유틸 함수들을 테스트한다:
 * - extractPipeSegments()
 * - extractChainedCommands()
 * - extractFlatChain()
 * - stripEnvPrefix()
 * - isInsideCC() — pre-tool-use.test.mjs와 중복 없이 엣지 케이스만
 */

import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import {
  extractPipeSegments,
  extractChainedCommands,
  extractFlatChain,
  stripEnvPrefix,
  ENV_PREFIX,
  computeRuntimeDecision,
} from '../hooks/config.mjs';

// ============================================================================
// 1. stripEnvPrefix
// ============================================================================

describe('stripEnvPrefix', () => {
  it('단일 환경변수 제거', () => {
    strictEqual(stripEnvPrefix('GH_HOST=github.com gh pr view'), 'gh pr view');
  });

  it('다중 환경변수 제거', () => {
    strictEqual(stripEnvPrefix('A=1 B=2 C=3 git status'), 'git status');
  });

  it('env 접두사 + 환경변수 제거', () => {
    strictEqual(stripEnvPrefix('env GH_HOST=x gh pr view'), 'gh pr view');
  });

  it('환경변수 없으면 그대로', () => {
    strictEqual(stripEnvPrefix('git status'), 'git status');
  });

  it('값에 = 포함 (URL 등)', () => {
    strictEqual(stripEnvPrefix('VAR=a=b cmd'), 'cmd');
  });

  it('언더스코어 변수명', () => {
    strictEqual(stripEnvPrefix('MY_VAR_123=value cmd arg'), 'cmd arg');
  });

  it('숫자로 시작하는 변수는 제거하지 않음', () => {
    strictEqual(stripEnvPrefix('123=val cmd'), '123=val cmd');
  });

  it('빈 값 환경변수', () => {
    // VAR= cmd → VAR=이 ENV_PREFIX에 매칭되려면 \S* 이므로 빈 값도 매칭
    // 하지만 뒤에 공백+명령이 없으면 매칭 안 됨
    const result = stripEnvPrefix('VAR= cmd');
    // VAR= 는 [^\s]* 에서 빈 문자열 매칭, 뒤에 공백 + cmd
    // ENV_PREFIX: /^(env\s+)?([a-zA-Z_][a-zA-Z_0-9]*=[^\s]*\s+)+/
    // VAR=<empty>\s+cmd → [^\s]* 매칭 → 공백 → 나머지
    strictEqual(result, 'cmd');
  });
});

// ============================================================================
// 2. extractPipeSegments
// ============================================================================

describe('extractPipeSegments', () => {
  it('단순 파이프 분할', () => {
    deepStrictEqual(extractPipeSegments('ls | grep foo'), ['ls', 'grep foo']);
  });

  it('다단 파이프', () => {
    deepStrictEqual(
      extractPipeSegments('git log --oneline | head -20 | grep fix'),
      ['git log --oneline', 'head -20', 'grep fix']
    );
  });

  it('|| (OR)는 파이프가 아님', () => {
    strictEqual(extractPipeSegments('cmd1 || cmd2'), null);
  });

  it('| 와 || 혼합', () => {
    const result = extractPipeSegments('cmd1 | grep x || echo fail');
    // | 는 분할하지만 || 은 분할하지 않음
    deepStrictEqual(result, ['cmd1', 'grep x || echo fail']);
  });

  it('파이프 없으면 null', () => {
    strictEqual(extractPipeSegments('git status'), null);
  });

  it('FD 리다이렉트(2>&1)는 파이프가 아님', () => {
    const result = extractPipeSegments('cmd 2>&1 | grep err');
    deepStrictEqual(result, ['cmd 2>&1', 'grep err']);
  });

  it('FD 리다이렉트만 있으면 null', () => {
    strictEqual(extractPipeSegments('cmd 2>&1'), null);
  });

  it('인용문 내 | 는 분할하지 않음', () => {
    strictEqual(extractPipeSegments('echo "a|b"'), null);
  });

  it('단일 인용문 내 | 는 분할하지 않음', () => {
    strictEqual(extractPipeSegments("echo 'a|b'"), null);
  });

  it('인용문 밖 | 만 분할', () => {
    const result = extractPipeSegments('echo "a|b" | grep a');
    deepStrictEqual(result, ['echo "a|b"', 'grep a']);
  });

  it('괄호 내부의 | 는 분할하지 않음', () => {
    const result = extractPipeSegments('(cmd1 | cmd2) | grep x');
    // 괄호 depth 1인 | 는 건너뛰고, 최상위 | 만 분할
    deepStrictEqual(result, ['(cmd1 | cmd2)', 'grep x']);
  });

  it('짝 안 맞는 인용문 → 분할 (안전 측)', () => {
    // 이스케이프된 인용문 미처리 → 더 일찍 닫힘 → 안전 측 분할
    // 실제 동작은 구현에 따라 다를 수 있으나, null이 아니면 호출자가 판단
    const result = extractPipeSegments('echo "a | grep b');
    // 구현: 인용문이 닫히지 않으면 마지막까지 인용문으로 처리
    // " 이후 끝까지 인용문 → | 가 인용문 내부 → 분할 없음
    strictEqual(result, null);
  });
});

// ============================================================================
// 3. extractChainedCommands
// ============================================================================

describe('extractChainedCommands', () => {
  it('&& 체인 분할', () => {
    deepStrictEqual(
      extractChainedCommands('git add . && git commit -m "msg"'),
      ['git add .', 'git commit -m "msg"']
    );
  });

  it('|| 체인 분할', () => {
    deepStrictEqual(
      extractChainedCommands('test -f file || echo "missing"'),
      ['test -f file', 'echo "missing"']
    );
  });

  it('; 체인 분할', () => {
    deepStrictEqual(
      extractChainedCommands('git status; git diff'),
      ['git status', 'git diff']
    );
  });

  it('혼합 체인', () => {
    deepStrictEqual(
      extractChainedCommands('cmd1 && cmd2 || cmd3; cmd4'),
      ['cmd1', 'cmd2', 'cmd3', 'cmd4']
    );
  });

  it('구분자 없으면 null', () => {
    strictEqual(extractChainedCommands('git status'), null);
  });

  it('셸 확장($VAR) 포함 → null', () => {
    strictEqual(extractChainedCommands('echo $HOME && ls'), null);
  });

  it('셸 확장(${VAR}) 포함 → null', () => {
    strictEqual(extractChainedCommands('echo ${HOME} && ls'), null);
  });

  it('$() 커맨드 치환 → null', () => {
    strictEqual(extractChainedCommands('echo $(date) && ls'), null);
  });

  it('backtick → null', () => {
    strictEqual(extractChainedCommands('echo `date` && ls'), null);
  });

  it('괄호 포함 → null', () => {
    strictEqual(extractChainedCommands('(cd dir && cmd) && ls'), null);
  });

  it('인용문 내 && 는 분할하지 않음', () => {
    deepStrictEqual(
      extractChainedCommands('echo "a && b" && ls'),
      ['echo "a && b"', 'ls']
    );
  });

  it('인용문 내 ; 는 분할하지 않음', () => {
    deepStrictEqual(
      extractChainedCommands('echo "a; b" && ls'),
      ['echo "a; b"', 'ls']
    );
  });

  it('인용문 내 || 는 분할하지 않음', () => {
    deepStrictEqual(
      extractChainedCommands('echo "a || b" && ls'),
      ['echo "a || b"', 'ls']
    );
  });

  it('단독 | (파이프) 포함 → null', () => {
    strictEqual(extractChainedCommands('ls | grep && echo ok'), null);
  });

  it('정규식 앵커 $ → 허용 (셸 확장 아님)', () => {
    const result = extractChainedCommands('grep "pattern$" file && echo ok');
    deepStrictEqual(result, ['grep "pattern$" file', 'echo ok']);
  });

  it('단일 인용문 내 $ → 허용', () => {
    const result = extractChainedCommands("grep '$HOME' file && echo ok");
    deepStrictEqual(result, ["grep '$HOME' file", 'echo ok']);
  });

  it('개행 포함 → null', () => {
    strictEqual(extractChainedCommands('cmd1 &&\ncmd2'), null);
  });
});

// ============================================================================
// 4. extractFlatChain
// ============================================================================

describe('extractFlatChain', () => {
  it('괄호 평탄화 + 분할', () => {
    deepStrictEqual(
      extractFlatChain('(cd dir && cmd1) && cmd2'),
      ['cd dir', 'cmd1', 'cmd2']
    );
  });

  it('중첩 괄호 평탄화', () => {
    deepStrictEqual(
      extractFlatChain('((cmd1 && cmd2)) && cmd3'),
      ['cmd1', 'cmd2', 'cmd3']
    );
  });

  it('|| 구분 + 괄호', () => {
    deepStrictEqual(
      extractFlatChain('(cmd1 || cmd2) && cmd3'),
      ['cmd1', 'cmd2', 'cmd3']
    );
  });

  it('인용문 내 괄호는 보존', () => {
    const result = extractFlatChain('echo "(hello)" && ls');
    deepStrictEqual(result, ['echo "(hello)"', 'ls']);
  });

  it('셸 확장 → null', () => {
    strictEqual(extractFlatChain('echo $HOME && ls'), null);
  });

  it('괄호 짝 안 맞음 → null', () => {
    strictEqual(extractFlatChain('(cmd && ls'), null);
  });

  it('구분자 없으면 null', () => {
    strictEqual(extractFlatChain('git status'), null);
  });

  it('파이프(|) 포함 → null', () => {
    strictEqual(extractFlatChain('ls | grep && echo'), null);
  });

  it('개행 포함 → null', () => {
    strictEqual(extractFlatChain('cmd1 &&\ncmd2'), null);
  });

  it('; 구분자 + 괄호', () => {
    deepStrictEqual(
      extractFlatChain('(cd dir && cmd1); cmd2'),
      ['cd dir', 'cmd1', 'cmd2']
    );
  });

  it('정규식 앵커 $ (인용문 내) → 허용', () => {
    const result = extractFlatChain('grep "end$" file && echo ok');
    deepStrictEqual(result, ['grep "end$" file', 'echo ok']);
  });

  it('인용문 내 && 는 분할하지 않음', () => {
    const result = extractFlatChain('echo "a && b" && ls');
    deepStrictEqual(result, ['echo "a && b"', 'ls']);
  });
});

// ============================================================================
// computeRuntimeDecision — 최소 Node 버전 정책
// ============================================================================

describe('computeRuntimeDecision', () => {
  describe('minMajor 미설정 또는 통과', () => {
    it('minMajor가 undefined면 ok', () => {
      deepStrictEqual(computeRuntimeDecision('preToolUse', undefined, '22.22.2'), { ok: true });
    });
    it('minMajor가 0이면 ok (falsy 처리)', () => {
      deepStrictEqual(computeRuntimeDecision('preToolUse', 0, '22.22.2'), { ok: true });
    });
    it('현재 == 최소면 ok', () => {
      deepStrictEqual(computeRuntimeDecision('preToolUse', 22, '22.0.0'), { ok: true });
    });
    it('현재 > 최소면 ok', () => {
      deepStrictEqual(computeRuntimeDecision('preToolUse', 20, '22.22.2'), { ok: true });
    });
  });

  describe('미달 시 mode별 정책', () => {
    it('preToolUse → failClose', () => {
      const r = computeRuntimeDecision('preToolUse', 20, '18.12.1');
      strictEqual(r.ok, false);
      strictEqual(r.action, 'failClose');
      strictEqual(r.message.includes('Node 20+ 필요'), true);
      strictEqual(r.message.includes('18.12.1'), true);
    });
    it('permissionRequest → passThrough', () => {
      const r = computeRuntimeDecision('permissionRequest', 20, '18.12.1');
      strictEqual(r.ok, false);
      strictEqual(r.action, 'passThrough');
    });
    it('sessionStart → warn (fail-open)', () => {
      const r = computeRuntimeDecision('sessionStart', 20, '18.12.1');
      strictEqual(r.ok, false);
      strictEqual(r.action, 'warn');
    });
    it('알 수 없는 mode → failClose 기본', () => {
      const r = computeRuntimeDecision('unknown', 20, '18.12.1');
      strictEqual(r.ok, false);
      strictEqual(r.action, 'failClose');
    });
  });

  describe('메시지 포맷', () => {
    it('업그레이드 안내 포함', () => {
      const r = computeRuntimeDecision('preToolUse', 20, '18.12.1');
      strictEqual(r.message.includes('brew install node@20'), true);
      strictEqual(r.message.includes('nvm'), true);
    });
  });
});
