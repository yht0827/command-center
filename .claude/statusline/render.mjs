/**
 * Command Center 5-Panel 렌더러
 *
 * ╔═══ ⬢ COMMAND CENTER ═══════════════════════════ ◉ READY ═══╗
 * ╠═ CORE ═══════════════════════╤═ SUPPLY ═════════════════════╣
 * ║  ...                         │  ...                         ║
 * ╠═ GIT ═══════════════════════════════╧═══════════════════════╣
 * ║  ...                                                        ║
 * ╠═ OPS ════════════════════════╤═ BASE ═══════════════════════╣
 * ║  ...                         │  ...                         ║
 * ╚══════════════════════════════╧══════════════════════════════╝
 */

import {
  RESET, dim, red, green, yellow, magenta, cyan, white,
  brightGreen, brightCyan, brightRed, brightBlue, brightMagenta,
  gauge, ctxColor, fmtTokens, fmtDuration, fmtTimeUntil,
} from './colors.mjs';

// 레이아웃 상수
// 전체: ║ + SP + content + ║ = W
// 2컬럼: ║ + SP + left + │ + SP + right + ║ = W → left + right = W - 5
const W = 80;
const IW = W - 3;              // 단일 컬럼 콘텐츠 폭 (77)
const LW = 38;                 // 좌 컬럼 폭
const RW = W - 5 - LW;        // 우 컬럼 폭 (37)
const NBSP = '\u00A0';

function out(line) {
  // claude-hud 방식: 공백을 NBSP로, RESET prefix
  console.log(`${RESET}${line.replace(/ /g, NBSP)}`);
}

function isWide(cp) {
  return (cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0x9FFF) ||
    (cp >= 0xAC00 && cp <= 0xD7AF) || (cp >= 0xF900 && cp <= 0xFAFF) ||
    (cp >= 0xFE30 && cp <= 0xFE6F) || (cp >= 0xFF01 && cp <= 0xFF60) ||
    (cp >= 0x20000 && cp <= 0x2FA1F);
}

function pad(s, len) {
  const diff = len - visWidth(s);
  return diff > 0 ? s + ' '.repeat(diff) : s;
}

/** 콘텐츠를 컬럼 폭에 맞춤: 짧으면 패딩, 길면 ANSI-aware truncation */
function fitAnsi(s, maxW) {
  const vw = visWidth(s);
  if (vw <= maxW) return s + ' '.repeat(maxW - vw);
  // ANSI 이스케이프를 건너뛰며 시각 폭 기준으로 자름
  let w = 0;
  let idx = 0;
  const len = s.length;
  while (idx < len) {
    if (s.charCodeAt(idx) === 0x1b) {
      const m = s.indexOf('m', idx);
      if (m !== -1) { idx = m + 1; continue; }
    }
    const cp = s.codePointAt(idx);
    const cw = isWide(cp) ? 2 : 1;
    if (w + cw > maxW - 1) {
      const remaining = maxW - w - 1;
      return s.slice(0, idx) + RESET + '…' + ' '.repeat(Math.max(0, remaining));
    }
    w += cw;
    idx += cp > 0xFFFF ? 2 : 1;
  }
  return s;
}

// ═══════════════════════════════════════════════════════════════
// 헤더 / 푸터
// ═══════════════════════════════════════════════════════════════

function visWidth(s) {
  const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
  let w = 0;
  for (const ch of visible) {
    w += isWide(ch.codePointAt(0)) ? 2 : 1;
  }
  return w;
}

function renderHeader(status, errorCount) {
  const title = brightCyan('COMMAND CENTER');

  let badge;
  if (errorCount > 0) {
    badge = brightRed(`! ${errorCount} ERROR${errorCount > 1 ? 'S' : ''}`);
  } else if (status === 'pulled') {
    badge = brightCyan('* UPDATED & READY');
  } else if (status === 'skip:branch') {
    badge = dim('- BRANCH SKIP');
  } else if (status === 'skip:dirty') {
    badge = yellow('- DIRTY SKIP');
  } else if (status === 'error') {
    badge = brightRed('! SYNC ERROR');
  } else {
    badge = brightGreen('* READY');
  }

  // ╔═══ SP title SP fill SP badge SP ═══╗ = W
  // 1+3+1 + titleW + 1 + fill + 1 + badgeW + 1+3+1 = W
  const titleW = visWidth(title);
  const badgeW = visWidth(badge);
  const fillLen = W - 12 - titleW - badgeW;
  const fill = '═'.repeat(Math.max(1, fillLen));

  out(`${white('╔═══')} ${title} ${white(fill)} ${badge} ${white('═══╗')}`);
}

