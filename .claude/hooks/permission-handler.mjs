#!/usr/bin/env node
/**
 * PermissionRequest Hook — Bash 명령 종합 판단
 *
 * 단일 책임: settings.allow에서 빠진 Bash 명령의 안전성을 종합 판단.
 * 경로 + 명령 내용 + 메타문자를 분석하여 safe한 것만 auto-allow.
 *
 * 실행 시점: settings.allow에 매칭되지 않은 Bash 명령이 사용자 확인으로
 * 넘어가기 직전에 실행됨. 여기서 allow하면 사용자 확인 없이 실행.
 */

import { resolve } from 'node:path';
import {
  readStdin, resolveCCRoot, isInsideCC, isWriteAllowed,
  stripEnvPrefix, matchesAny, resolveExecDir, extractInnerCommands,
  extractChainedCommands, extractFlatChain, extractLoopBody, extractPipeSegments,
  hasWriteOutput, extractWriteTarget, hasShellExpansion,
  SAFE_COMMANDS, BUILD_TEST, GIT_WRITE, FILE_WRITE, DANGEROUS, DENY_PATTERNS,
  DANGEROUS_SHELL_CHARS, SAFE_PIPE_FILTERS,
  permAllow, permPassThrough, enforceMinRuntime,
} from './config.mjs';

