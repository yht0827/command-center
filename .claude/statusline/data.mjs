/**
 * 데이터 수집 — stdin, transcript, git, config, workspace, usage, session status
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream, readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { homedir } from 'node:os';
import https from 'node:https';

const execFileAsync = promisify(execFile);
const HOME = homedir();

// ═══════════════════════════════════════════════════════════════
// Stdin
// ═══════════════════════════════════════════════════════════════

export async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = chunks.join('');
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function getContextPercent(stdin) {
  const native = stdin?.context_window?.used_percentage;
  if (typeof native === 'number' && !Number.isNaN(native)) {
    return Math.min(100, Math.max(0, Math.round(native)));
  }
  const size = stdin?.context_window?.context_window_size;
  if (!size || size <= 0) return 0;
  const u = stdin?.context_window?.current_usage;
  const total = (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0);
  return Math.min(100, Math.round((total / size) * 100));
}

export function getModelName(stdin) {
  const raw = stdin?.model?.id ?? stdin?.model?.display_name ?? 'unknown';
  // "claude-" 접두사 제거로 공간 절약: "claude-opus-4-6[1m]" → "opus-4-6[1m]"
  return raw.replace(/^claude-/, '');
}

// ═══════════════════════════════════════════════════════════════
// Transcript 파싱
// ═══════════════════════════════════════════════════════════════

export async function parseTranscript(transcriptPath) {
  const result = {
    tools: [], agents: [], todos: [],
    sessionStart: null,
    turnCount: 0,
    totalToolCalls: 0,
    errorCount: 0,
    tokenStats: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    webStats: { search: 0, fetch: 0 },
  };

  if (!transcriptPath || !existsSync(transcriptPath)) return result;

  const toolMap = new Map();
  const agentMap = new Map();
  let latestTodos = [];
  const seenRequests = new Map(); // requestId → usage

  try {
    const rl = createInterface({
      input: createReadStream(transcriptPath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const parsed = entry.timestamp ? new Date(entry.timestamp) : null;
        const ts = (parsed && !isNaN(parsed.getTime())) ? parsed : new Date();

        if (!result.sessionStart && parsed && !isNaN(parsed.getTime())) {
          result.sessionStart = parsed;
        }

        // 사용자 턴 카운트 (도구 결과가 아닌 실제 사용자 메시지)
        if (entry.message?.role === 'user' && !entry.sourceToolAssistantUUID && !entry.isMeta) {
          result.turnCount++;
        }

        // 어시스턴트 메시지 — 토큰 통계
        if (entry.message?.role === 'assistant' && entry.message?.usage) {
          const u = entry.message.usage;
          const reqId = entry.requestId ?? entry.message?.id;
          if (reqId) {
            seenRequests.set(reqId, u); // 마지막 chunk 우선
          }
          // 웹 통계
          const stu = u.server_tool_use;
          if (stu) {
            result.webStats.search += stu.web_search_requests ?? 0;
            result.webStats.fetch += stu.web_fetch_requests ?? 0;
          }
        }

        // 도구 사용 / 결과
        const content = entry.message?.content;
        if (!content || !Array.isArray(content)) continue;

        for (const block of content) {
          if (block.type === 'tool_use' && block.id && block.name) {
            result.totalToolCalls++;

            if (block.name === 'Task' || block.name === 'Agent') {
              const input = block.input ?? {};
              agentMap.set(block.id, {
                id: block.id,
                type: input.subagent_type ?? 'unknown',
                model: input.model,
                description: input.description,
                status: 'running',
                startTime: ts,
              });
            } else if (block.name === 'TodoWrite' || block.name === 'TaskCreate') {
              const input = block.input ?? {};
              if (input.todos && Array.isArray(input.todos)) {
                latestTodos = [...input.todos];
              }
            } else {
              toolMap.set(block.id, {
                id: block.id,
                name: block.name,
                target: extractTarget(block.name, block.input),
                status: 'running',
                startTime: ts,
              });
            }
          }

          if (block.type === 'tool_result' && block.tool_use_id) {
            const tool = toolMap.get(block.tool_use_id);
            if (tool) {
              tool.status = block.is_error ? 'error' : 'completed';
              tool.endTime = ts;
              if (block.is_error) result.errorCount++;
            }
            const agent = agentMap.get(block.tool_use_id);
            if (agent) {
              agent.status = 'completed';
              agent.endTime = ts;
            }
          }
        }
      } catch { /* skip malformed lines */ }
    }
  } catch { /* return partial results */ }

  // 토큰 집계 (requestId별 마지막 usage)
  for (const u of seenRequests.values()) {
    result.tokenStats.input += u.input_tokens ?? 0;
    result.tokenStats.output += u.output_tokens ?? 0;
    result.tokenStats.cacheRead += u.cache_read_input_tokens ?? 0;
    result.tokenStats.cacheWrite += u.cache_creation_input_tokens ?? 0;
  }

  result.tools = Array.from(toolMap.values()).slice(-20);
  result.agents = Array.from(agentMap.values()).slice(-10);
  result.todos = latestTodos;

  return result;
}

