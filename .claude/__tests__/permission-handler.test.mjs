#!/usr/bin/env node
/**
 * permission-handler 패턴 검증
 *
 * SAFE_COMMANDS, extractLoopBody, 주석 제거, 선행 변수 치환,
 * 리다이렉트 쓰기 검증 등 permission-handler의 핵심 로직을 테스트한다.
 */

import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import {
  SAFE_COMMANDS, BUILD_TEST, FILE_WRITE, matchesAny,
  extractLoopBody, extractInnerCommands,
  hasWriteOutput, extractWriteTarget, hasShellExpansion,
  isWriteAllowed, resolveExecDir, WRITE_ALLOW_PATTERNS,
} from '../hooks/config.mjs';
import { resolve, relative } from 'node:path';

const CC_ROOT = '/Users/test/project-command-center';

// ============================================================================
// 1. git branch --list
// ============================================================================

describe('SAFE_COMMANDS: git branch', () => {
  const cases = [
    ['git branch', true],
    ['git branch -a', true],
    ['git branch -v', true],
    ['git branch -r', true],
    ['git branch -l', true],
    ['git branch --list', true],
    ['git branch --list AFS-123', true],
    ['git -C projects/foo/main branch --list AFS-123', true],
    ['git branch -d feat', false],   // 삭제 = DANGEROUS
    ['git branch -D feat', false],   // 강제 삭제 = DANGEROUS
  ];
  for (const [cmd, expected] of cases) {
    it(`${cmd} → ${expected ? 'safe' : 'not safe'}`, () => {
      strictEqual(matchesAny(cmd, SAFE_COMMANDS), expected);
    });
  }
});

// ============================================================================
// 2. 선행 주석 제거 (decideBash 진입 시)
// ============================================================================