function renderDivider(leftLabel, rightLabel, closeDualCol) {
  if (rightLabel) {
    // ╤ 위치를 renderRow의 │ 위치 (= 2 + LW) 에 맞춤
    // ╠═ LABEL SP leftFill ╤═ LABEL SP rightFill ╣
    // pos(╤) = 3 + l1 + 1 + lf = 2 + LW → lf = LW - 2 - l1
    const lf = Math.max(1, LW - 2 - leftLabel.length);
    const rf = Math.max(1, W - 9 - leftLabel.length - rightLabel.length - lf);
    out(`${white('╠═')} ${yellow(leftLabel)} ${white('═'.repeat(lf) + '╤═')} ${yellow(rightLabel)} ${white('═'.repeat(rf) + '╣')}`);
  } else if (closeDualCol) {
    // 이전 2컬럼의 │를 ╧로 닫는다
    const junc = 2 + LW; // ╧ 위치 = │ 위치
    const labelEnd = 3 + leftLabel.length + 1;
    const fill1 = Math.max(1, junc - labelEnd);
    const fill2 = Math.max(1, W - junc - 2);
    out(`${white('╠═')} ${yellow(leftLabel)} ${white('═'.repeat(fill1) + '╧' + '═'.repeat(fill2) + '╣')}`);
  } else {
    const fill = Math.max(1, W - 5 - leftLabel.length);
    out(`${white('╠═')} ${yellow(leftLabel)} ${white('═'.repeat(fill) + '╣')}`);
  }
}

function renderFooter(hasRightCol) {
  if (hasRightCol) {
    // ╚═══╧═══╝ = W → lf + rf = W - 3
    const lf = LW + 1; // left col + leading space
    const rf = W - 3 - lf;
    out(`${white('╚' + '═'.repeat(lf) + '╧' + '═'.repeat(rf) + '╝')}`);
  } else {
    out(`${white('╚' + '═'.repeat(W - 2) + '╝')}`);
  }
}