function extractTarget(name, input) {
  if (!input) return undefined;
  switch (name) {
    case 'Read': case 'Write': case 'Edit':
      return input.file_path ?? input.path;
    case 'Glob': case 'Grep':
      return input.pattern;
    case 'Bash': {
      const cmd = input.command;
      return cmd ? cmd.slice(0, 30) + (cmd.length > 30 ? '...' : '') : undefined;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Git
// ═══════════════════════════════════════════════════════════════

export async function getGitStatus(cwd) {
  if (!cwd) return null;
  try {
    const { stdout: branchOut } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeout: 1000 });
    const branch = branchOut.trim();
    if (!branch) return null;

    let isDirty = false, fileStats;
    try {
      const { stdout: st } = await execFileAsync('git', ['--no-optional-locks', 'status', '--porcelain'], { cwd, timeout: 1000 });
      const trimmed = st.trim();
      isDirty = trimmed.length > 0;
      if (isDirty) {
        const stats = { modified: 0, added: 0, deleted: 0, untracked: 0 };
        for (const line of trimmed.split('\n')) {
          if (line.startsWith('??')) stats.untracked++;
          else if (line[0] === 'A') stats.added++;
          else if (line[0] === 'D' || line[1] === 'D') stats.deleted++;
          else if ('MRC'.includes(line[0]) || line[1] === 'M') stats.modified++;
        }
        fileStats = stats;
      }
    } catch { /* clean */ }

    let ahead = 0, behind = 0;
    try {
      const { stdout: rev } = await execFileAsync('git', ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], { cwd, timeout: 1000 });
      const parts = rev.trim().split(/\s+/);
      if (parts.length === 2) { behind = parseInt(parts[0]) || 0; ahead = parseInt(parts[1]) || 0; }
    } catch { /* no upstream */ }

    return { branch, isDirty, ahead, behind, fileStats };
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// Config 카운트
// ═══════════════════════════════════════════════════════════════

export function countConfigs(cwd) {
  let claudeMdCount = 0, rulesCount = 0, mcpCount = 0, hooksCount = 0;

  const claudeDir = join(HOME, '.claude');

  // User scope
  if (existsSync(join(claudeDir, 'CLAUDE.md'))) claudeMdCount++;
  rulesCount += countRulesDir(join(claudeDir, 'rules'));
  const userSettings = readJsonSafe(join(claudeDir, 'settings.json'));
  mcpCount += countKeys(userSettings?.mcpServers);
  hooksCount += countKeys(userSettings?.hooks);

  // Project scope
  if (cwd) {
    for (const p of ['CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md', '.claude/CLAUDE.local.md']) {
      if (existsSync(join(cwd, p))) claudeMdCount++;
    }
    rulesCount += countRulesDir(join(cwd, '.claude', 'rules'));

    const projSettings = readJsonSafe(join(cwd, '.claude', 'settings.json'));
    mcpCount += countKeys(projSettings?.mcpServers);
    hooksCount += countKeys(projSettings?.hooks);

    const mcpJson = readJsonSafe(join(cwd, '.mcp.json'));
    mcpCount += countKeys(mcpJson?.mcpServers);
  }

  return { claudeMdCount, rulesCount, mcpCount, hooksCount };
}

function countRulesDir(dir) {
  if (!existsSync(dir)) return 0;
  let count = 0;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) count += countRulesDir(join(dir, e.name));
      else if (e.isFile() && e.name.endsWith('.md')) count++;
    }
  } catch { /* ignore */ }
  return count;
}