function decideBash(cmd, cwd, ccRoot) {
  // 선행 # 주석 줄 제거 (셸 no-op)
  const trimmed = cmd.trim().replace(/^(#[^\n]*\n\s*)+/, '');
  const effective = stripEnvPrefix(trimmed);
  const execDir = resolveExecDir(trimmed, cwd);

  // --- 위험 패턴 → pass-through ---
  if (matchesAny(trimmed, DANGEROUS)) {
    permPassThrough();
    return;
  }

  // --- 서브셸 내 for/while 루프 → 루프 핸들러로 위임 ---
  // extractInnerCommands가 for 루프 body의 &&를 구분자로 쪼개고, $f를 셸 확장으로 오탐하는 문제 해결
  {
    let cl = trimmed.replace(/\s*\|\|\s*(true|:)\s*$/, '');
    cl = cl.replace(/\)\s*\d*>&\d+\s*$/, ')');
    const m = cl.match(/^\(cd\s+(\S+)\s+&&\s+((?:for|while)\b[\s\S]+)\)\s*$/s);
    if (m) {
      decideBash(m[2].trim(), resolve(cwd, m[1]), ccRoot);
      return;
    }
  }

  // --- 서브셸 (cd path && ...) ---
  const innerCmds = extractInnerCommands(trimmed);
  if (innerCmds) {
    // inner에 DENY 명령 → pass-through (branch-guard의 DENY_ANYWHERE가 1차 방어, 여기는 2차)
    if (innerCmds.some(c => matchesAny(c, DENY_PATTERNS))) {
      permPassThrough();
      return;
    }
    // inner에 위험 명령 → pass-through
    if (innerCmds.some(c => matchesAny(c, DANGEROUS))) {
      permPassThrough();
      return;
    }
    // inner에 셸 확장($VAR, $(cmd), backtick) → pass-through
    if (innerCmds.some(c => hasShellExpansion(c))) {
      permPassThrough();
      return;
    }
    // inner에 리다이렉트/파이프 쓰기 → 대상 경로 확인
    if (innerCmds.some(c => hasWriteOutput(c))) {
      // 실제 쓰기 대상 경로를 추출하여 검증
      const writeTargets = innerCmds
        .filter(c => hasWriteOutput(c))
        .map(c => extractWriteTarget(c))
        .filter(Boolean);
      const allTargetsAllowed = writeTargets.length > 0 && writeTargets.every(t => {
        const abs = resolve(execDir, t);
        return isWriteAllowed(abs, ccRoot);
      });
      if (allTargetsAllowed) {
        permAllow('워크트리 내부 리다이렉트 (서브셸)');
        return;
      }
      permPassThrough();
      return;
    }
    // inner 명령을 각각 검증
    const knownPatterns = [...SAFE_COMMANDS, ...BUILD_TEST, ...GIT_WRITE];
    const allKnown = innerCmds.every(c => {
      const s = stripEnvPrefix(c.trim());
      return matchesAny(c, knownPatterns) || FILE_WRITE.test(s);
    });

    if (allKnown) {
      // 전부 읽기면 어디서든 allow
      if (innerCmds.every(c => matchesAny(c, SAFE_COMMANDS))) {
        permAllow('읽기 전용 명령 (서브셸)');
        return;
      }
      // 빌드/테스트 또는 쓰기 포함 → worktree 내부에서만 allow
      if (isWriteAllowed(execDir, ccRoot)) {
        permAllow('워크트리 내부 명령 (서브셸)');
        return;
      }
    }
    permPassThrough();
    return;
  }

  // --- && 체인 (괄호 없음) → 각 명령 개별 검증 ---
  const chainedCmds = extractChainedCommands(trimmed);
  if (chainedCmds) {
    // DENY 명령 포함 → pass-through
    if (chainedCmds.some(c => matchesAny(c, DENY_PATTERNS))) {
      permPassThrough();
      return;
    }
    if (chainedCmds.some(c => matchesAny(c, DANGEROUS))) {
      permPassThrough();
      return;
    }
    // 각 명령의 execDir을 개별 추출 (git -C path 등)
    const knownPatterns = [...SAFE_COMMANDS, ...BUILD_TEST, ...GIT_WRITE];
    const allKnown = chainedCmds.every(c => {
      const s = stripEnvPrefix(c.trim());
      return matchesAny(c, knownPatterns) || FILE_WRITE.test(s) || hasWriteOutput(c);
    });
    if (allKnown) {
      // 쓰기 명령의 대상 경로 검증
      const allWritesAllowed = chainedCmds.every(c => {
        const s = stripEnvPrefix(c.trim());
        const cmdExecDir = resolveExecDir(c, cwd);
        if (matchesAny(c, GIT_WRITE)) return isWriteAllowed(cmdExecDir, ccRoot);
        if (matchesAny(c, BUILD_TEST)) return isWriteAllowed(cmdExecDir, ccRoot);
        if (FILE_WRITE.test(s)) {
          const parts = s.split(/\s+/);
          const args = parts.slice(1).filter(a => !a.startsWith('-') && !a.includes('$'));
          const target = args.length > 0 ? args[args.length - 1] : null;
          return target ? isWriteAllowed(resolve(cmdExecDir, target), ccRoot) : false;
        }
        if (hasWriteOutput(c)) {
          const target = extractWriteTarget(c);
          return target ? isWriteAllowed(resolve(cmdExecDir, target), ccRoot) : false;
        }
        return true;
      });
      if (allWritesAllowed) {
        permAllow('체인 명령 (모두 worktree 내부)');
        return;
      }
    }
    permPassThrough();
    return;
  }

  // --- 읽기 전용 체인 (서브셸 포함) ---
  // extractChainedCommands가 () 때문에 실패한 경우, 모든 명령이 읽기 전용이면 allow
  const flatCmds = extractFlatChain(trimmed);
  if (flatCmds) {
    if (flatCmds.some(c => matchesAny(c, DENY_PATTERNS))) {
      permPassThrough();
      return;
    }
    if (flatCmds.some(c => matchesAny(c, DANGEROUS))) {
      permPassThrough();
      return;
    }
    if (flatCmds.every(c => matchesAny(c, SAFE_COMMANDS))) {
      permAllow('읽기 전용 명령 체인');
      return;
    }
  }

  // --- 리다이렉트/파이프 쓰기 (단일 명령) ---
  if (hasWriteOutput(trimmed)) {
    const target = extractWriteTarget(trimmed);
    if (target) {
      const abs = resolve(execDir, target);
      if (isWriteAllowed(abs, ccRoot)) {
        permAllow('리다이렉트/파이프 쓰기 (워크트리 내부)');
        return;
      }
    }
    permPassThrough();
    return;
  }

  // --- for/while 루프 → body 명령을 개별 검증 ---
  // 전처리: 선행 변수 할당 수집 (FE_GITIGNORE="path" 등)
  let loopInput = trimmed;
  const preambleVars = {};
  const _varRe = /^([a-zA-Z_]\w*=("[^"]*"|'[^']*'|\S*)\s*\n)/;
  while (_varRe.test(loopInput)) {
    const m = loopInput.match(_varRe);
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

  // 접미사 분리: "for ...; done 2>/dev/null; echo X" → 루프="for ...; done", 후행=["echo X"]
  let loopCandidate = loopInput;
  let loopTrailing = [];
  if (/^(?:for|while)\b/.test(loopInput)) {
    // done 뒤의 안전한 접미사 제거: 2>/dev/null, || true/:
    let stripped = loopInput.replace(/(\bdone)\s*\d*>\s*\/dev\/null/, '$1');
    stripped = stripped.replace(/(\bdone)\s*\|\|\s*(true|:)\s*(?=$|[;&])/, '$1');
    // done 역순 탐색: 인용문 내 done(echo "done")을 건너뛰기 위해
    const doneMatches = [...stripped.matchAll(/\bdone\b/g)];
    for (let i = doneMatches.length - 1; i >= 0; i--) {
      const dm = doneMatches[i];
      const rawAfter = stripped.substring(dm.index + 4);
      const afterDone = rawAfter.trim();
      if (afterDone === '') {
        loopCandidate = stripped.substring(0, dm.index + 4);
        break;
      }
      // ;, &&, ||, \n 모두 유효한 구분자
      const sepMatch = rawAfter.match(/^\s*(;|&&|\|\||\n)\s*/);
      if (sepMatch) {
        loopCandidate = stripped.substring(0, dm.index + 4);
        const rest = afterDone.replace(/^(;|&&|\|\|)\s*/, '');
        loopTrailing = rest.split(/\s*(?:;|&&|\|\||\n)\s*/).map(c => c.trim()).filter(Boolean);
        break;
      }
    }
  }
  const loopBody = extractLoopBody(loopCandidate);
  if (loopBody) {
    // 선행 변수를 루프 body에 치환
    const resolvedBody = Object.keys(preambleVars).length > 0
      ? loopBody.map(c => {
          let r = c;
          for (const [k, v] of Object.entries(preambleVars)) {
            r = r.replace(new RegExp(`\\$\\{${k}\\}|\\$${k}(?=[^a-zA-Z_0-9]|$)`, 'g'), () => v);
          }
          return r;
        })
      : loopBody;

    // 후행 명령이 안전하지 않으면 pass-through (셸 확장도 차단)
    if (loopTrailing.length > 0) {
      if (loopTrailing.some(c => hasShellExpansion(c) || !matchesAny(c, SAFE_COMMANDS))) {
        permPassThrough();
        return;
      }
    }
    // body에 DENY 명령 → pass-through
    if (resolvedBody.some(c => matchesAny(c, DENY_PATTERNS))) {
      permPassThrough();
      return;
    }
    // body 내 모든 명령이 알려진 패턴인지 검증
    const knownPatterns = [...SAFE_COMMANDS, ...BUILD_TEST, ...GIT_WRITE];
    const allKnown = resolvedBody.every(c => {
      const s = stripEnvPrefix(c.trim());
      return matchesAny(c, knownPatterns) || FILE_WRITE.test(s);
    });
    if (allKnown) {
      // 모든 쓰기 대상 검증: FILE_WRITE + 리다이렉트(>, >>)
      let allWritesOk = true;
      for (const c of resolvedBody) {
        const s = stripEnvPrefix(c.trim());
        // FILE_WRITE 대상 (cp, mv 등)
        if (FILE_WRITE.test(s)) {
          const parts = s.split(/\s+/);
          const args = parts.slice(1).filter(a => !a.startsWith('-') && !a.includes('$'));
          if (args.length > 0) {
            if (!isWriteAllowed(resolve(execDir, args[args.length - 1]), ccRoot)) {
              allWritesOk = false; break;
            }
          } else {
            // $variable 경로: 리터럴 디렉토리가 worktree인지 검증
            const allArgs = parts.slice(1).filter(a => !a.startsWith('-'));
            const dest = allArgs.length > 0 ? allArgs[allArgs.length - 1] : null;
            if (!dest) { allWritesOk = false; break; }
            const rawDest = dest.replace(/["']/g, '');
            const lastSlash = rawDest.lastIndexOf('/');
            if (lastSlash < 0 || !/^\$/.test(rawDest.substring(lastSlash + 1)) || /\$/.test(rawDest.substring(0, lastSlash))) {
              allWritesOk = false; break;
            }
            if (!isWriteAllowed(resolve(execDir, rawDest.substring(0, lastSlash)), ccRoot)) {
              allWritesOk = false; break;
            }
          }
        }
        // 리다이렉트 쓰기 (>, >>, | tee)
        if (hasWriteOutput(c)) {
          const target = extractWriteTarget(c);
          if (!target) { allWritesOk = false; break; }
          const clean = target.replace(/["']/g, '');
          if (clean.includes('$')) {
            const lastSlash = clean.lastIndexOf('/');
            if (lastSlash < 0 || !/^\$/.test(clean.substring(lastSlash + 1)) || /\$/.test(clean.substring(0, lastSlash))) {
              allWritesOk = false; break;
            }
            if (!isWriteAllowed(resolve(execDir, clean.substring(0, lastSlash)), ccRoot)) {
              allWritesOk = false; break;
            }
          } else {
            if (!isWriteAllowed(resolve(execDir, clean), ccRoot)) {
              allWritesOk = false; break;
            }
          }
        }
      }
      if (allWritesOk) {
        permAllow('루프 내 알려진 명령 (worktree)');
        return;
      }
    }
    permPassThrough();
    return;
  }

  // --- SAFE_COMMANDS 사전 체크 (인용문 내 개행/메타문자만 있는 경우) ---
  // gh pr create --body "개행 포함 텍스트" 2>&1 등이 DANGEROUS_SHELL_CHARS에 걸리지 않도록
  // 단, $()와 backtick은 이중 인용문 안에서도 실행되므로 원본에서 먼저 차단
  if (matchesAny(trimmed, SAFE_COMMANDS) && !hasShellExpansion(trimmed)) {
    const noQuoted = trimmed.replace(/"[^"]*"/g, ' ').replace(/'[^']*'/g, ' ');
    const cleaned = noQuoted.replace(/\d*>&\d+/g, ' ').replace(/\d*>\s*\/dev\/null/g, ' ');
    if (!DANGEROUS_SHELL_CHARS.test(cleaned)) {
      permAllow('읽기 전용 명령');
      return;
    }
  }

  // --- 파이프라인 분할: cmd | filter1 | filter2 ---
  const pipeSegments = extractPipeSegments(trimmed);
  if (pipeSegments && pipeSegments.length >= 2) {
    const primary = pipeSegments[0];
    const filters = pipeSegments.slice(1);

    // 필터가 모두 읽기 전용인지 확인
    const allFiltersSafe = filters.every(f => SAFE_PIPE_FILTERS.test(f.trim()));
    if (allFiltersSafe) {
      // primary 명령을 단독으로 재귀 판단
      decideBash(primary, cwd, ccRoot);
      return;
    }
  }

  // --- 메타문자 있으면 복합 명령 → pass-through ---
  if (DANGEROUS_SHELL_CHARS.test(trimmed)) {
    permPassThrough();
    return;
  }

  // --- 단순 명령 (메타문자 없음) ---

  // safe 읽기 → allow
  if (matchesAny(trimmed, SAFE_COMMANDS)) {
    permAllow('읽기 전용 명령');
    return;
  }

  // 빌드/테스트 → worktree 내부면 allow, CC 내부(main/ 등)는 사용자 확인
  if (matchesAny(trimmed, BUILD_TEST)) {
    if (isWriteAllowed(execDir, ccRoot)) {
      permAllow('빌드/테스트 명령 (워크트리 내부)');
      return;
    }
    permPassThrough();
    return;
  }

  // Git 쓰기 → worktree면 allow
  if (matchesAny(trimmed, GIT_WRITE)) {
    if (isWriteAllowed(execDir, ccRoot)) {
      permAllow('Git 명령 (워크트리 내부)');
      return;
    }
    permPassThrough();
    return;
  }

  // 파일 쓰기 → 대상 경로가 worktree면 allow
  if (FILE_WRITE.test(effective)) {
    const parts = effective.split(/\s+/);
    const args = parts.slice(1).filter(a => !a.startsWith('-'));
    const target = args.length > 0 ? args[args.length - 1] : null;

    if (target) {
      const abs = resolve(execDir, target);
      if (isWriteAllowed(abs, ccRoot)) {
        permAllow('파일 명령 (워크트리 내부)');
        return;
      }
    }
    permPassThrough();
    return;
  }

  // 그 외 → pass-through
  permPassThrough();
}

async function main() {
  enforceMinRuntime('permissionRequest');
  const input = await readStdin();

  let data;
  try { data = JSON.parse(input); } catch { permPassThrough(); return; }

  const command = data?.tool_input?.command;
  if (typeof command !== 'string' || !command.trim()) { permPassThrough(); return; }

  const cwd = data.cwd || process.cwd();
  const ccRoot = resolveCCRoot(cwd);

  decideBash(command, cwd, ccRoot);
}

main().catch(() => process.exit(0));
