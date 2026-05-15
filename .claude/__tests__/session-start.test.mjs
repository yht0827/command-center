#!/usr/bin/env node
/**
 * session-start 훅 테스트
 *
 * 임시 git 환경에서 syncRepo()의 분기 동작을 검증한다.
 */

import { describe, it, before, after } from 'node:test';
import { strictEqual } from 'node:assert';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { syncRepo } from '../hooks/session-start.mjs';

let tmpDir;
let bareRepo;
let workRepo;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'session-start-test-'));
  bareRepo = join(tmpDir, 'bare.git');
  workRepo = join(tmpDir, 'work');

  // bare repo 생성 (시스템 git config의 init.defaultBranch에 의존하지 않도록 main 명시)
  execSync(`git -c init.defaultBranch=main init --bare "${bareRepo}"`, { stdio: 'pipe' });

  // clone + 초기 커밋
  execSync(`git clone "${bareRepo}" "${workRepo}"`, { stdio: 'pipe' });
  execSync('git config user.email "test@test.com" && git config user.name "test"', {
    cwd: workRepo, stdio: 'pipe',
  });
  writeFileSync(join(workRepo, 'README.md'), 'init');
  execSync('git add . && git commit -m "init" && git push', {
    cwd: workRepo, stdio: 'pipe',
  });
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// main 브랜치
// ============================================================================

describe('main 브랜치', () => {
  it('최신 상태면 up-to-date 반환', () => {
    const result = syncRepo(workRepo);
    strictEqual(result, 'up-to-date');
  });

  it('remote에 새 커밋이 있으면 pull 후 pulled 반환', () => {
    // bare에 직접 커밋 추가 (tmpclone 경유)
    const tmpClone = join(tmpDir, 'tmpclone');
    execSync(`git clone "${bareRepo}" "${tmpClone}"`, { stdio: 'pipe' });
    execSync('git config user.email "t@t.com" && git config user.name "t"', {
      cwd: tmpClone, stdio: 'pipe',
    });
    writeFileSync(join(tmpClone, 'new.txt'), 'new');
    execSync('git add . && git commit -m "new" && git push', {
      cwd: tmpClone, stdio: 'pipe',
    });
    rmSync(tmpClone, { recursive: true, force: true });

    const result = syncRepo(workRepo);
    strictEqual(result, 'pulled');
  });
});

// ============================================================================
// 다른 브랜치
// ============================================================================

describe('다른 브랜치', () => {
  before(() => {
    execSync('git checkout -b feature-test', { cwd: workRepo, stdio: 'pipe' });
  });

  after(() => {
    execSync('git checkout main', { cwd: workRepo, stdio: 'pipe' });
  });

  it('skip:branch 반환', () => {
    strictEqual(syncRepo(workRepo), 'skip:branch');
  });
});

// ============================================================================
// uncommitted 변경 (tracked 파일)
// ============================================================================

describe('uncommitted 변경 (tracked 파일)', () => {
  before(() => {
    writeFileSync(join(workRepo, 'README.md'), 'modified');
  });

  after(() => {
    execSync('git checkout -- README.md', { cwd: workRepo, stdio: 'pipe' });
  });

  it('skip:dirty 반환', () => {
    strictEqual(syncRepo(workRepo), 'skip:dirty');
  });
});

// ============================================================================
// untracked 파일은 dirty로 취급하지 않음
// ============================================================================

describe('untracked 파일', () => {
  before(() => {
    writeFileSync(join(workRepo, 'untracked.txt'), 'untracked');
  });

  after(() => {
    rmSync(join(workRepo, 'untracked.txt'));
  });

  it('untracked 파일은 무시하고 정상 pull', () => {
    const result = syncRepo(workRepo);
    strictEqual(result, 'up-to-date');
  });
});

// ============================================================================
// remote 없는 repo
// ============================================================================

describe('remote 없는 repo', () => {
  let localRepo;

  before(() => {
    localRepo = join(tmpDir, 'local-only');
    execSync(`git -c init.defaultBranch=main init "${localRepo}"`, { stdio: 'pipe' });
    execSync('git config user.email "t@t.com" && git config user.name "t"', {
      cwd: localRepo, stdio: 'pipe',
    });
    writeFileSync(join(localRepo, 'f.txt'), 'x');
    execSync('git add . && git commit -m "init"', { cwd: localRepo, stdio: 'pipe' });
  });

  after(() => {
    rmSync(localRepo, { recursive: true, force: true });
  });

  it('pull 실패해도 error 반환 (세션 중단 없음)', () => {
    strictEqual(syncRepo(localRepo), 'error');
  });
});
