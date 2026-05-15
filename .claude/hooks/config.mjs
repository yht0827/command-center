/**
 * 훅 공유 설정 — 상수 + 유틸
 *
 * 모든 훅(branch-guard, pre-tool-use, permission-handler)이 이 파일을 참조한다.
 * 허용 경로, 보호 브랜치, 명령 패턴 등을 한 곳에서 관리한다.
 */

import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
// 최소 런타임 검증
// ============================================================================

/**
 * 순수 함수: 최소 런타임 정책 결정.
 * 테스트 가능하도록 사이드이펙트 없이 결정만 반환한다.
 *
 * @param {string} mode - 'preToolUse' | 'permissionRequest' | 'sessionStart'
 * @param {number|undefined} minMajor - config의 minRuntime.node
 * @param {string} nodeVersion - process.versions.node 형태 ("22.22.2")
 * @returns {{ ok: true } | { ok: false, action: 'failClose' | 'passThrough' | 'warn', message: string }}
 */
export function computeRuntimeDecision(mode, minMajor, nodeVersion) {
  if (!minMajor) return { ok: true };
  const currentMajor = parseInt(String(nodeVersion).split('.')[0], 10);
  if (currentMajor >= minMajor) return { ok: true };

  const message = `[CC hook] Node ${minMajor}+ 필요 (현재: ${nodeVersion}). ` +
    `'brew install node@${minMajor}' 또는 nvm/volta 등으로 업그레이드 후 CC를 재시작하세요.`;

  if (mode === 'sessionStart') return { ok: false, action: 'warn', message };
  if (mode === 'permissionRequest') return { ok: false, action: 'passThrough', message };
  return { ok: false, action: 'failClose', message }; // preToolUse 기본
}

/**
 * 사이드이펙트 wrapper: 결정에 따라 stdout/stderr/exit 처리.
 * 호출하는 훅이 어떤 종류인지를 mode로 명시한다:
 *   - 'preToolUse'      : Edit/Write/Bash 차단 가드. fail-close (exit 2 + stderr).
 *   - 'permissionRequest': Bash 자동 승인 결정. pass-through (사용자 확인으로 폴백).
 *   - 'sessionStart'    : 세션 시작 안내. fail-open + 메시지(stdout). 세션은 계속 진행.
 *
 * 환경변수:
 *   - CLAUDE_HOOK_SKIP_RUNTIME_CHECK=1 : 테스트에서 우회.
 *   - CLAUDE_HOOK_MIN_NODE_TEST=<N>    : 테스트에서 강제로 미달 시뮬레이션.
 *     보안: 현재 minMajor보다 *높은* 값일 때만 적용(가드를 약화시키는 방향은 불가).
 *
 * 사이드이펙트 패턴: process.exit 전에 stdout/stderr가 drain되도록 write callback +
 * setTimeout 안전망을 둔다. 동기 process.exit 직후의 stdio는 잘릴 수 있어
 * 사용자가 차단 사유 메시지를 못 보는 사고로 이어진다.
 */
export function enforceMinRuntime(mode) {
  if (process.env.CLAUDE_HOOK_SKIP_RUNTIME_CHECK === '1') return;
  let minMajor;
  try {
    const cfg = JSON.parse(readFileSync(resolve(CC_ROOT, '.claude/config.json'), 'utf-8'));
    minMajor = cfg?.minRuntime?.node;
  } catch {
    return; // config 읽기 실패 시 검증을 건너뛴다 (config 없음 = 미설정으로 간주)
  }
  const override = process.env.CLAUDE_HOOK_MIN_NODE_TEST;
  if (override) {
    const overrideInt = parseInt(override, 10);
    if (overrideInt > (minMajor || 0)) minMajor = overrideInt;
  }
  const decision = computeRuntimeDecision(mode, minMajor, process.versions.node);
  if (decision.ok) return;

  if (decision.action === 'warn') {
    process.stdout.write(decision.message + '\n');
    return; // fail-open: 흐름 계속, drain은 main 종료 시 보장
  }

  const exitCode = decision.action === 'passThrough' ? 0 : 2;
  setTimeout(() => process.exit(exitCode), 500); // 안전망

  if (decision.action === 'passThrough') {
    process.stderr.write(decision.message + '\n', () => {
      process.stdout.write(JSON.stringify({ continue: true }) + '\n', () => process.exit(exitCode));
    });
    return;
  }
  // failClose
  process.stderr.write(decision.message + '\n', () => process.exit(exitCode));
}

