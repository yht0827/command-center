#!/usr/bin/env node
/**
 * PreToolUse Hook — deny 가드
 *
 * 단일 책임: 절대 허용하면 안 되는 명령을 deny.
 * settings.allow보다 선행하므로, 어떤 allow 규칙이 있어도 우회 불가.
 *
 * deny 대상:
 * - 보호 브랜치(main/master/develop)에서의 직접 commit/merge
 * - GitHub 수정 작업 (pr merge/close/comment, issue close/comment, api POST)
 * - 서브셸/인터프리터 내부에서의 금지 명령 (DENY_ANYWHERE)
 */

import {
  readStdin, resolveExecDir, gitExec, matchesAny,
  PROTECTED_BRANCHES, DENY_PATTERNS, DENY_ANYWHERE, deny, passThrough,
  stripEnvPrefix, enforceMinRuntime,
} from './config.mjs';

async function main() {
  enforceMinRuntime('preToolUse');
  const input = await readStdin();

  let data;
  try { data = JSON.parse(input); } catch { passThrough(); return; }

  const command = data?.tool_input?.command;
  if (typeof command !== 'string' || !command.trim()) { passThrough(); return; }

  const cwd = data.cwd || process.cwd();
  const effective = stripEnvPrefix(command.trim());
  const execDir = resolveExecDir(command.trim(), cwd);

  // deny 함수는 비동기 process.exit에 의존하므로 호출 후 반드시 return으로 흐름을 끊는다.
  // 그렇지 않으면 같은 명령이 여러 deny 규칙에 매칭될 때 stdout에 JSON이 중복 출력되어
  // 호출자(Claude Code, e2e parse_decision 등)의 응답 파싱이 깨진다.

  // 명령 유형별 메시지 분기 (DENY_PATTERNS와 DENY_ANYWHERE에서 공용 사용)
  const denyReasonFor = (cmd) => {
    if (/gh\s+pr\s+(merge|close|reopen|review)/.test(cmd))
      return 'GitHub PR 수정(merge/close/reopen/review)은 직접 수행하세요.';
    if (/gh\s+issue\s+(close|reopen)/.test(cmd))
      return 'GitHub 이슈 close/reopen은 직접 수행하세요.';
    if (/gh\s+api\s+.*(-X\s+(POST|PUT|DELETE|PATCH)|--method\s+(POST|PUT|DELETE|PATCH))/.test(cmd))
      return 'GitHub API 수정 호출(POST/PUT/DELETE/PATCH)은 허용되지 않습니다.';
    return '이 작업은 허용되지 않습니다.';
  };

  // 단순 명령: DENY_PATTERNS (^ 앵커)
  if (matchesAny(command.trim(), DENY_PATTERNS)) {
    deny(denyReasonFor(command));
    return;
  }

  // 전체 문자열 검사: 서브셸, 인터프리터 내부 포함 (앵커 없음)
  if (DENY_ANYWHERE.some(p => p.test(command))) {
    deny(denyReasonFor(command));
    return;
  }

  // 보호 브랜치 직접 commit
  if (/\bgit\b\s+(-C\s+\S+\s+)?commit\b/.test(effective)) {
    if (gitExec(execDir, 'remote')) {
      const branch = gitExec(execDir, 'symbolic-ref --short HEAD');
      if (PROTECTED_BRANCHES.test(branch)) {
        deny(`${branch} 브랜치에서는 커밋할 수 없습니다. 작업 브랜치를 먼저 생성하세요.`);
        return;
      }
    }
  }

  // 보호 브랜치 직접 merge
  if (/\bgit\b\s+(-C\s+\S+\s+)?merge\b/.test(effective)) {
    if (gitExec(execDir, 'remote')) {
      const branch = gitExec(execDir, 'symbolic-ref --short HEAD');
      if (PROTECTED_BRANCHES.test(branch)) {
        deny(`${branch} 브랜치에서 merge할 수 없습니다. PR을 생성하세요.`);
        return;
      }
    }
  }

  passThrough();
}

main().catch(() => process.exit(0));