function renderRow(left, right) {
  if (right !== undefined) {
    out(`${white('║')} ${fitAnsi(left, LW)}${white('│')} ${fitAnsi(right, RW)}${white('║')}`);
  } else {
    out(`${white('║')} ${fitAnsi(left, IW)}${white('║')}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// CORE 패널
// ═══════════════════════════════════════════════════════════════

function truncate(s, maxW) {
  let w = 0;
  let i = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const cw = ((cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0x9FFF) ||
      (cp >= 0xAC00 && cp <= 0xD7AF) || (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE30 && cp <= 0xFE6F) || (cp >= 0xFF01 && cp <= 0xFF60) ||
      (cp >= 0x20000 && cp <= 0x2FA1F)) ? 2 : 1;
    if (w + cw > maxW - 1) return s.slice(0, i) + '…';
    w += cw;
    i += ch.length;
  }
  return s;
}

function renderCore(ctx) {
  const { stdin, transcript, sessionDuration, contextPercent, usageData } = ctx;
  const plan = usageData?.planName;
  const planTag = plan ? cyan(`[${plan}]`) : dim('[API]');
  const modelName = truncate(ctx.modelName, 18);
  const model = white(modelName);
  const duration = dim(`${sessionDuration}`);
  const turns = dim(`${transcript.turnCount}턴`);

  return [
    `${model} ${planTag} ${duration} ${turns}`,
    ` CTX ${gauge(contextPercent)} ${ctxColor(contextPercent)(`${contextPercent}%`)}${contextPercent >= 85 ? brightRed('!') : ''}`,
    ...(usageData?.fiveHour != null ? [renderQuotaLine('5HR', usageData.fiveHour, usageData.fiveHourResetAt)] : []),
    ...(usageData?.sevenDay != null && usageData.sevenDay >= 80 ? [renderQuotaLine('7DR', usageData.sevenDay, usageData.sevenDayResetAt)] : []),
  ];
}

function renderQuotaLine(label, percent, resetAt) {
  const bar = gauge(percent, 20);
  const pct = percent >= 90 ? brightRed(`${percent}%!`) : `${percent}%`;
  const reset = resetAt ? dim(`R ${fmtTimeUntil(resetAt)}`) : '';
  return ` ${label} ${bar} ${pct} ${reset}`;
}

// ═══════════════════════════════════════════════════════════════
// SUPPLY 패널
// ═══════════════════════════════════════════════════════════════

function renderSupply(ctx) {
  const { transcript, contextPercent } = ctx;
  const ts = transcript.tokenStats;
  const totalInput = ts.input + ts.cacheRead + ts.cacheWrite;
  const hitRate = totalInput > 0 ? Math.round((ts.cacheRead / totalInput) * 100) : 0;

  // 비용 추정 (claude-opus-4 기준 대략적)
  const cost = estimateCost(ts);

  const lines = [
    `입력 ${cyan(fmtTokens(ts.input))}  출력 ${yellow(fmtTokens(ts.output))}  ${dim(`~$${cost}`)}`,
    `캐시 ${brightBlue(fmtTokens(ts.cacheRead))}r ${dim(fmtTokens(ts.cacheWrite))}w  적중 ${green(`${hitRate}%`)}`,
  ];

  // 컨텍스트 위험 시 상세 전개
  if (contextPercent >= 85) {
    const u = ctx.stdin?.context_window?.current_usage;
    if (u) {
      lines.push(dim(`ctx: in ${fmtTokens(u.input_tokens)} cr ${fmtTokens(u.cache_read_input_tokens)} cw ${fmtTokens(u.cache_creation_input_tokens)}`));
    }
  }

  if (transcript.webStats.search > 0 || transcript.webStats.fetch > 0) {
    const parts = [];
    if (transcript.webStats.search > 0) parts.push(`검색 ${transcript.webStats.search}`);
    if (transcript.webStats.fetch > 0) parts.push(`fetch ${transcript.webStats.fetch}`);
    lines.push(dim(`웹 ${parts.join(' | ')}`));
  }

  return lines;
}

function estimateCost(ts) {
  // Claude Opus 4 대략 가격: input $15/M, output $75/M, cache_read $1.875/M, cache_write $18.75/M
  const c = (ts.input * 15 + ts.output * 75 + ts.cacheRead * 1.875 + ts.cacheWrite * 18.75) / 1_000_000;
  return c < 0.01 ? '0.00' : c.toFixed(2);
}

// ═══════════════════════════════════════════════════════════════
// GIT 패널
// ═══════════════════════════════════════════════════════════════

function renderGit(ctx) {
  const git = ctx.gitStatus;
  if (!git) return [dim('git 정보 없음')];

  // cwd에서 프로젝트명 추출: 마지막 1~2 경로 세그먼트
  const cwd = ctx.stdin?.cwd ?? '';
  const segments = cwd.split('/').filter(Boolean);
  const projName = segments.length > 0 ? dim(segments.slice(-1)[0] + ':') : '';

  const branch = `${projName} ${cyan(git.branch)}${git.isDirty ? yellow('*') : ''}`;
  const parts = [branch];

  if (git.ahead > 0) parts.push(green(`+${git.ahead}`));
  if (git.behind > 0) parts.push(red(`-${git.behind}`));

  const fs = git.fileStats;
  if (fs) {
    const fsParts = [];
    if (fs.modified > 0) fsParts.push(yellow(`수정:${fs.modified}`));
    if (fs.added > 0) fsParts.push(green(`추가:${fs.added}`));
    if (fs.deleted > 0) fsParts.push(red(`삭제:${fs.deleted}`));
    if (fs.untracked > 0) fsParts.push(dim(`미추적:${fs.untracked}`));
    if (fsParts.length > 0) parts.push(fsParts.join(' '));
  }

  return [parts.join('  ')];
}

// ═══════════════════════════════════════════════════════════════
// OPS 패널
// ═══════════════════════════════════════════════════════════════

function renderOps(ctx) {
  const { transcript } = ctx;
  const lines = [];

  // 실행 중인 도구 — 타겟을 좌 컬럼(LW)에 맞춰 truncate
  const running = transcript.tools.filter(t => t.status === 'running').slice(-2);
  for (const t of running) {
    const prefix = `${yellow('~')} ${cyan(t.name)}`;
    const prefixW = visWidth(prefix);
    if (t.target) {
      const maxTarget = LW - prefixW - 2; // ": " 포함
      const trimmed = maxTarget > 3 ? truncate(t.target, maxTarget) : '';
      lines.push(`${prefix}${dim(`: ${trimmed}`)}`);
    } else {
      lines.push(prefix);
    }
  }

  // 완료된 도구 통계
  const completed = {};
  for (const t of transcript.tools) {
    if (t.status === 'completed') completed[t.name] = (completed[t.name] || 0) + 1;
  }
  const sorted = Object.entries(completed).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (sorted.length > 0) {
    // LW에 맞춰 줄바꿈 — 한 줄에 다 안 들어가면 다음 줄로
    const parts = sorted.map(([name, count]) => {
      const colored = `${green('+')} ${name}${dim(`x${count}`)}`;
      return { colored, width: visWidth(colored) };
    });
    let line = '';
    let lineW = 0;
    for (const part of parts) {
      const sepW = line ? 1 : 0;
      if (line && lineW + sepW + part.width > LW) {
        lines.push(line);
        line = part.colored;
        lineW = part.width;
      } else {
        line += (line ? ' ' : '') + part.colored;
        lineW += sepW + part.width;
      }
    }
    if (line) lines.push(line);
  }

  // 실행 중인 에이전트 — 설명을 좌 컬럼에 맞춰 truncate
  const runningAgents = transcript.agents.filter(a => a.status === 'running').slice(-2);
  for (const a of runningAgents) {
    const elapsed = a.startTime ? fmtDuration(Date.now() - a.startTime.getTime()) : '';
    const modelTag = a.model ? dim(`[${a.model.replace('claude-', '').slice(0, 4)}]`) : '';
    const prefix = `${yellow('~')} ${magenta(a.type)} ${modelTag}`;
    const prefixW = visWidth(prefix);
    const elapsedW = elapsed.length + 1;
    if (a.description) {
      const maxDesc = LW - prefixW - elapsedW - 2;
      const trimmed = maxDesc > 3 ? truncate(a.description, maxDesc) : '';
      lines.push(`${prefix}${dim(`: ${trimmed}`)} ${dim(elapsed)}`);
    } else {
      lines.push(`${prefix} ${dim(elapsed)}`);
    }
  }

  // 할일 + 진척도 바
  const todos = transcript.todos;
  if (todos.length > 0) {
    const inProgress = todos.find(t => t.status === 'in_progress');
    const done = todos.filter(t => t.status === 'completed').length;
    const total = todos.length;
    const pct = Math.round((done / total) * 100);
    const progressBar = gauge(pct, 10);

    if (done === total) {
      lines.push(`${green('+')} 완료 ${progressBar} ${dim(`${done}/${total}`)}`);
    } else if (inProgress) {
      const maxContent = LW - 20; // 바(10) + 카운트 + 여백
      const content = truncate(inProgress.content ?? '', maxContent);
      lines.push(`${yellow('o')} ${content}`);
      lines.push(`  ${progressBar} ${dim(`${done}/${total}`)}`);
    } else {
      lines.push(`${dim('o')} ${progressBar} ${dim(`${done}/${total} 대기`)}`);
    }
  }

  if (lines.length === 0) {
    lines.push(dim('── 대기 중 ──'));
  }

  return lines;
}

// ═══════════════════════════════════════════════════════════════
// BASE 패널
// ═══════════════════════════════════════════════════════════════

function renderBase(ctx) {
  const { workspace, configs } = ctx;
  const lines = [];

  const items1 = [];
  if (workspace.domains > 0) items1.push(`${workspace.domains} 도메인`);
  if (workspace.projects > 0) items1.push(`${workspace.projects} 프로젝트`);
  if (workspace.worktrees > 0) items1.push(`${workspace.worktrees} 워크트리`);
  if (items1.length > 0) lines.push(`${dim('>')} ${dim(items1.join(' | '))}`);

  const items2 = [];
  if (configs.rulesCount > 0) items2.push(`${configs.rulesCount} 규칙`);
  if (configs.mcpCount > 0) items2.push(`${configs.mcpCount} MCP`);
  if (configs.hooksCount > 0) items2.push(`${configs.hooksCount} 훅`);
  if (items2.length > 0) lines.push(`${dim('>')} ${dim(items2.join(' | '))}`);

  if (lines.length === 0) lines.push(dim('> --'));

  return lines;
}

// ═══════════════════════════════════════════════════════════════
// 메인 렌더
// ═══════════════════════════════════════════════════════════════

function renderSummaryLine(ctx) {
  const model = ctx.modelName;
  const plan = ctx.usageData?.planName;
  const planTag = plan ? `[${plan}]` : '[API]';
  const pct = ctx.contextPercent;
  const dur = ctx.sessionDuration;
  const git = ctx.gitStatus;
  const branch = git ? `${git.branch}${git.isDirty ? '*' : ''}` : '';

  const parts = [cyan('CC'), model, planTag, `${pct}%`, dur];
  if (branch) parts.push(branch);
  out(parts.join(' | '));
}

export function render(ctx) {
  // 첫 줄: 요약 (좁은 터미널에서는 이 줄만 보임)
  renderSummaryLine(ctx);

  const coreLines = renderCore(ctx);
  const supplyLines = renderSupply(ctx);
  const gitLines = renderGit(ctx);
  const opsLines = renderOps(ctx);
  const baseLines = renderBase(ctx);

  // ── 헤더 ──
  renderHeader(ctx.sessionStatus, ctx.transcript.errorCount);

  // ── CORE │ SUPPLY ──
  renderDivider('CORE', 'SUPPLY');
  const maxCoreSup = Math.max(coreLines.length, supplyLines.length);
  for (let i = 0; i < maxCoreSup; i++) {
    renderRow(coreLines[i] ?? '', supplyLines[i] ?? '');
  }

  // ── GIT ──
  renderDivider('GIT', null, true);
  for (const line of gitLines) {
    renderRow(line);
  }

  // ── OPS │ BASE ──
  renderDivider('OPS', 'BASE');
  const maxOpsBase = Math.max(opsLines.length, baseLines.length);
  for (let i = 0; i < maxOpsBase; i++) {
    renderRow(opsLines[i] ?? '', baseLines[i] ?? '');
  }

  // ── 푸터 ──
  renderFooter(true);
}