// 훅 디버그 로그 — CLAUDE_HOOK_DEBUG 환경변수가 설정된 경우에만 동작.
// 평소에는 디스크 쓰기를 발생시키지 않는다. 로그 경로는 CLAUDE_HOOK_DEBUG_LOG로 오버라이드 가능.
const _debugEnabled = !!process.env.CLAUDE_HOOK_DEBUG;
const _debugLog = _debugEnabled ? (process.env.CLAUDE_HOOK_DEBUG_LOG || '/tmp/claude-hook-debug.log') : null;
function _debug(line) {
  if (!_debugEnabled) return;
  try { appendFileSync(_debugLog, line); } catch {}
}
_debug(`[${new Date().toISOString()}] config.mjs loaded, pid=${process.pid}, cwd=${process.cwd()}\n`);
process.on('uncaughtException', (err) => {
  _debug(`[${new Date().toISOString()}] UNCAUGHT pid=${process.pid}: ${err.stack}\n`);
  process.exit(0);
});
process.on('unhandledRejection', (err) => {
  _debug(`[${new Date().toISOString()}] UNHANDLED pid=${process.pid}: ${err?.stack || err}\n`);
  process.exit(0);
});

// ============================================================================
// 경로 패턴
// ============================================================================

/** 쓰기 허용 경로 (CC_ROOT 기준 상대경로) */
export const WRITE_ALLOW_PATTERNS = [
  /^worktrees\//,
  /^projects\/[^/]+\/worktrees\//,
  /^projects\/[^/]+\/[^/]+\/worktrees\//,
  /^\.lens\//,
  /^\.slack-digest\//,
];

// ============================================================================
// 보호 브랜치
// ============================================================================

export const PROTECTED_BRANCHES = /^(develop|main|master)$/;

// ============================================================================
// Bash 명령 패턴
// ============================================================================

/** 환경변수 prefix: VAR=value cmd 또는 env VAR=value cmd */
export const ENV_PREFIX = /^(env\s+)?([a-zA-Z_][a-zA-Z_0-9]*=[^\s]*\s+)+/;

/** 파이프 뒤에 올 수 있는 읽기 전용 필터 */
export const SAFE_PIPE_FILTERS = /^(tail|head|grep|sort|wc|cat|cut|awk|tr|sed|jq|uniq|column|diffstat|less|more)\b/;

/** 쉘 메타문자 — 있으면 복합 명령이므로 단순 파싱 불가.
 * < 는 입력 리다이렉트(읽기 전용)이므로 제외. <( process substitution은 ( 로 차단됨 */
