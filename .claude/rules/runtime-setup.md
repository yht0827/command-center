# 런타임 셋업

CC의 훅(`PreToolUse`, `PermissionRequest`, `SessionStart`)과 statusline은 모두 `node` 명령으로 실행됩니다. 이 명령이 **비대화 셸의 PATH에서 잡혀야 하고**, 버전은 `.claude/config.json`의 `minRuntime.node` 이상이어야 합니다.

## 최소 버전

`.claude/config.json` → `minRuntime.node` 값(현재 **20**) 이상의 Node가 필요합니다. 미달이면:

- PreToolUse 가드(`pre-tool-use.mjs`, `branch-guard.mjs`): **fail-close** — 도구 호출 차단 (exit 2)
- PermissionRequest(`permission-handler.mjs`): pass-through — 사용자 확인으로 폴백
- SessionStart(`session-start.mjs`): fail-open — 메시지만 출력, 세션은 계속

## 셋업 (macOS, Homebrew 기준)

```bash
brew install node@22
brew link node@22 --force --overwrite
```

확인:

```bash
which node      # /opt/homebrew/bin/node 가 잡혀야 함
node --version  # v22.x.x
```

## 왜 nvm은 추천하지 않는가

nvm은 셸 함수 기반이라 `.zshrc`/`.bash_profile`에서 `source` 해야 활성화됩니다. CC가 매 도구 호출 시 띄우는 셸은 **비대화 셸**(non-interactive)이라 `.zshrc`를 읽지 않습니다 → nvm 활성화 안 됨 → `node`를 PATH에서 못 찾음 → 모든 훅이 `command not found`로 실패 → **가드 무력화**.

```
[사용자 터미널]              [CC가 spawn한 셸]
.zshrc 로드 ✓                .zshrc 로드 ✗
nvm 활성화 ✓                 nvm 활성화 ✗
node 잡힘 ✓                  node 없음 ✗
```

nvm을 꼭 쓰고 싶다면 `~/.nvm/versions/node/<버전>/bin/node`를 `/usr/local/bin/node`로 symlink하거나 `~/.zshenv`에 nvm 활성화를 추가해야 합니다(`.zshenv`는 비대화 셸도 로드). Homebrew가 더 단순합니다.

## 환경 변경 후

`brew install` / `brew link` 후에는 **새 터미널 세션**에서 `which node`를 다시 확인하세요. 기존 CC 세션은 spawn된 셸 캐시가 남아있을 수 있으니 세션을 재시작하는 것이 안전합니다.

## 트러블슈팅

| 증상 | 원인 | 조치 |
|------|------|------|
| 도구 호출마다 `Failed with non-blocking status code: node: command not found` | 비대화 셸 PATH에 node 없음 | 위 셋업 절차 수행 |
| `[CC hook] Node 20+ 필요 (현재: ...)` 메시지 후 도구 차단 | 설치된 node가 minRuntime 미달 | `brew upgrade node@22` 또는 더 최신 LTS 설치 |
| `which node`가 `/usr/local/bin/node`나 다른 경로를 가리킴 | 이전 설치본이 우선 PATH | `brew link node@22 --force --overwrite` 재실행, 또는 이전 설치본 제거 |
