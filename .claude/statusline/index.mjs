#!/usr/bin/env node
/**
 * Command Center Statusline
 *
 * 5-panel dashboard: CORE · SUPPLY · GIT · OPS · BASE
 * claude-hud를 대체하여 커맨드 센터 전용 계기판을 제공한다.
 */

import {
  readStdin, getContextPercent, getModelName,
  parseTranscript, getGitStatus, countConfigs,
  getUsage, getWorkspaceStats, getSessionStatus,
} from './data.mjs';
import { render } from './render.mjs';
import { fmtDuration } from './colors.mjs';

async function main() {
  try {
    const stdin = await readStdin();
    if (!stdin) {
      console.log('Command Center initializing...');
      return;
    }

    const transcriptPath = stdin.transcript_path ?? '';

    // 병렬 데이터 수집
    const [transcript, gitStatus, usageData] = await Promise.all([
      parseTranscript(transcriptPath),
      getGitStatus(stdin.cwd),
      getUsage(),
    ]);

    // 동기 데이터 수집
    const configs = countConfigs(stdin.cwd);
    const workspace = getWorkspaceStats(stdin.cwd);
    const sessionStatus = getSessionStatus();

    // 세션 시간
    const now = Date.now();
    const sessionMs = transcript.sessionStart
      ? now - transcript.sessionStart.getTime()
      : 0;
    const sessionDuration = fmtDuration(sessionMs);

    const ctx = {
      stdin,
      transcript,
      gitStatus,
      usageData,
      configs,
      workspace,
      sessionStatus,
      sessionDuration,
      contextPercent: getContextPercent(stdin),
      modelName: getModelName(stdin),
    };

    render(ctx);
  } catch (error) {
    console.log(`Command Center error: ${error.message}`);
  }
}

main();