export const DANGEROUS_SHELL_CHARS = /[;&|`$()>\n\r\t\0\\]/;

/** 인용문 외부의 셸 확장($VAR, ${}, $(), backtick) 감지.
 * 단일 인용문 내부는 확장 없음. 정규식 앵커 $ 등 비확장 용도는 무시. */
export function hasShellExpansion(cmd) {
  const noSingleQuoted = cmd.replace(/'[^']*'/g, ' ');
  if (/`/.test(noSingleQuoted)) return true;
  return /\$[a-zA-Z_{(]/.test(noSingleQuoted);
}

/** 자동 허용 패턴 — 경로 검증 없이 어디서든 허용. 읽기 명령 + 비파괴적 쓰기(PR/이슈 생성, git pull) */
export const SAFE_COMMANDS = [
  /^git\s+(-C\s+\S+\s+)?(status|diff|log|branch\s*($|\s+(-[avrl]|--list)\b)|show|fetch|rev-parse|show-ref|remote\s+(-v|get-url|show)\b|ls-files|ls-tree|cat-file|describe|tag\s+-l|symbolic-ref\s+HEAD\s*$|config\s+--get|stash\s+list|worktree\s+list|pull)\b/,
  /^(ls|cat|head|tail|wc|test|find|grep|sort|diff|pwd|which|command|basename|dirname|realpath|date|file|uuidgen|stat|du|df|id|whoami|printenv|lsof|ps)\b/,
  /^sed\s+(?!-i\b)/,
  /^(awk|tr|cut|jq|diffstat|md5|uniq|column)\b/,
  /^cd\s/,
  /^echo\s/,
  /^gh\s+(pr|issue|run|repo)\s+(view|list|checks|diff|status|create|edit|comment)\b/,
  /^gh\s+auth\s+status\b/,
  /^gh\s+api\s+(?!.*(-X\s+(POST|PUT|DELETE|PATCH)|--method\s+(POST|PUT|DELETE|PATCH)))/,
];

/** 빌드/테스트 */
export const BUILD_TEST = [
  /^\.\/gradlew\s/,
  /^npm\s+(test|run|install|ci|exec|ls|outdated|audit)/,
  /^npx\s/,
  /^bun\s+(test|run|install|add|remove|x|pm)/,
  /^bunx\s/,
  /^yarn\s+(test|run|install|add|remove)/,
  /^pnpm\s+(test|run|install|add|remove|exec)/,
  /^pytest/,
  /^python3?\s+-m\s+pytest/,
  /^tsc(\s|$)/,
  /^eslint\s/,
  /^prettier\s/,
  /^\.\/node_modules\/\.bin\//,
  /^ruff\s/,
];

/** Git 쓰기 (위험하지 않은 것만, push 포함 — 보호 브랜치는 branch-guard에서 deny) */
export const GIT_WRITE = [
  /^git\s+(-C\s+\S+\s+)?(add|commit|push|checkout|switch|stash|merge|rebase|cherry-pick|reset(?!\s+--hard)|worktree|restore|tag(?!\s+-l))\b/,
];

/** 파일 쓰기 */
export const FILE_WRITE = /^(mkdir|cp|mv|rm|touch|chmod|ln|rsync|tee)\b/;

/** 금지 키워드 — 단일 소스. 앵커 없이 정의하여 어디서든 매칭 가능 */
const DENY_KEYWORDS = [
  /gh\s+pr\s+(merge|close|reopen|review)/,
  /gh\s+issue\s+(close|reopen)/,
  /gh\s+api\s+.*(-X\s+(POST|PUT|DELETE|PATCH)|--method\s+(POST|PUT|DELETE|PATCH))/,
];

/** 금지 패턴 → 단순 명령 매칭 (^ 앵커 추가). DENY_KEYWORDS에서 자동 생성 */
export const DENY_PATTERNS = DENY_KEYWORDS.map(r =>
  new RegExp('^' + r.source, r.flags)
);

/** 금지 키워드 → 명령 전체 문자열 검색 (서브셸, 인터프리터 내부 포함). DENY_KEYWORDS 그대로 사용 */
export const DENY_ANYWHERE = DENY_KEYWORDS;

/** 위험 패턴 → 사용자 확인 (pass-through) */
export const DANGEROUS = [
  /^git\s+(-C\s+\S+\s+)?reset\s+--hard\b/,
  /^git\s+(-C\s+\S+\s+)?clean\b/,
  /^git\s+(-C\s+\S+\s+)?branch\s+-[dD]\b/,
  /^git\s+(-C\s+\S+\s+)?push\s+.*(-f\b|--force\b)/,
];

// ============================================================================
// 공유 유틸
// ============================================================================

/**
 * CC 프로젝트 루트 반환.
 * 훅 파일의 물리적 위치에서 산출하므로 CWD나 git repo에 무관하게 항상 정확.
 * .claude/hooks/config.mjs → 2단계 상위 = CC root
 * CC 워크트리에서 로드된 경우 .git 파일(worktree 지시자)로 메인 repo root 역추적.
 */
const __filename = fileURLToPath(import.meta.url);
let _ccRoot = resolve(dirname(__filename), '..', '..');
// git worktree 감지: .git이 파일(디렉토리가 아닌)이면 worktree
const _gitPath = resolve(_ccRoot, '.git');
if (existsSync(_gitPath) && !statSync(_gitPath).isDirectory()) {
  // .git 파일 내용: "gitdir: /path/to/main/.git/worktrees/<branch>"
  const _gitdir = readFileSync(_gitPath, 'utf-8').trim().replace('gitdir: ', '');
  // .git/worktrees/<branch> → 3단계 상위 = main repo root
  _ccRoot = resolve(_gitdir, '..', '..', '..');
}
export const CC_ROOT = _ccRoot;

export function resolveCCRoot(_cwd) {
  return CC_ROOT;
}

/** absPath가 CC 루트 하위인지 */
export function isInsideCC(absPath, ccRoot) {
  return absPath === ccRoot || absPath.startsWith(ccRoot + '/');
}

/** absPath가 worktree 하위인지 */
export function isWriteAllowed(absPath, ccRoot) {
  if (!isInsideCC(absPath, ccRoot)) return false;
  const rel = relative(ccRoot, absPath);
  return WRITE_ALLOW_PATTERNS.some(p => p.test(rel));
}

/** 환경변수 prefix 제거 */
export function stripEnvPrefix(cmd) {
  return cmd.replace(ENV_PREFIX, '');
}

/** 패턴 매칭 (stripEnvPrefix 후) */
export function matchesAny(cmd, patterns) {
  return patterns.some(p => p.test(stripEnvPrefix(cmd.trim())));
}

/** git -C path 또는 cd path && ... 에서 실행 디렉토리 추출 */
export function resolveExecDir(cmd, cwd) {
  const gitC = cmd.match(/\bgit\s+-C\s+(\S+)/);
  if (gitC) return resolve(cwd, gitC[1]);

  // (cd path && ...) 또는 cd path && ... (괄호 유무 모두)
  const cd = cmd.match(/^\(?cd\s+(\S+)\s+&&/);
  if (cd) return resolve(cwd, cd[1]);

  return cwd;
}

/** 서브셸 (cd path && cmd1 && cmd2) → [cmd1, cmd2]
 * 안전한 접미사 허용: FD 리다이렉트(2>&1), fallback(|| true/||:) */
export function extractInnerCommands(cmd) {
  // 안전한 접미사 제거: || true/: (fallback)
  let cleaned = cmd.replace(/\s*\|\|\s*(true|:)\s*$/, '');
  // 닫는 ) 뒤의 FD 리다이렉트 제거: (cmd) 2>&1 → (cmd)
  cleaned = cleaned.replace(/\)\s*\d*>&\d+\s*$/, ')');
  // s flag: 본문 내 개행(\n)도 매칭 (gh pr create --body "..." 등)
  const m = cleaned.match(/^\(cd\s+\S+\s+&&\s+(.+)\)\s*$/s);
  if (!m) return null;
  return m[1].split(/\s*&&\s*/).map(c => c.trim());
}

/**
 * 파이프라인 분할: cmd1 | cmd2 | cmd3 → [cmd1, cmd2, cmd3]
 * - || (OR)는 파이프가 아니므로 제외
 * - FD 리다이렉트(2>&1)는 파이프 구분자가 아니므로 먼저 제거
 * - 서브셸 내부의 |는 분할하지 않음 (괄호 depth 추적)
 * - 인용문 내부의 |는 분할하지 않음 (quote tracking)
 *
 * 인용문 처리 한계 (의도적):
 * - 이스케이프된 인용문(\" 등)은 처리하지 않음. 셸보다 더 일찍 닫힘 → 파이프를 더 분할하는 방향 (안전 측)
 * - 짝이 안 맞는 인용문은 null 반환 → 호출자가 DANGEROUS_SHELL_CHARS로 차단
 */
export function extractPipeSegments(cmd) {
  // FD 리다이렉트를 같은 길이의 공백으로 치환 (위치 보존)
  const noFdRedir = cmd.replace(/\d*>&\d+/g, m => ' '.repeat(m.length));
  if (!/(?<!\|)\|(?!\|)/.test(noFdRedir)) return null;

  // 괄호 depth + 인용문 context를 추적하며 최상위 | 위치 찾기
  const positions = [];
  let depth = 0;
  for (let i = 0; i < noFdRedir.length; i++) {
    const ch = noFdRedir[i];
    // 인용문 스킵: 닫는 quote를 찾을 때까지 전진
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < noFdRedir.length && noFdRedir[i] !== q) i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '|' && depth === 0) {
      // || 은 건너뛰기
      if (noFdRedir[i + 1] === '|') { i++; continue; }
      positions.push(i);
    }
  }
  if (positions.length === 0) return null;

  // 원본 cmd에서 같은 위치로 분할
  const segments = [];
  let start = 0;
  for (const pos of positions) {
    segments.push(cmd.substring(start, pos).trim());
    start = pos + 1;
  }
  segments.push(cmd.substring(start).trim());
  return segments.filter(s => s.length > 0);
}