function countKeys(obj) {
  return obj && typeof obj === 'object' ? Object.keys(obj).length : 0;
}

function readJsonSafe(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// Usage API (쿼터)
// ═══════════════════════════════════════════════════════════════

const CACHE_PATH = join(HOME, '.claude', 'plugins', 'cc-statusline', '.usage-cache.json');
const CACHE_TTL = 60_000;

export async function getUsage() {
  // 캐시 확인
  const now = Date.now();
  try {
    if (existsSync(CACHE_PATH)) {
      const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
      if (now - cache.timestamp < CACHE_TTL) return cache.data;
    }
  } catch { /* ignore */ }

  try {
    const creds = readCredentials(now);
    if (!creds) return null;

    const planName = getPlanName(creds.subscriptionType);
    if (!planName) return null;

    const resp = await fetchUsage(creds.accessToken);
    if (!resp) return null;

    const data = {
      planName,
      fiveHour: clamp(resp.five_hour?.utilization),
      sevenDay: clamp(resp.seven_day?.utilization),
      fiveHourResetAt: resp.five_hour?.resets_at ?? null,
      sevenDayResetAt: resp.seven_day?.resets_at ?? null,
    };

    // 캐시 저장
    try {
      const dir = join(HOME, '.claude', 'plugins', 'cc-statusline');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(CACHE_PATH, JSON.stringify({ data, timestamp: now }));
    } catch { /* ignore */ }

    return data;
  } catch { return null; }
}

function readCredentials(now) {
  if (process.platform !== 'darwin') return null;
  try {
    const raw = execFileSync('/usr/bin/security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }
    ).trim();
    if (!raw) return null;
    const data = JSON.parse(raw);
    const oauth = data.claudeAiOauth;
    if (!oauth?.accessToken) return null;
    if (oauth.expiresAt != null && oauth.expiresAt <= now) return null;
    return { accessToken: oauth.accessToken, subscriptionType: oauth.subscriptionType ?? '' };
  } catch { return null; }
}

function getPlanName(subType) {
  const l = (subType ?? '').toLowerCase();
  if (l.includes('max')) return 'Max';
  if (l.includes('pro')) return 'Pro';
  if (l.includes('team')) return 'Team';
  if (!subType || l.includes('api')) return null;
  return subType.charAt(0).toUpperCase() + subType.slice(1);
}

function clamp(v) {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(Math.max(0, Math.min(100, v)));
}

function fetchUsage(accessToken) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) { resolve(null); return; }
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// Workspace 통계
// ═══════════════════════════════════════════════════════════════

export function getWorkspaceStats(cwd) {
  const stats = { domains: 0, projects: 0, worktrees: 0 };
  if (!cwd) return stats;

  // 도메인: ontology/abox/*.yaml
  try {
    const aboxDir = join(cwd, 'ontology', 'abox');
    if (existsSync(aboxDir)) {
      stats.domains = readdirSync(aboxDir).filter(f =>
        f.endsWith('.yaml') && f !== 'infra.yaml' && f !== 'cross-domain.yaml'
      ).length;
    }
  } catch { /* ignore */ }

  // 프로젝트: projects/*/main (격리 구조)
  try {
    const projDir = join(cwd, 'projects');
    if (existsSync(projDir)) {
      stats.projects = readdirSync(projDir, { withFileTypes: true })
        .filter(d => d.isDirectory()).length;
    }
  } catch { /* ignore */ }

  // 워크트리: worktrees/*
  try {
    const wtDir = join(cwd, 'worktrees');
    if (existsSync(wtDir)) {
      stats.worktrees = readdirSync(wtDir, { withFileTypes: true })
        .filter(d => d.isDirectory()).length;
    }
  } catch { /* ignore */ }

  return stats;
}

// ═══════════════════════════════════════════════════════════════
// 세션 상태 (session-start 훅에서 기록)
// ═══════════════════════════════════════════════════════════════

import { SESSION_STATUS_FILE } from './constants.mjs';

export function getSessionStatus() {
  try {
    if (existsSync(SESSION_STATUS_FILE)) return readFileSync(SESSION_STATUS_FILE, 'utf8').trim();
  } catch { /* ignore */ }
  return 'ready';
}
