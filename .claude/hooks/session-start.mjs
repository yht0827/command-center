#!/usr/bin/env node
/**
 * SessionStart Hook — CC 자동 최신화
 *
 * 세션 시작 시 main 브랜치이면 git pull --rebase --autostash를 실행한다.
 * 실패해도 세션을 중단하지 않는다.
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { CC_ROOT, gitExec, enforceMinRuntime } from './config.mjs';
import { SESSION_STATUS_FILE } from '../statusline/constants.mjs';

/**
 * ccRoot의 main 브랜치를 최신화한다.
 * @param {string} ccRoot
 * @returns {'pulled' | 'up-to-date' | 'skip:branch' | 'skip:dirty' | 'error'}
 */
export function syncRepo(ccRoot) {
  const branch = gitExec(ccRoot, 'symbolic-ref --short HEAD');
  if (branch !== 'main') return 'skip:branch';

  const status = gitExec(ccRoot, 'status --porcelain -uno');
  if (status) return 'skip:dirty';

  try {
    const output = execSync(`git -C "${ccRoot}" pull --rebase --autostash`, {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.includes('Already up to date') ? 'up-to-date' : 'pulled';
  } catch {
    return 'error';
  }
}

const MESSAGES = {
  pulled: 'Command Center updated & ready.',
  'up-to-date': 'Command Center ready.',
  'skip:branch': '작업 브랜치 감지 — 업데이트 패스.',
  'skip:dirty': '미커밋 변경 감지 — 업데이트 패스.',
  error: '업데이트 실패 — 세션 계속 진행.',
};

// Hook entry point — 직접 실행 시에만 동작
if (process.argv[1]?.endsWith('session-start.mjs')) {
  enforceMinRuntime('sessionStart');
  const result = syncRepo(CC_ROOT);
  const msg = MESSAGES[result];
  if (msg) process.stdout.write(msg);
  try { writeFileSync(SESSION_STATUS_FILE, result); } catch { /* ignore */ }
  process.exit(0);
}