/** &&/||/; 체인 (cmd1 && cmd2; cmd3) → [cmd1, cmd2, cmd3]. 괄호 없는 순수 체인만.
 * 인용문 내부의 구분자는 분할하지 않음 (quote-aware splitting) */
export function extractChainedCommands(cmd) {
  // 구분자(&&, ||, ;)를 포함해야 함
  if (!/&&/.test(cmd) && !/\|\|/.test(cmd) && !/;/.test(cmd)) return null;
  // 실제 셸 확장($VAR, ${}, $(), backtick)만 차단. 정규식 앵커 $ 등은 허용
  if (hasShellExpansion(cmd)) return null;
  // 인용문 내부 문자(\ 등)는 셸 메타문자가 아니므로 제거 후 판단
  const unquoted = cmd.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
  // 위험 메타문자(() 등)는 차단. ; 는 &&/||와 동등한 순차 실행이므로 허용
  if (/[()\n\r\t\0\\]/.test(unquoted)) return null;
  // 단독 | (파이프)는 차단, || (OR)는 허용
  if (/(?<!\|)\|(?!\|)/.test(unquoted)) return null;
  // 인용문을 존중하며 &&, ||, ; 위치를 찾아 분할
  const positions = [];
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === '"' || ch === "'") {
      i++;
      while (i < cmd.length && cmd[i] !== ch) i++;
      continue;
    }
    if (ch === '&' && cmd[i + 1] === '&') {
      positions.push({ pos: i, len: 2 });
      i++;
    } else if (ch === '|' && cmd[i + 1] === '|') {
      positions.push({ pos: i, len: 2 });
      i++;
    } else if (ch === ';') {
      positions.push({ pos: i, len: 1 });
    }
  }
  if (positions.length === 0) return null;
  const segments = [];
  let start = 0;
  for (const { pos, len } of positions) {
    segments.push(cmd.substring(start, pos).trim());
    start = pos + len;
  }
  segments.push(cmd.substring(start).trim());
  return segments.filter(s => s.length > 0);
}