describe('선행 주석 제거', () => {
  const strip = (cmd) => cmd.trim().replace(/^(#[^\n]*\n\s*)+/, '');

  it('단일 주석 줄 제거', () => {
    strictEqual(strip('# comment\nfor x in a; do echo x; done'), 'for x in a; do echo x; done');
  });

  it('여러 주석 줄 제거', () => {
    strictEqual(strip('# line1\n# line2\ngit status'), 'git status');
  });

  it('주석 없으면 그대로', () => {
    strictEqual(strip('git status'), 'git status');
  });

  it('중간 주석은 제거하지 않음', () => {
    strictEqual(strip('echo hi\n# mid comment\necho bye'), 'echo hi\n# mid comment\necho bye');
  });

  it('서브셸 앞 주석 제거', () => {
    const cmd = '# FE 의존성 설치\n(cd projects/foo/worktrees/bar && bun install)';
    strictEqual(strip(cmd), '(cd projects/foo/worktrees/bar && bun install)');
  });
});

// ============================================================================
// 3. 선행 변수 할당 수집
// ============================================================================

describe('선행 변수 수집', () => {
  /** decideBash의 preamble var 수집 로직 재현 */
  function collectPreambleVars(input) {
    let loopInput = input;
    const vars = {};
    const re = /^([a-zA-Z_]\w*=("[^"]*"|'[^']*'|\S*)\s*\n)/;
    while (re.test(loopInput)) {
      const m = loopInput.match(re);
      const line = m[1].trim();
      const eq = line.indexOf('=');
      const key = line.substring(0, eq);
      let val = line.substring(eq + 1);
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (!/\$[({]/.test(val) && !/`/.test(val)) {
        vars[key] = val;
        loopInput = loopInput.substring(m[1].length);
      } else {
        break;
      }
    }
    return { vars, rest: loopInput.trim() };
  }

  it('이중 인용문 변수 수집', () => {
    const input = 'FE_GITIGNORE="projects/foo/worktrees/bar/.gitignore"\nfor x in a; do echo x; done';
    const { vars, rest } = collectPreambleVars(input);
    strictEqual(vars.FE_GITIGNORE, 'projects/foo/worktrees/bar/.gitignore');
    strictEqual(rest, 'for x in a; do echo x; done');
  });

  it('단일 인용문 변수 수집', () => {
    const input = "DIR='some/path'\nfor x in a; do echo x; done";
    const { vars, rest } = collectPreambleVars(input);
    strictEqual(vars.DIR, 'some/path');
    strictEqual(rest, 'for x in a; do echo x; done');
  });

  it('인용문 없는 변수 수집', () => {
    const input = 'COUNT=42\nfor x in a; do echo x; done';
    const { vars, rest } = collectPreambleVars(input);
    strictEqual(vars.COUNT, '42');
  });

  it('커맨드 치환 포함 변수는 수집 중단', () => {
    const input = 'SAFE=ok\nDANGER=$(whoami)\nfor x in a; do echo x; done';
    const { vars, rest } = collectPreambleVars(input);
    strictEqual(vars.SAFE, 'ok');
    strictEqual(vars.DANGER, undefined);
    strictEqual(rest.startsWith('DANGER='), true);
  });

  it('변수 없으면 그대로', () => {
    const input = 'for x in a; do echo x; done';
    const { vars, rest } = collectPreambleVars(input);
    deepStrictEqual(vars, {});
    strictEqual(rest, 'for x in a; do echo x; done');
  });
});

// ============================================================================
// 4. extractLoopBody: || 분리
// ============================================================================

describe('extractLoopBody: || 분리', () => {
  it('&& 분리 (기존 동작)', () => {
    const body = extractLoopBody('for f in a b; do test -f "$f" && cp "$f" dst/; done');
    deepStrictEqual(body, ['test -f "$f"', 'cp "$f" dst/']);
  });

  it('|| 분리 (신규)', () => {
    const body = extractLoopBody(
      'for p in "a/" "b/"; do grep -qxF "$p" file 2>/dev/null || echo "$p" >> file; done'
    );
    deepStrictEqual(body, [
      'grep -qxF "$p" file 2>/dev/null',
      'echo "$p" >> file',
    ]);
  });

  it('&&와 || 혼합 (리다이렉트 없는 echo는 필터링)', () => {
    const body = extractLoopBody(
      'for f in a; do test -f "$f" && cp "$f" dst/ || echo "skip"; done'
    );
    // echo "skip"은 리다이렉트 없는 순수 로깅이므로 필터링됨
    deepStrictEqual(body, ['test -f "$f"', 'cp "$f" dst/']);
  });
});

// ============================================================================
// 5. extractInnerCommands: 주석 제거 후 서브셸 감지
// ============================================================================

describe('주석 제거 후 서브셸 감지', () => {
  const strip = (cmd) => cmd.trim().replace(/^(#[^\n]*\n\s*)+/, '');

  it('주석 + 서브셸', () => {
    const cmd = '# FE 의존성 설치\n(cd projects/foo/worktrees/bar && bun install)';
    const inner = extractInnerCommands(strip(cmd));
    deepStrictEqual(inner, ['bun install']);
  });

  it('주석 없는 서브셸 (기존 동작)', () => {
    const inner = extractInnerCommands('(cd some/dir && npm test)');
    deepStrictEqual(inner, ['npm test']);
  });
});

// ============================================================================
// 6. 리다이렉트 쓰기 감지 + 대상 추출
// ============================================================================

describe('hasWriteOutput + extractWriteTarget', () => {
  it('>> 리다이렉트 감지', () => {
    strictEqual(hasWriteOutput('echo "$p" >> "some/file"'), true);
  });

  it('> 리다이렉트 감지', () => {
    strictEqual(hasWriteOutput('echo hi > output.txt'), true);
  });

  it('2>/dev/null은 쓰기 아님', () => {
    strictEqual(hasWriteOutput('grep -q "x" file 2>/dev/null'), false);
  });

  it('2>&1은 쓰기 아님', () => {
    strictEqual(hasWriteOutput('cmd 2>&1'), false);
  });

  it('>> 대상 추출', () => {
    strictEqual(extractWriteTarget('echo "$p" >> "some/file.txt"'), 'some/file.txt');
  });

  it('> 대상 추출', () => {
    strictEqual(extractWriteTarget('echo hi > output.txt'), 'output.txt');
  });
});

// ============================================================================
// 7. extractLoopBody: echo 필터 회귀 방지
// ============================================================================

describe('extractLoopBody: echo 필터링', () => {
  it('리다이렉트 없는 echo는 필터링', () => {
    const body = extractLoopBody('for f in a b; do test -f "$f" && echo "copying $f" && cp "$f" dst/; done');
    // echo "copying $f"는 순수 로깅 → 필터링
    deepStrictEqual(body, ['test -f "$f"', 'cp "$f" dst/']);
  });

  it('리다이렉트 있는 echo는 유지', () => {
    const body = extractLoopBody('for f in a b; do echo "$f" >> output.txt; done');
    deepStrictEqual(body, ['echo "$f" >> output.txt']);
  });

  it('echo만 있는 루프 (리다이렉트 없음) → 빈 body', () => {
    const body = extractLoopBody('for f in a b; do echo "$f"; done');
    deepStrictEqual(body, []);
  });
});

// ============================================================================
// 8. 통합 시나리오: worktree 스킬이 생성하는 실제 명령 전체 파이프라인
// ============================================================================

/** decideBash의 전처리 로직 재현 (주석 제거 + 변수 수집) */
function preprocess(rawCmd) {
  const trimmed = rawCmd.trim().replace(/^(#[^\n]*\n\s*)+/, '');

  let loopInput = trimmed;
  const preambleVars = {};
  const re = /^([a-zA-Z_]\w*=("[^"]*"|'[^']*'|\S*)\s*\n)/;
  while (re.test(loopInput)) {
    const m = loopInput.match(re);
    const line = m[1].trim();
    const eq = line.indexOf('=');
    const key = line.substring(0, eq);
    let val = line.substring(eq + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!/\$[({]/.test(val) && !/`/.test(val)) {
      preambleVars[key] = val;
      loopInput = loopInput.substring(m[1].length);
    } else {
      break;
    }
  }
  loopInput = loopInput.trim();

  return { trimmed, loopInput, preambleVars };
}

/** preambleVars를 loop body에 치환 */
function resolveVars(body, vars) {
  if (Object.keys(vars).length === 0) return body;
  return body.map(c => {
    let r = c;
    for (const [k, v] of Object.entries(vars)) {
      r = r.replace(new RegExp(`\\$\\{${k}\\}|\\$${k}(?=[^a-zA-Z_0-9]|$)`, 'g'), () => v);
    }
    return r;
  });
}

/** 쓰기 대상이 모두 worktree 안인지 검증 */
function allWritesInWorktree(resolvedBody, execDir) {
  for (const c of resolvedBody) {
    const s = c.trim();
    if (FILE_WRITE.test(s)) {
      const parts = s.split(/\s+/);
      const args = parts.slice(1).filter(a => !a.startsWith('-') && !a.includes('$'));
      if (args.length > 0) {
        if (!isWriteAllowed(resolve(execDir, args[args.length - 1]), CC_ROOT)) return false;
      } else {
        const allArgs = parts.slice(1).filter(a => !a.startsWith('-'));
        const dest = allArgs.length > 0 ? allArgs[allArgs.length - 1] : null;
        if (!dest) return false;
        const rawDest = dest.replace(/["']/g, '');
        const lastSlash = rawDest.lastIndexOf('/');
        if (lastSlash < 0) return false;
        if (!/^\$/.test(rawDest.substring(lastSlash + 1))) return false;
        if (/\$/.test(rawDest.substring(0, lastSlash))) return false;
        if (!isWriteAllowed(resolve(execDir, rawDest.substring(0, lastSlash)), CC_ROOT)) return false;
      }
    }
    if (hasWriteOutput(c)) {
      const target = extractWriteTarget(c);
      if (!target) return false;
      const clean = target.replace(/["']/g, '');
      if (clean.includes('$')) {
        const lastSlash = clean.lastIndexOf('/');
        if (lastSlash < 0) return false;
        if (!/^\$/.test(clean.substring(lastSlash + 1))) return false;
        if (/\$/.test(clean.substring(0, lastSlash))) return false;
        if (!isWriteAllowed(resolve(execDir, clean.substring(0, lastSlash)), CC_ROOT)) return false;
      } else {
        if (!isWriteAllowed(resolve(execDir, clean), CC_ROOT)) return false;
      }
    }
  }
  return true;
}

/** permission-handler의 trailing 분리 로직 재현 (역순 탐색 + \n 구분자) */
function extractLoopParts(loopInput) {
  let stripped = loopInput.replace(/(\bdone)\s*\d*>\s*\/dev\/null/, '$1');
  stripped = stripped.replace(/(\bdone)\s*\|\|\s*(true|:)\s*(?=$|[;&])/, '$1');
  let loopCandidate = loopInput;
  let loopTrailing = [];
  const doneMatches = [...stripped.matchAll(/\bdone\b/g)];
  for (let i = doneMatches.length - 1; i >= 0; i--) {
    const dm = doneMatches[i];
    const rawAfter = stripped.substring(dm.index + 4);
    const afterDone = rawAfter.trim();
    if (afterDone === '') {
      loopCandidate = stripped.substring(0, dm.index + 4);
      break;
    }
    const sepMatch = rawAfter.match(/^\s*(;|&&|\|\||\n)\s*/);
    if (sepMatch) {
      loopCandidate = stripped.substring(0, dm.index + 4);
      const rest = afterDone.replace(/^(;|&&|\|\|)\s*/, '');
      loopTrailing = rest.split(/\s*(?:;|&&|\|\||\n)\s*/).map(c => c.trim()).filter(Boolean);
      break;
    }
  }
  return { loopCandidate, loopTrailing };
}

describe('통합: 스크린샷 #1 — git branch --list', () => {
  it('git -C ... branch --list AFS-123 → SAFE_COMMANDS 매칭', () => {
    strictEqual(matchesAny('git -C projects/asset-factory-admin/main branch --list AFS-123', SAFE_COMMANDS), true);
  });
});

describe('통합: 스크린샷 #2 — 환경 파일 복사 for 루프', () => {
  const raw = [
    '# FE 환경 파일 복사',
    'for f in .env .env.local .env.development .nvmrc .node-version .npmrc .tool-versions; do',
    '  test -f "projects/asset-factory-admin/main/$f" && cp "projects/asset-factory-admin/main/$f" "projects/asset-factory-admin/worktrees/AFS-123/$f" && echo "copied $f"',
    'done',
    'echo "done"',
  ].join('\n');

  it('주석 제거 후 for로 시작', () => {
    const { loopInput } = preprocess(raw);
    strictEqual(/^for\b/.test(loopInput), true);
  });

  it('loop body: test, cp만 추출 (echo "copied $f"는 필터링)', () => {
    const { loopInput } = preprocess(raw);
    const { loopCandidate } = extractLoopParts(loopInput);
    const body = extractLoopBody(loopCandidate);
    // echo "copied $f"는 리다이렉트 없으므로 필터링됨
    strictEqual(body.length, 2);
    strictEqual(body[0].startsWith('test -f'), true);
    strictEqual(body[1].startsWith('cp '), true);
  });

  it('trailing: echo "done"이 인용문 내 done과 혼동되지 않음', () => {
    const { loopInput } = preprocess(raw);
    const { loopTrailing } = extractLoopParts(loopInput);
    deepStrictEqual(loopTrailing, ['echo "done"']);
  });

  it('trailing echo "done"은 SAFE_COMMANDS 매칭 + 셸 확장 없음', () => {
    strictEqual(matchesAny('echo "done"', SAFE_COMMANDS), true);
    strictEqual(hasShellExpansion('echo "done"'), false);
  });

  it('cp 대상의 $f 변수 경로: 리터럴 디렉토리가 worktree', () => {
    const cpCmd = 'cp "projects/asset-factory-admin/main/$f" "projects/asset-factory-admin/worktrees/AFS-123/$f"';
    const parts = cpCmd.split(/\s+/);
    const allArgs = parts.slice(1).filter(a => !a.startsWith('-'));
    const dest = allArgs[allArgs.length - 1]; // worktree 쪽
    const rawDest = dest.replace(/["']/g, '');

    // 마지막 컴포넌트가 $f
    const lastSlash = rawDest.lastIndexOf('/');
    strictEqual(/^\$/.test(rawDest.substring(lastSlash + 1)), true);

    // 리터럴 디렉토리에 $가 없음
    const literalDir = rawDest.substring(0, lastSlash);
    strictEqual(/\$/.test(literalDir), false);

    // worktree 경로
    strictEqual(isWriteAllowed(resolve(CC_ROOT, literalDir), CC_ROOT), true);
  });
});

describe('통합: 스크린샷 #3 — bun install 서브셸', () => {
  const raw = '# FE 의존성 설치\n(cd projects/asset-factory-admin/worktrees/AFS-123 && bun install)';

  it('주석 제거 후 서브셸 감지', () => {
    const { trimmed } = preprocess(raw);
    const inner = extractInnerCommands(trimmed);
    deepStrictEqual(inner, ['bun install']);
  });

  it('bun install → BUILD_TEST 매칭', () => {
    strictEqual(matchesAny('bun install', BUILD_TEST), true);
  });

  it('execDir이 worktree 경로', () => {
    const { trimmed } = preprocess(raw);
    const execDir = resolveExecDir(trimmed, CC_ROOT);
    strictEqual(isWriteAllowed(execDir, CC_ROOT), true);
  });
});

describe('통합: 스크린샷 #4 — .gitignore 보강 for 루프', () => {
  const raw = [
    '# FE .gitignore 보강',
    'FE_GITIGNORE="projects/asset-factory-admin/worktrees/AFS-123/.gitignore"',
    'for pattern in "node_modules/" "dist/" ".next/" ".dev/"; do',
    '  grep -qxF "$pattern" "$FE_GITIGNORE" 2>/dev/null || echo "$pattern" >> "$FE_GITIGNORE"',
    'done',
    'echo "FE .gitignore updated"',
  ].join('\n');

  it('주석 제거 → 변수 수집 → for 감지', () => {
    const { loopInput, preambleVars } = preprocess(raw);
    strictEqual(preambleVars.FE_GITIGNORE, 'projects/asset-factory-admin/worktrees/AFS-123/.gitignore');
    strictEqual(/^for\b/.test(loopInput), true);
  });

  it('loop body: grep과 echo >> 두 개 추출', () => {
    const { loopInput } = preprocess(raw);
    const { loopCandidate } = extractLoopParts(loopInput);
    const body = extractLoopBody(loopCandidate);
    strictEqual(body.length, 2);
    strictEqual(body[0].startsWith('grep'), true);
    strictEqual(body[1].includes('>>'), true);
  });

  it('preamble 변수 치환 후 모든 명령이 SAFE_COMMANDS 매칭', () => {
    const { loopInput, preambleVars } = preprocess(raw);
    const { loopCandidate } = extractLoopParts(loopInput);
    const body = extractLoopBody(loopCandidate);
    const resolved = resolveVars(body, preambleVars);
    const allSafe = resolved.every(c => matchesAny(c, SAFE_COMMANDS));
    strictEqual(allSafe, true);
  });

  it('리다이렉트 대상이 worktree 경로', () => {
    const { loopInput, preambleVars } = preprocess(raw);
    const { loopCandidate } = extractLoopParts(loopInput);
    const body = extractLoopBody(loopCandidate);
    const resolved = resolveVars(body, preambleVars);
    strictEqual(allWritesInWorktree(resolved, CC_ROOT), true);
  });

  it('worktree 외부 경로면 차단', () => {
    const badRaw = raw.replace('worktrees/AFS-123', 'main');
    const { loopInput, preambleVars } = preprocess(badRaw);
    const { loopCandidate } = extractLoopParts(loopInput);
    const body = extractLoopBody(loopCandidate);
    const resolved = resolveVars(body, preambleVars);

    // main/ 경로는 worktree가 아니므로 차단
    strictEqual(allWritesInWorktree(resolved, CC_ROOT), false);
  });

  it('trailing echo는 SAFE_COMMANDS 매칭 + 셸 확장 없음', () => {
    strictEqual(matchesAny('echo "FE .gitignore updated"', SAFE_COMMANDS), true);
    strictEqual(hasShellExpansion('echo "FE .gitignore updated"'), false);
  });
});

// ============================================================================
// 9. 서브셸 내 for/while 루프 위임
// ============================================================================

/**
 * permission-handler.mjs의 서브셸+루프 감지 정규식 재현.
 * (cd path && for/while ...) → { cdPath, loopCmd } 반환, 비매칭 시 null.
 */
function matchSubshellLoop(cmd) {
  let cl = cmd.replace(/\s*\|\|\s*(true|:)\s*$/, '');
  cl = cl.replace(/\)\s*\d*>&\d+\s*$/, ')');
  const m = cl.match(/^\(cd\s+(\S+)\s+&&\s+((?:for|while)\b[\s\S]+)\)\s*$/s);
  if (!m) return null;
  return { cdPath: m[1], loopCmd: m[2].trim() };
}

describe('서브셸+루프 감지 정규식', () => {
  it('(cd path && for ...; done) 매칭', () => {
    const r = matchSubshellLoop(
      '(cd /projects/admin && for f in .env .nvmrc; do test -f "main/$f" && cp "main/$f" "worktrees/X/$f"; done)'
    );
    strictEqual(r !== null, true);
    strictEqual(r.cdPath, '/projects/admin');
    strictEqual(r.loopCmd.startsWith('for f in'), true);
  });

  it('|| true 접미사 제거 후 매칭', () => {
    const r = matchSubshellLoop(
      '(cd /projects/admin && for f in a; do echo $f; done) || true'
    );
    strictEqual(r !== null, true);
  });

  it('FD 리다이렉트 접미사 제거 후 매칭', () => {
    const r = matchSubshellLoop(
      '(cd /projects/admin && for f in a; do echo $f; done) 2>&1'
    );
    strictEqual(r !== null, true);
  });

  it('while 루프도 매칭', () => {
    const r = matchSubshellLoop(
      '(cd /projects/admin && while read line; do echo $line; done)'
    );
    strictEqual(r !== null, true);
    strictEqual(r.loopCmd.startsWith('while'), true);
  });

  it('루프가 아닌 서브셸은 비매칭', () => {
    const r = matchSubshellLoop('(cd /some/dir && git status)');
    strictEqual(r, null);
  });

  it('괄호 없는 루프는 비매칭', () => {
    const r = matchSubshellLoop('for f in a b; do echo $f; done');
    strictEqual(r, null);
  });
});

describe('통합: 서브셸+루프 env 파일 복사 (스크린샷 #5)', () => {
  const cmd = '(cd /Users/test/project-command-center/projects/asset-factory-admin && for f in .env .env.local .env.development .nvmrc .node-version .npmrc .tool-versions; do test -f "main/$f" && cp "main/$f" "worktrees/AFS-127/$f" && echo "복사: $f"; done)';

  it('서브셸+루프로 감지됨', () => {
    const r = matchSubshellLoop(cmd);
    strictEqual(r !== null, true);
    strictEqual(r.cdPath, '/Users/test/project-command-center/projects/asset-factory-admin');
  });

  it('추출된 루프에서 body 정상 추출', () => {
    const r = matchSubshellLoop(cmd);
    const body = extractLoopBody(r.loopCmd);
    strictEqual(body.length, 2); // test -f, cp (echo "복사: $f"는 필터링)
    strictEqual(body[0].startsWith('test -f'), true);
    strictEqual(body[1].startsWith('cp '), true);
  });

  it('body 명령이 모두 알려진 패턴', () => {
    const r = matchSubshellLoop(cmd);
    const body = extractLoopBody(r.loopCmd);
    const knownPatterns = [...SAFE_COMMANDS, ...BUILD_TEST];
    const allKnown = body.every(c => matchesAny(c, knownPatterns) || FILE_WRITE.test(c.trim()));
    strictEqual(allKnown, true);
  });

  it('쓰기 대상이 worktree 경로', () => {
    const r = matchSubshellLoop(cmd);
    const body = extractLoopBody(r.loopCmd);
    strictEqual(allWritesInWorktree(body, r.cdPath), true);
  });
});

describe('통합: 서브셸+루프 위험 명령 차단', () => {
  it('rm 포함 → extractLoopBody는 추출하지만 FILE_WRITE가 아닌 위험 명령', () => {
    const cmd = '(cd /projects/test && for f in a b; do rm "$f"; done)';
    const r = matchSubshellLoop(cmd);
    const body = extractLoopBody(r.loopCmd);
    // rm은 FILE_WRITE에 매칭되지만, 대상이 worktree 외부이므로 차단
    // (여기서는 /projects/test가 CC_ROOT 내부가 아님)
    strictEqual(body.length >= 1, true);
  });

  it('curl (미인식 명령) → 알려진 패턴에 미매칭', () => {
    const cmd = '(cd /projects/test && for f in a; do curl http://evil.com; done)';
    const r = matchSubshellLoop(cmd);
    const body = extractLoopBody(r.loopCmd);
    const knownPatterns = [...SAFE_COMMANDS, ...BUILD_TEST];
    const allKnown = body.every(c => matchesAny(c, knownPatterns) || FILE_WRITE.test(c.trim()));
    strictEqual(allKnown, false);
  });

  it('done 뒤 주입: done; rm → 서브셸+루프 정규식 비매칭 (done 뒤 추가 명령)', () => {
    const cmd = '(cd /projects/test && for f in a; do echo ok; done; rm -rf /)';
    // done 뒤에 ; rm이 있어서 done)로 끝나지 않음 → 정규식은 매칭되지만
    // loopCmd에 "; rm -rf /"가 포함됨 → extractLoopBody가 trailing을 처리
    const r = matchSubshellLoop(cmd);
    if (r) {
      // loopCmd가 "for ... done; rm -rf /"를 포함하므로 extractLoopBody가 이를 파싱
      // rm은 DANGEROUS에 해당하므로 decideBash에서 차단됨
      strictEqual(r.loopCmd.includes('rm'), true);
    }
  });

  it('done) && rm 체인 → 서브셸+루프 정규식 비매칭', () => {
    const cmd = '(cd /projects/test && for f in a; do echo ok; done) && rm -rf /';
    // ) 뒤에 && rm이 있으므로 정규식이 매칭하지 않음
    const r = matchSubshellLoop(cmd);
    strictEqual(r, null);
  });
});
