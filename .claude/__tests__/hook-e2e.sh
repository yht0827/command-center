#!/bin/bash
# E2E 시나리오 테스트 — 3단 훅 구조 검증
# branch-guard (PreToolUse) + pre-tool-use (PreToolUse) + permission-handler (PermissionRequest)
set -uo pipefail

HOOK_DIR="$(cd "$(dirname "$0")/../hooks" && pwd)"
cd "$HOOK_DIR/../.."  # .claude/hooks/ → .claude/ → worktree 루트

CWD=$(pwd)
# CC_ROOT: config.mjs의 CC_ROOT와 동일 로직
# git worktree 감지: .git이 파일이면 worktree → main repo로 역추적
CC_ROOT="$CWD"
if [ -f "$CWD/.git" ]; then
  gitdir=$(cat "$CWD/.git" | sed 's/gitdir: //')
  CC_ROOT=$(cd "$gitdir/../../.." && pwd)
fi

BRANCH_GUARD="node $HOOK_DIR/branch-guard.mjs"
PRE_TOOL="node $HOOK_DIR/pre-tool-use.mjs"
PERM_HANDLER="node $HOOK_DIR/permission-handler.mjs"

PASS=0
FAIL=0
TOTAL=0

parse_decision() {
  local result="$1"
  if [ -z "$result" ]; then
    echo "pass-through"
  else
    echo "$result" | node -e "
      const d=require('fs').readFileSync(0,'utf-8');
      try {
        const j=JSON.parse(d);
        const h=j.hookSpecificOutput||{};
        const p=h.permissionDecision||'';
        const b=(h.decision||{}).behavior||'';
        if(p) console.log(p);
        else if(b) console.log(b);
        else console.log('pass-through');
      } catch { console.log('parse-error'); }
    "
  fi
}