/** 서브셸 포함 체인을 평탄화: cmd1 && (cmd2 || cmd3) → [cmd1, cmd2, cmd3]
 * 괄호를 제거하고 &&/||/; 로 분리. 읽기 전용 명령 검증 전용.
 * 쓰기 명령은 서브셸의 디렉토리 context를 잃으므로 이 함수로 판단하면 안 된다 */
export function extractFlatChain(cmd) {
  if (!/&&/.test(cmd) && !/\|\|/.test(cmd) && !/;/.test(cmd)) return null;
  if (hasShellExpansion(cmd)) return null;
  const unquoted = cmd.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
  if (/[\n\r\t\0\\]/.test(unquoted)) return null;
  if (/(?<!\|)\|(?!\|)/.test(unquoted)) return null;
  // 괄호 짝 확인
  let depth = 0;
  for (const ch of unquoted) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth < 0) return null;
  }
  if (depth !== 0) return null;
  // 괄호를 공백으로 치환 (인용문 내부의 괄호는 보존)
  let flat = '';
  let inQ = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (!inQ && (ch === '"' || ch === "'")) { inQ = ch; flat += ch; }
    else if (inQ === ch) { inQ = null; flat += ch; }
    else if (!inQ && (ch === '(' || ch === ')')) { flat += ' '; }
    else { flat += ch; }
  }
  // quote-aware 분할
  const positions = [];
  inQ = null;
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (ch === '"' || ch === "'") {
      if (!inQ) inQ = ch; else if (inQ === ch) inQ = null;
      continue;
    }
    if (inQ) continue;
    if (ch === '&' && flat[i + 1] === '&') { positions.push({ pos: i, len: 2 }); i++; }
    else if (ch === '|' && flat[i + 1] === '|') { positions.push({ pos: i, len: 2 }); i++; }
    else if (ch === ';') { positions.push({ pos: i, len: 1 }); }
  }
  if (positions.length === 0) return null;
  const segments = [];
  let start = 0;
  for (const { pos, len } of positions) {
    segments.push(flat.substring(start, pos).trim());
    start = pos + len;
  }
  segments.push(flat.substring(start).trim());
  return segments.filter(s => s.length > 0);
}

/** 부수효과 없는 독립 변수 할당인지 확인.
 * VAR="value" (독립 할당, 부수효과 없음) vs VAR=value command (명령 실행, 위험)을 구분.
 * command substitution($(), ``)도 제외 */
function isSafeVarAssignment(cmd) {
  if (!/^[a-zA-Z_]\w*=/.test(cmd)) return false;
  if (/\$\(/.test(cmd) || /`/.test(cmd)) return false;
  // 독립 할당만 허용: VAR=unquoted, VAR="quoted", VAR='quoted'
  // VAR=value command (env prefix + 명령) 형태는 거부
  return /^[a-zA-Z_]\w*=("[^"]*"|'[^']*'|\S*)$/.test(cmd);
}

/** for/while 루프 body 추출: for ...; do cmd1 && cmd2; done → [cmd1, cmd2]
 * 멀티라인 지원. 루프 내 변수 할당($var)을 해석하여 경로를 resolve한 결과를 반환 */
export function extractLoopBody(cmd) {
  // for ...; do ... done 또는 while ...; do ... done
  // [\s\S]: 멀티라인 body 지원
  const m = cmd.match(/^(?:for|while)\s+.+?;\s*do\s+([\s\S]+?)\s*done\s*$/);
  if (!m) return null;
  let body = m[1];
  // if [ ... ]; then ... fi → 조건문 언래핑하여 실제 명령만 추출
  body = body.replace(/if\s+\[.*?\];\s*then\s*/g, '');
  body = body.replace(/[;\n]\s*fi\b/g, '');
  // &&, ;, \n 으로 분리 (멀티라인 body 지원)
  const rawParts = body.split(/\s*(?:&&|\|\||;|\n)\s*/)
    .map(c => c.trim())
    .filter(c => c.length > 0);
  // 변수 할당 수집 (command substitution 없는 안전한 할당만)
  const varMap = {};
  for (const part of rawParts) {
    if (!isSafeVarAssignment(part)) continue;
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.substring(0, eq);
    let val = part.substring(eq + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    varMap[key] = val;
  }
  // 조건문/echo(리다이렉트 없는 것만)/변수 할당 필터링 후, $var 치환
  return rawParts
    .filter(c => !c.startsWith('[') && (!c.startsWith('echo ') || hasWriteOutput(c)) && !isSafeVarAssignment(c) && c.length > 0)
    .map(c => {
      let resolved = c;
      for (const [key, val] of Object.entries(varMap)) {
        resolved = resolved.replace(new RegExp(`\\$\\{${key}\\}|\\$${key}(?=[^a-zA-Z_0-9]|$)`, 'g'), () => val);
      }
      return resolved;
    });
}

/** 리다이렉트/파이프 쓰기 감지. FD 리다이렉트(2>&1, >&2)와 /dev/null은 제외 */
export function hasWriteOutput(cmd) {
  // 인용문 내용을 플레이스홀더로 치환 (본문 내 > 오탐 방지 + 인용문 대상 리다이렉트 감지 유지)
  const noQuoted = cmd.replace(/'[^']*'/g, "'_'").replace(/"[^"]*"/g, '"_"');
  const cleaned = noQuoted.replace(/\d*>&\d+/g, '').replace(/\d*>\s*\/dev\/null/g, '');
  return />{1,2}\s*\S+/.test(cleaned) || /\|\s*tee\s/.test(noQuoted);
}

/** 리다이렉트/tee 대상 경로 추출. 셸 인용문을 벗겨 path.resolve가 정확히 동작하도록 함 */
export function extractWriteTarget(cmd) {
  let m = cmd.match(/\|\s*tee\s+(?:-a\s+)?(\S+)/);
  if (m) return m[1].replace(/^["']|["']$/g, '');
  m = cmd.match(/>{1,2}\s*(\S+)\s*$/);
  if (m) return m[1].replace(/^["']|["']$/g, '');
  return null;
}

/** git 명령 실행 */
export function gitExec(dir, args) {
  try {
    return execSync(`git -C "${dir}" ${args}`, {
      encoding: 'utf-8', timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch { return ''; }
}

/** stdin 읽기 */
export async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data;
}

// ============================================================================
// 응답 헬퍼
// ============================================================================

/** stdout 플러시 후 종료. pipe 환경에서 process.exit()이 출력보다 먼저 실행되는 경합 방지.
 * data가 없어도(passThrough) write callback으로 종료하여 pipe 정리 경합을 방지한다. */
function writeAndExit(data) {
  const output = data != null ? data + '\n' : '';
  process.stdout.write(output, () => process.exit(0));
  // stdout drain이 막힐 경우 대비 안전망
  setTimeout(() => process.exit(0), 500);
}

/** PreToolUse deny */
export function deny(reason) {
  writeAndExit(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}

/** PreToolUse allow */
export function allow(reason) {
  writeAndExit(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: reason,
    },
  }));
}

/** PreToolUse pass-through */
export function passThrough() {
  writeAndExit(null);
}

/** PermissionRequest allow */
export function permAllow(reason) {
  writeAndExit(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow', reason },
    },
  }));
}

/** PermissionRequest pass-through */
export function permPassThrough() {
  writeAndExit(JSON.stringify({ continue: true }));
}