# E2E: branch-guard → pre-tool-use → settings.allow → permission-handler → 사용자 확인
test_e2e() {
  local desc="$1"
  local input="$2"
  local expected="$3"
  local settings_allow="${4:-no}"
  TOTAL=$((TOTAL+1))

  local tool_name
  tool_name=$(echo "$input" | node -e "
    const d=require('fs').readFileSync(0,'utf-8');
    try { console.log(JSON.parse(d).tool_name||''); } catch { console.log(''); }
  ")

  # Step 1: branch-guard (Bash만)
  if [ "$tool_name" = "Bash" ]; then
    local bg_result
    bg_result=$(echo "$input" | $BRANCH_GUARD 2>/dev/null)
    local bg_decision
    bg_decision=$(parse_decision "$bg_result")
    if [ "$bg_decision" = "deny" ]; then
      if [ "$expected" = "deny" ]; then
        echo "  ✓ $desc"; PASS=$((PASS+1))
      else
        echo "  ✗ $desc (branch-guard deny, expected=$expected)"; FAIL=$((FAIL+1))
      fi
      return
    fi
  fi

  # Step 2: pre-tool-use (전체)
  local pt_result
  pt_result=$(echo "$input" | $PRE_TOOL 2>/dev/null)
  local pt_decision
  pt_decision=$(parse_decision "$pt_result")
  if [ "$pt_decision" = "allow" ]; then
    if [ "$expected" = "allow" ]; then
      echo "  ✓ $desc"; PASS=$((PASS+1))
    else
      echo "  ✗ $desc (pre-tool-use allow, expected=$expected)"; FAIL=$((FAIL+1))
    fi
    return
  fi
  if [ "$pt_decision" = "deny" ]; then
    if [ "$expected" = "deny" ]; then
      echo "  ✓ $desc (pre-tool-use deny)"; PASS=$((PASS+1))
    else
      echo "  ✗ $desc (pre-tool-use deny, expected=$expected)"; FAIL=$((FAIL+1))
    fi
    return
  fi

  # Step 3: settings.allow 시뮬레이션
  if [ "$settings_allow" = "yes" ]; then
    if [ "$expected" = "allow" ]; then
      echo "  ✓ $desc (settings.allow)"; PASS=$((PASS+1))
    else
      echo "  ✗ $desc (settings.allow matched, expected=$expected)"; FAIL=$((FAIL+1))
    fi
    return
  fi

  # Step 4: permission-handler (Bash만)
  if [ "$tool_name" = "Bash" ]; then
    local ph_result
    ph_result=$(echo "$input" | $PERM_HANDLER 2>/dev/null)
    local ph_decision
    ph_decision=$(parse_decision "$ph_result")
    if [ "$ph_decision" = "allow" ]; then
      if [ "$expected" = "allow" ]; then
        echo "  ✓ $desc"; PASS=$((PASS+1))
      else
        echo "  ✗ $desc (permission-handler allow, expected=$expected)"; FAIL=$((FAIL+1))
      fi
      return
    fi
  fi

  # Step 5: 사용자 확인
  if [ "$expected" = "user-confirm" ]; then
    echo "  ✓ $desc (→ 사용자 확인)"; PASS=$((PASS+1))
  else
    echo "  ✗ $desc (→ 사용자 확인, expected=$expected)"; FAIL=$((FAIL+1))
  fi
}

# CWD 기반 테스트: cwd는 현재 워크트리($CWD)를 사용하여 resolveCCRoot가 동작하게 함
# 경로 기반 테스트: file_path나 -C/cd 인자에 가상 경로 사용 (실제 존재 불필요)
WT="$CC_ROOT/worktrees/feat-x"
PWT="$CC_ROOT/projects/myapp/worktrees/feat-1"
PMAIN="$CC_ROOT/projects/myapp/main"

echo "================================================================"
echo "E2E 시나리오 테스트 — 3단 훅 구조"
echo "CC_ROOT=$CC_ROOT"
echo "CWD=$CWD"
echo "================================================================"

echo ""
echo "=== 1. 읽기 도구 (어디서든 allow) ==="
test_e2e "Read 아무 경로" \
  '{"tool_name":"Read","tool_input":{"file_path":"/etc/passwd"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "Read CC 외부" \
  '{"tool_name":"Read","tool_input":{"file_path":"/Users/alen.heo/other/secret.txt"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "Glob" \
  '{"tool_name":"Glob","tool_input":{"pattern":"**/*.md"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "Grep" \
  '{"tool_name":"Grep","tool_input":{"pattern":"password"},"cwd":"'"$CWD"'"}' "allow"

echo ""
echo "=== 2. 쓰기 도구 — worktree에서만 allow ==="
test_e2e "Edit CC worktree" \
  '{"tool_name":"Edit","tool_input":{"file_path":"'"$WT"'/foo.md","old_string":"a","new_string":"b"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "Write project worktree" \
  '{"tool_name":"Write","tool_input":{"file_path":"'"$PWT"'/src/main.kt","content":"hi"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "Edit CC 루트 → deny" \
  '{"tool_name":"Edit","tool_input":{"file_path":"'"$CC_ROOT"'/CLAUDE.md","old_string":"a","new_string":"b"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "Edit context/ → deny" \
  '{"tool_name":"Edit","tool_input":{"file_path":"'"$CC_ROOT"'/context/foo.md","old_string":"a","new_string":"b"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "Edit projects/main/ → deny" \
  '{"tool_name":"Edit","tool_input":{"file_path":"'"$CC_ROOT"'/projects/myapp/main/src/App.kt","old_string":"a","new_string":"b"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "Edit CC 외부 → 사용자 확인 (pass-through)" \
  '{"tool_name":"Edit","tool_input":{"file_path":"/Users/alen.heo/other/file.js","old_string":"a","new_string":"b"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "Edit /tmp → 사용자 확인 (pass-through)" \
  '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/scratch.md","old_string":"a","new_string":"b"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "Write .lens/ → allow" \
  '{"tool_name":"Write","tool_input":{"file_path":"'"$CC_ROOT"'/.lens/abc/summaries.md","content":"test"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "Write .slack-digest/ → allow" \
  '{"tool_name":"Write","tool_input":{"file_path":"'"$CC_ROOT"'/.slack-digest/abc/raw.md","content":"test"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "Edit wiki/ CC 루트 → deny" \
  '{"tool_name":"Edit","tool_input":{"file_path":"'"$CC_ROOT"'/wiki/asset-factory/README.md","old_string":"a","new_string":"b"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "Edit ontology/ CC 루트 → deny" \
  '{"tool_name":"Edit","tool_input":{"file_path":"'"$CC_ROOT"'/ontology/tbox.yaml","old_string":"a","new_string":"b"},"cwd":"'"$CWD"'"}' "deny"

echo ""
echo "=== 3. 보호 브랜치 deny ==="
test_e2e "git commit (cwd=worktree) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"git commit -m test"},"cwd":"'"$CWD"'"}' "allow"

echo ""
echo "=== 4. Bash safe 읽기 ==="
test_e2e "git status" \
  '{"tool_name":"Bash","tool_input":{"command":"git status"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "ls -la" \
  '{"tool_name":"Bash","tool_input":{"command":"ls -la"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "git log" \
  '{"tool_name":"Bash","tool_input":{"command":"git log --oneline -5"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "cat README.md" \
  '{"tool_name":"Bash","tool_input":{"command":"cat README.md"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "grep pattern" \
  '{"tool_name":"Bash","tool_input":{"command":"grep -r TODO src/"},"cwd":"'"$CWD"'"}' "allow"

echo ""
echo "=== 5a. Bash deny (GitHub 수정 — 우회 불가) ==="
test_e2e "gh pr merge → deny" \
  '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 123"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "gh pr close → deny" \
  '{"tool_name":"Bash","tool_input":{"command":"gh pr close 123"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "gh pr comment → allow (비파괴적)" \
  '{"tool_name":"Bash","tool_input":{"command":"gh pr comment 123 --body test"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "gh pr edit → allow (비파괴적)" \
  '{"tool_name":"Bash","tool_input":{"command":"gh pr edit 123 --title new"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "gh pr review → deny" \
  '{"tool_name":"Bash","tool_input":{"command":"gh pr review 123 --approve"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "gh issue close → deny" \
  '{"tool_name":"Bash","tool_input":{"command":"gh issue close 123"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "gh issue comment → allow (비파괴적)" \
  '{"tool_name":"Bash","tool_input":{"command":"gh issue comment 123 --body test"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "gh api POST → deny" \
  '{"tool_name":"Bash","tool_input":{"command":"gh api repos/x/issues --method POST"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "gh api -X DELETE → deny" \
  '{"tool_name":"Bash","tool_input":{"command":"gh api repos/x/pulls/1 -X DELETE"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "gh api GET → safe 읽기" \
  '{"tool_name":"Bash","tool_input":{"command":"gh api repos/x/pulls/46/comments"},"cwd":"'"$CWD"'"}' "allow"

echo ""
echo "=== 5b. Bash 사용자 확인 (위험하지만 때로 필요) ==="
test_e2e "gh pr create → allow (safe)" \
  '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title test"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "gh issue create → allow (safe)" \
  '{"tool_name":"Bash","tool_input":{"command":"gh issue create --title bug"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "git reset --hard → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"git reset --hard HEAD~5"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "git clean -fd → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"git clean -fd"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "git branch -D → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"git branch -D feature-branch"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "git branch -d (소문자) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"git branch -d feature-branch"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "git push --force → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "git push -f → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"git push -f origin feat"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 5c. git push (worktree에서 allow) ==="
test_e2e "git push (cwd=worktree) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"git push origin feat-x"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "git -C worktree push → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"git -C '"$WT"' push origin feat-x"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd worktree && git push) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$WT"' && git push origin feat)"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "git push (CC 루트) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"git -C '"$CC_ROOT"' push origin main"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 6. Bash 빌드/테스트 (worktree에서만 allow) ==="
test_e2e "bun run build (worktree cwd)" \
  '{"tool_name":"Bash","tool_input":{"command":"bun run build"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "npm test (worktree cwd)" \
  '{"tool_name":"Bash","tool_input":{"command":"npm test"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "./gradlew build (worktree cwd)" \
  '{"tool_name":"Bash","tool_input":{"command":"./gradlew build"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "./gradlew ktlintFormat (main/ → 사용자 확인)" \
  '{"tool_name":"Bash","tool_input":{"command":"./gradlew ktlintFormat"},"cwd":"'"$CC_ROOT"'/projects/myapp/main"}' "user-confirm"
test_e2e "npm run lint --fix (main/ → 사용자 확인)" \
  '{"tool_name":"Bash","tool_input":{"command":"npm run lint -- --fix"},"cwd":"'"$CC_ROOT"'/projects/myapp/main"}' "user-confirm"
test_e2e "bun test (project worktree cwd)" \
  '{"tool_name":"Bash","tool_input":{"command":"bun test"},"cwd":"'"$CWD"'"}' "allow"

echo ""
echo "=== 7. Bash 서브셸 worktree ==="
test_e2e "(cd worktree && git add && git commit)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$WT"' && git add -A && git commit -m test)"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd worktree && git push) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$WT"' && git push origin feat)"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd worktree && git status)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$WT"' && git status)"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd CC루트 && git commit) → deny (main 브랜치)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$CC_ROOT"' && git commit -m test)"},"cwd":"'"$CWD"'"}' "deny"

echo ""
echo "=== 8. 복합 명령 (메타문자) → 사용자 확인 ==="
test_e2e "echo ok && git push (worktree cwd) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"echo ok && git push origin main"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "git status ; git push (worktree cwd) → allow (체인 분할)" \
  '{"tool_name":"Bash","tool_input":{"command":"git status ; git push origin feat"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "ls 2>/dev/null; echo → allow (읽기 전용 체인)" \
  '{"tool_name":"Bash","tool_input":{"command":"ls build.gradle.kts package.json 2>/dev/null; echo \"---DONE---\""},"cwd":"'"$CWD"'"}' "allow"
test_e2e "ls ; rm (비 worktree) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"ls ; rm '"$CC_ROOT"'/file"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "인용문 내 ; 는 분할하지 않음 → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"echo \"hello; world\""},"cwd":"'"$CWD"'"}' "allow"
test_e2e "ls | grep → allow (읽기 파이프)" \
  '{"tool_name":"Bash","tool_input":{"command":"ls -la | grep foo"},"cwd":"'"$CWD"'"}' "allow"

echo ""
echo "=== 9. 환경변수 prefix ==="
test_e2e "GH_HOST=xxx gh pr view → safe 읽기" \
  '{"tool_name":"Bash","tool_input":{"command":"GH_HOST=github.com gh pr view --json state"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "GH_HOST=xxx gh pr create → allow (safe)" \
  '{"tool_name":"Bash","tool_input":{"command":"GH_HOST=github.com gh pr create --title test"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "소문자 env prefix gh pr merge → deny" \
  '{"tool_name":"Bash","tool_input":{"command":"a=b gh pr merge 123"},"cwd":"'"$CWD"'"}' "deny"

echo ""
echo "=== 10. 우회 시도 ==="
test_e2e "bash -c 'git push' → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"bash -c \"git push origin main\""},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "sed -i → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"sed -i s/foo/bar/g important.txt"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "find | xargs rm → 메타문자(|) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"find . -name *.tmp | xargs rm"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "node -e 일반 → settings.allow" \
  '{"tool_name":"Bash","tool_input":{"command":"node -e \"console.log(1)\""},"cwd":"'"$CWD"'"}' "allow" "yes"
test_e2e "서브셸 gh pr merge 우회 → deny" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd /tmp && gh pr merge 123)"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "node -e gh pr merge 우회 → deny (DENY_ANYWHERE)" \
  '{"tool_name":"Bash","tool_input":{"command":"node -e \"require(child_process).execSync(gh pr merge 1)\""},"cwd":"'"$CWD"'"}' "deny"
test_e2e "curl 제거됨 → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"curl https://example.com"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "kill 제거됨 → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"kill -9 1234"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "/usr/bin/python3 제거됨 → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"/usr/bin/python3 -c \"print(1)\""},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 11. 외부 도구 (settings.allow) ==="
test_e2e "docker ps → settings.allow" \
  '{"tool_name":"Bash","tool_input":{"command":"docker ps"},"cwd":"'"$CWD"'"}' "allow" "yes"
test_e2e "node script.js → settings.allow" \
  '{"tool_name":"Bash","tool_input":{"command":"node script.js"},"cwd":"'"$CWD"'"}' "allow" "yes"
test_e2e "brew install → settings.allow" \
  '{"tool_name":"Bash","tool_input":{"command":"brew install jq"},"cwd":"'"$CWD"'"}' "allow" "yes"

echo ""
echo "=== 12. 기타 도구 ==="
test_e2e "Agent → pass-through → 사용자 확인" \
  '{"tool_name":"Agent","tool_input":{"prompt":"do something"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "WebSearch → settings.allow" \
  '{"tool_name":"WebSearch","tool_input":{"query":"test"},"cwd":"'"$CWD"'"}' "allow" "yes"
test_e2e "Skill → settings.allow" \
  '{"tool_name":"Skill","tool_input":{"skill":"commit"},"cwd":"'"$CWD"'"}' "allow" "yes"

echo ""
echo "=== 13. 리다이렉트/파이프 쓰기 ==="
test_e2e "echo > worktree/file → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"echo hello > '"$WT"'/out.txt"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "echo > 보호경로 → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"echo hello > '"$CC_ROOT"'/context/out.txt"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 14. Git/파일 쓰기 경로별 ==="
test_e2e "git -C worktree add → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"git -C '"$WT"' add -A"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "mkdir worktree/dir → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"mkdir -p '"$WT"'/newdir"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "rm worktree/file → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"rm '"$WT"'/temp.txt"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "mkdir CC루트 → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"mkdir -p '"$CC_ROOT"'/newdir"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 15. 경로별 매트릭스 — 프로젝트 main (읽기 전용) ==="
test_e2e "git -C projects/main commit → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"git -C '"$PMAIN"' commit -m test"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "mkdir projects/main/dir → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"mkdir -p '"$PMAIN"'/newdir"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "(cd projects/main && git add) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PMAIN"' && git add -A)"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "echo > projects/main/file → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"echo hi > '"$PMAIN"'/out.txt"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 16. 경로별 매트릭스 — 프로젝트 worktree ==="
test_e2e "git -C projects/worktree commit → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"git -C '"$PWT"' commit -m test"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "mkdir projects/worktree/dir → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"mkdir -p '"$PWT"'/newdir"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd projects/worktree && git add && git commit) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && git add -A && git commit -m test)"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd projects/worktree && git push) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && git push origin feat)"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "echo > projects/worktree/file → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"echo hi > '"$PWT"'/out.txt"},"cwd":"'"$CWD"'"}' "allow"

test_e2e "(cd projects/main && git push) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PMAIN"' && git push origin feat)"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 17. 경로별 매트릭스 — CC 바깥 ==="
EXT="/Users/alen.heo/other-project"
test_e2e "git -C 외부경로 commit → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"git -C '"$EXT"' commit -m test"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "mkdir 외부경로 → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"mkdir -p '"$EXT"'/newdir"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "(cd 외부경로 && git commit) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$EXT"' && git commit -m test)"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 18. 스킬 세션 경로 (.lens/, .slack-digest/) ==="
test_e2e "mkdir .lens/ → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"mkdir -p '"$CC_ROOT"'/.lens/abc-123"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "rm -rf .lens/ → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"rm -rf '"$CC_ROOT"'/.lens/abc-123"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "mkdir .slack-digest/ → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"mkdir -p '"$CC_ROOT"'/.slack-digest/abc-123"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "rm -rf .slack-digest/ → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"rm -rf '"$CC_ROOT"'/.slack-digest/abc-123"},"cwd":"'"$CWD"'"}' "allow"

echo ""
echo "=== 19. gh api 메서드별 ==="
test_e2e "gh api --method GET → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"gh api repos/x/pulls --method GET"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "gh api -X PATCH → deny" \
  '{"tool_name":"Bash","tool_input":{"command":"gh api repos/x/pulls/1 -X PATCH --field body=test"},"cwd":"'"$CWD"'"}' "deny"

echo ""
echo "=== 20. 서브셸 inner 명령 검증 ==="
test_e2e "(cd worktree && unknown_cmd) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$WT"' && some_unknown_command arg1)"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "(cd worktree && ls && git status) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$WT"' && ls -la && git status)"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd main && ./gradlew test) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$CC_ROOT"'/projects/myapp/main && ./gradlew test)"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "(cd worktree && npm test && rm -rf dist) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$WT"' && npm test && rm -rf dist)"},"cwd":"'"$CWD"'"}' "allow"

echo ""
echo "=== 21. DENY_ANYWHERE 완전성 ==="
test_e2e "node -e gh api POST → deny" \
  '{"tool_name":"Bash","tool_input":{"command":"node -e \"require(child_process).execSync(gh api repos/x/issues --method POST)\""},"cwd":"'"$CWD"'"}' "deny"
test_e2e "python3 -c gh pr comment → allow (비파괴적)" \
  '{"tool_name":"Bash","tool_input":{"command":"python3 -c \"import os; os.system(gh pr comment 1 --body test)\""},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "python3 -c gh pr edit → allow (비파괴적)" \
  '{"tool_name":"Bash","tool_input":{"command":"python3 -c \"import os; os.system(gh pr edit 1 --title x)\""},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "node -e gh pr review → deny" \
  '{"tool_name":"Bash","tool_input":{"command":"node -e \"execSync(gh pr review 1 --approve)\""},"cwd":"'"$CWD"'"}' "deny"
test_e2e "node -e gh issue comment → allow (비파괴적)" \
  '{"tool_name":"Bash","tool_input":{"command":"node -e \"execSync(gh issue comment 1 --body x)\""},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 22. for/while 루프 ==="
test_e2e "for 루프 cp 변수경로 worktree → allow (변수 placeholder 치환)" \
  '{"tool_name":"Bash","tool_input":{"command":"for f in .env .nvmrc; do cp '"$WT"'/main/$f '"$WT"'/$f; done"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "for 루프 if/fi cp worktree → allow (if/fi 언래핑)" \
  '{"tool_name":"Bash","tool_input":{"command":"for f in .env .nvmrc; do if [ -f '"$PWT"'/main/$f ]; then cp '"$PWT"'/main/$f '"$PWT"'/$f; echo copied: $f; fi; done"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "for 루프 gh pr merge → deny (DENY_ANYWHERE)" \
  '{"tool_name":"Bash","tool_input":{"command":"for i in 1 2 3; do gh pr merge $i; done"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "for 루프 rm CC root → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"for f in a b c; do rm '"$CC_ROOT"'/$f; done"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "for 루프 cp /tmp (worktree 밖) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"for f in .env .nvmrc; do cp '"$WT"'/main/$f /tmp/$f; done"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "for 루프 cp ../ 탈출 시도 → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"for f in .env .nvmrc; do cp '"$WT"'/main/$f '"$WT"'/../../$f; done"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "for 루프 if/fi 내 rm -rf → 사용자 확인 (위험 명령)" \
  '{"tool_name":"Bash","tool_input":{"command":"for f in a b; do if [ -f $f ]; then rm -rf /; fi; done"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "for 루프 if/fi cp CC root (보호경로) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"for f in .env; do if [ -f '"$PMAIN"'/$f ]; then cp '"$PMAIN"'/$f '"$PMAIN"'/../$f; echo done; fi; done"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "for 루프 변수 할당 + cp worktree → allow (변수 할당은 부수효과 없음)" \
  '{"tool_name":"Bash","tool_input":{"command":"for f in .env .env.local .nvmrc; do src=\"'"$PWT"'/main/$f\"; if [ -f \"$src\" ]; then cp \"$src\" \"'"$PWT"'/$f\"; echo 복사: $f; fi; done"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "for 루프 command substitution 변수 할당 → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"for f in a b; do x=$(cat /etc/passwd); cp '"$WT"'/main/$f '"$WT"'/$f; done"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "for 루프 VAR=value command (env prefix) → 사용자 확인 (명령 실행)" \
  '{"tool_name":"Bash","tool_input":{"command":"for f in a; do EVIL=x rm -rf /; done"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 23. settings.allow 제거 항목 ==="
test_e2e "docker → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"docker ps"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "open → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"open https://evil.com"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 24. && 체인 명령 (괄호 없음) ==="
test_e2e "mkdir && git -C worktree add && git -C worktree diff > file → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"mkdir -p '"$WT"'/.dev && git -C '"$WT"' add -A && git -C '"$WT"' diff --cached > '"$WT"'/.dev/diff.txt && wc -l '"$WT"'/.dev/diff.txt"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "git -C worktree add && git -C worktree commit → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"git -C '"$WT"' add -A && git -C '"$WT"' commit -m test"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "mkdir CC root && rm → 사용자 확인 (CC root 대상)" \
  '{"tool_name":"Bash","tool_input":{"command":"mkdir -p '"$CC_ROOT"'/newdir && rm '"$CC_ROOT"'/newdir/file"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "git add && gh pr merge → deny (DENY_ANYWHERE)" \
  '{"tool_name":"Bash","tool_input":{"command":"git -C '"$WT"' add -A && gh pr merge 123"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "ls && cat → allow (읽기만)" \
  '{"tool_name":"Bash","tool_input":{"command":"ls -la && cat README.md"},"cwd":"'"$CWD"'"}' "allow"

echo ""
echo "=== 25. ||/&& 복합 체인 ==="
test_e2e "grep || echo >> worktree/.gitignore → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"grep -q .dev/ '"$PWT"'/.gitignore 2>/dev/null && echo already || echo .dev/ >> '"$PWT"'/.gitignore && echo added"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "grep || echo >> worktree (인용문 내 백슬래시) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"grep -q '"'"'\\.dev/'"'"' '"$PWT"'/.gitignore 2>/dev/null && echo exists || echo '"'"'.dev/'"'"' >> '"$PWT"'/.gitignore && echo added"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "grep || echo >> CC root (보호경로) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"grep -q .dev/ '"$CC_ROOT"'/.gitignore 2>/dev/null && echo already || echo .dev/ >> '"$CC_ROOT"'/.gitignore && echo added"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "ls || rm -rf / → 사용자 확인 (위험 명령)" \
  '{"tool_name":"Bash","tool_input":{"command":"ls || rm -rf /"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "ls || gh pr merge → deny (DENY_ANYWHERE)" \
  '{"tool_name":"Bash","tool_input":{"command":"ls || gh pr merge 123"},"cwd":"'"$CWD"'"}' "deny"
test_e2e "단독 파이프 | 여전히 차단" \
  '{"tool_name":"Bash","tool_input":{"command":"ls | xargs rm"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 26. SAFE_COMMANDS 인용문 내 개행 ==="
test_e2e "gh pr create 개행 본문 → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"GH_HOST=github.com gh pr create --base main --title \"test\" --body \"## Background\nline1\nline2\" 2>&1"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "gh pr create 개행 + # 헤더 → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title \"test\" --body \"## Summary\nchanged something\n## Checklist\n- [x] done\""},"cwd":"'"$CWD"'"}' "allow"
test_e2e "gh issue create 개행 본문 → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"gh issue create --title \"bug\" --body \"## Steps\n1. open\n2. click\""},"cwd":"'"$CWD"'"}' "allow"
test_e2e "gh pr create 후 ; rm 주입 → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title \"test\" --body \"ok\" ; rm -rf /"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "gh pr create 개행 후 별도 명령 → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title \"test\"\nrm -rf /"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "echo 개행 포함 → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"echo \"multi\nline\ntext\""},"cwd":"'"$CWD"'"}' "allow"
test_e2e "git log 개행 format → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"git log --format=\"%H\n%s\" -5"},"cwd":"'"$CWD"'"}' "allow"

echo ""
echo "=== 27. 커맨드 인젝션 방어 ==="
test_e2e "echo \"\$(rm -rf /)\" && echo ok → 사용자 확인 (\$ 차단)" \
  '{"tool_name":"Bash","tool_input":{"command":"echo \"$(rm -rf /)\" && echo ok"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "grep \"\$(evil)\" || echo ok → 사용자 확인 (\$ 차단)" \
  '{"tool_name":"Bash","tool_input":{"command":"grep \"$(evil)\" file || echo ok"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "gh pr create --body \"\$(cmd)\" → 사용자 확인 (\$ 차단)" \
  '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title \"test\" --body \"$(rm -rf /)\""},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "echo \"\`evil\`\" && echo ok → 사용자 확인 (backtick 차단)" \
  '{"tool_name":"Bash","tool_input":{"command":"echo \"`whoami`\" && echo ok"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "for 루프 cp \$HOME (변수 디렉토리) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"for f in .env; do cp '"$WT"'/main/$f $HOME/$f; done"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "for 루프 cp \$DEST/\$f (변수 디렉토리) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"for f in .env; do cp '"$WT"'/main/$f $DEST/$f; done"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 28. 파이프라인 분할 점검 ==="
test_e2e "서브셸 | tail → allow (worktree 내부 빌드)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && ./gradlew build -x test 2>&1) | tail -5"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "서브셸 | head → allow (worktree 내부 빌드)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && bun run build 2>&1) | head -20"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "서브셸 | grep → allow (worktree 내부 테스트)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && npm test 2>&1) | grep -i error"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "서브셸 | tail (main/ 빌드) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$CC_ROOT"'/projects/myapp/main && ./gradlew build 2>&1) | tail -5"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "단순 명령 | tail → allow (SAFE_COMMAND)" \
  '{"tool_name":"Bash","tool_input":{"command":"git log --oneline -20 | tail -5"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "단순 명령 | head | grep → allow (다단 파이프)" \
  '{"tool_name":"Bash","tool_input":{"command":"git diff | head -100 | grep TODO"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "파이프 뒤 위험 명령 → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"ls | xargs rm"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "파이프 뒤 tee (파일 쓰기) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"echo hello | tee /tmp/out.txt"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "체인 + 파이프: which && gh auth status | head → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"which gh && gh auth status 2>&1 | head -5"},"cwd":"'"$CWD"'"}' "allow"

echo ""
echo "=== 29. 입력 리다이렉트 + 인용문 파이프 ==="
test_e2e "wc -l < file (입력 리다이렉트) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"git -C '"$CC_ROOT"'/worktrees/test add -A && mkdir -p '"$CC_ROOT"'/worktrees/test/.dev && git -C '"$CC_ROOT"'/worktrees/test diff --cached > '"$CC_ROOT"'/worktrees/test/.dev/diff.txt && wc -l < '"$CC_ROOT"'/worktrees/test/.dev/diff.txt"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "grep backslash-pipe in quotes | head → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"cd '"$CC_ROOT"'/projects/test/main && git show abc | grep \"upd_dt\\|ledger\" | head -60"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "git log format pipe in quotes | head → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"git log --format=\"%H|%s\" | head -10"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "unbalanced quote → 사용자 확인 (null 반환)" \
  '{"tool_name":"Bash","tool_input":{"command":"echo \"abc | evil_cmd | head -5"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 30. resolveCCRoot — 프로젝트 워크트리 CWD ==="
test_e2e "bun install (project worktree CWD)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$CC_ROOT"'/projects/test/worktrees/feat && bun install)"},"cwd":"'"$CC_ROOT"'/projects/test/worktrees/feat"}' "allow"
test_e2e "Write project worktree file (CWD=project worktree)" \
  '{"tool_name":"Write","tool_input":{"file_path":"'"$CC_ROOT"'/projects/test/worktrees/feat/.dev/codemap.md","content":"test"},"cwd":"'"$CC_ROOT"'/projects/test/worktrees/feat"}' "allow"

echo ""
echo "=== 31. 인용문 내 \$ (정규식 앵커) ==="
test_e2e "grep 정규식 \$ && echo → allow (체인)" \
  '{"tool_name":"Bash","tool_input":{"command":"grep -q \"^\\.dev/$\" '"$PWT"'/.gitignore 2>/dev/null && echo exists || echo missing"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "grep 정규식 \$ 단독 → allow (SAFE_COMMANDS)" \
  '{"tool_name":"Bash","tool_input":{"command":"grep -q \"^pattern$\" '"$PWT"'/file.txt"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "\$(cmd) 체인 → 사용자 확인 (실제 확장)" \
  '{"tool_name":"Bash","tool_input":{"command":"echo \"$(whoami)\" && echo ok"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "\${VAR} 체인 → 사용자 확인 (실제 확장)" \
  '{"tool_name":"Bash","tool_input":{"command":"echo \"${HOME}\" && echo ok"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "단일 인용문 내 \$ → allow (확장 없음)" \
  '{"tool_name":"Bash","tool_input":{"command":"grep '"'"'^price$'"'"' file && echo found || echo missing"},"cwd":"'"$CWD"'"}' "allow"

echo ""
echo "=== 32. 서브셸 접미사 (2>&1, || true) ==="
test_e2e "(cd wt && bun run test) 2>&1 → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && bun run test) 2>&1"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd wt && bun run lint --fix) 2>&1 | tail -10 → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && bun run lint --fix) 2>&1 | tail -10"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd wt && bun run test) 2>&1 | tail -5 → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && bun run test) 2>&1 | tail -5"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd wt && gh pr view 2>&1) || true → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && GH_HOST=github.com gh pr view --json url 2>&1) || true"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd main && bun run test) 2>&1 → 사용자 확인 (main/)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PMAIN"' && bun run test) 2>&1"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 33. 서브셸 내 개행 본문 ==="
test_e2e "(cd wt && gh pr create --body 개행) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && GH_HOST=github.com gh pr create --base develop --title \"test\" --body \"## Background\nline1\n## Summary\nline2\")"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd wt && gh pr create --body 내 >) → allow (오탐 방지)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && gh pr create --title \"test\" --body \"> blockquote\nline2\")"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd wt && gh pr create --body \$(cmd)) → 사용자 확인" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && gh pr create --title \"test\" --body \"$(evil)\")"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "=== 34. 인용문 리다이렉트 대상 (hasWriteOutput 회귀 방지) ==="
test_e2e "(cd wt && cat file > \"quoted.txt\") → allow (worktree 내부)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && cat data.csv > \"output.txt\")"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd wt && echo > \"../../leaked\") → 사용자 확인 (worktree 밖)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && echo secret > \"../../leaked.txt\")"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "echo > \"file\" (단일 명령, worktree cwd) → allow" \
  '{"tool_name":"Bash","tool_input":{"command":"echo hello > \"output.txt\""},"cwd":"'"$PWT"'"}' "allow"

echo ""
echo "=== 35. 접미사 결합 + 셸 확장 ==="
test_e2e "(cd wt && bun run test) 2>&1 || true → allow (두 접미사 결합)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && bun run test) 2>&1 || true"},"cwd":"'"$CWD"'"}' "allow"
test_e2e "(cd wt && echo \$HOME) 2>&1 → 사용자 확인 (셸 확장)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && echo $HOME) 2>&1"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "(cd wt && echo \`date\`) → 사용자 확인 (backtick)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && echo `date`)"},"cwd":"'"$CWD"'"}' "user-confirm"
test_e2e "(cd wt && cmd) || rm -rf / → 사용자 확인 (위험 fallback)" \
  '{"tool_name":"Bash","tool_input":{"command":"(cd '"$PWT"' && ls) || rm -rf /"},"cwd":"'"$CWD"'"}' "user-confirm"

echo ""
echo "================================================================"
echo "결과: 통과 $PASS / 실패 $FAIL / 전체 $TOTAL"
echo "================================================================"
