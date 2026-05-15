---
name: setup
argument-hint: "없음"
description: |
  Command Center 워크스페이스 초기 세팅.
  필수 도구 설치, GHE 인증, 프로젝트 clone을 단계별로 수행합니다.
disable-model-invocation: true
allowed-tools:
  - "Bash(/bin/bash *)"
  - "Bash(curl *)"
  - "Bash(brew *)"
  - "Bash(gh *)"
  - "Bash(git *)"
  - "Bash(which *)"
  - "Bash(npm *)"
  - "Bash(agent-browser *)"
  - "Bash(cp *)"
  - "Bash(cat *)"
  - Read
  - Write
  - Glob
  - AskUserQuestion
---

# setup

Command Center 워크스페이스 초기 세팅을 단계별로 수행한다. (macOS 기준)

## 설정 파일

워크스페이스 루트의 `.claude/workspace.json`에서 설정을 읽는다.

워크스페이스 루트 감지: 현재 디렉토리 또는 상위에서 `.claude/workspace.json`이 있는 디렉토리를 찾는다.

```json
{
  "team": "...",
  "ghe_host": "github.com",
  "projects": {
    "required": [
      { "repo": "hubtwork/example", "desc": "예시 API 서버" }
    ],
    "optional": [
      { "repo": "hubtwork/example-fe", "desc": "예시 FE 앱" },
      { "repo": "other-org/lib", "desc": "공용 라이브러리", "host": "github.com" }
    ]
  }
}
```

각 프로젝트의 `repo` 필드에서 `{org}/{repo}` 를 읽고, `desc`는 사용자에게 표시할 때 사용한다.
프로젝트에 `host` 필드가 있으면 해당 호스트를 사용하고, 없으면 `ghe_host` 기본값을 사용한다.

## 실행 절차

아래 단계를 **순서대로** 실행한다. 각 단계 완료 시 `{항목} : [완료]` 형식으로 출력한다.

### 1단계: 필수 도구 확인 및 설치

아래 도구를 하나씩 확인하고, 없으면 설치한다:

| 도구 | 확인 | 없으면 |
|------|------|--------|
| brew | `which brew` | `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` |
| git | `which git` | `brew install git` 실행 |
| gh | `which gh` | `brew install gh` 실행 |
| jq | `which jq` | `brew install jq` 실행 |
| node | `which node` (버전이 `.claude/config.json`의 `minRuntime.node` 이상인지도 확인) | `brew install node@22 && brew link node@22 --force --overwrite` 실행 ([`.claude/rules/runtime-setup.md`](../../rules/runtime-setup.md) 참조) |
| agent-browser | `which agent-browser` | `brew install agent-browser && agent-browser install` 실행 |

순서가 중요하다: brew → git → gh → jq → node → agent-browser. brew가 있어야 나머지를 설치할 수 있다.

각 도구마다:
1. `which {도구}` 로 존재 여부 확인
2. 있으면 → `{도구} 설치 : [완료]` 출력
3. 없으면 → 설치 명령 실행 → `{도구} 설치 : [완료]` 출력

**타임아웃**: 설치 Bash 명령에 `timeout: 300000` (5분)을 설정한다. brew install은 네트워크 상태에 따라 시간이 걸릴 수 있다.

**참고**: brew 최초 설치 시 macOS 비밀번호(sudo)를 요구할 수 있다. 터미널에 비밀번호 입력 프롬프트가 표시되면 사용자에게 "brew 설치에 macOS 비밀번호 입력이 필요합니다. 터미널에서 직접 입력해주세요."라고 안내한다.

### 1.5단계: agent-browser 스킬 버전 동기화

agent-browser CLI가 설치된 후, CLI 버전과 워크스페이스에 커밋된 스킬 파일의 버전을 비교한다.

1. CLI 버전 확인: `agent-browser --version` 출력에서 버전 추출 (예: `0.16.3`)
2. 스킬 버전 확인: `.claude/skills/agent-browser/.version` 파일 읽기. **파일이 없으면 `0.0.0`으로 간주**한다.
3. **버전이 동일하면** → `agent-browser 스킬 동기화 : [최신]` 출력
4. **버전이 다르면** (CLI가 더 높으면):
   - npm 패키지의 스킬 경로를 확인한다:
     ```bash
     NPM_SKILLS="$(npm root -g)/agent-browser/skills/agent-browser"
     ```
   - **`$NPM_SKILLS` 디렉토리가 존재하지 않으면** → `agent-browser 패키지에 스킬 파일이 없습니다. 수동으로 확인해주세요.` 안내 후 이 단계를 건너뛴다.
   - 디렉토리가 존재하면 스킬 파일을 워크스페이스로 복사한다:
     ```bash
     WS_SKILLS=".claude/skills/agent-browser"
     cp "$NPM_SKILLS/SKILL.md" "$WS_SKILLS/SKILL.md"
     [ -d "$NPM_SKILLS/references" ] && cp -R "$NPM_SKILLS/references/" "$WS_SKILLS/references/"
     [ -d "$NPM_SKILLS/templates" ] && cp -R "$NPM_SKILLS/templates/" "$WS_SKILLS/templates/"
     ```
   - `.version` 파일을 새 버전으로 업데이트 (Write 도구 사용)
   - 사용자에게 안내: `agent-browser 스킬이 v{이전} → v{최신}으로 업데이트되었습니다. 작업 완료 후 이 변경사항도 함께 커밋해주세요.`

### 2단계: GitHub 호스트 인증

프로젝트에서 사용되는 고유 호스트에 대해 인증을 확인한다.

1. `.claude/workspace.json`에서 호스트를 **필수/선택**으로 분류한다:
   - **필수 호스트**: `ghe_host` 기본값 + `projects.required` 항목의 `host` 필드
   - **선택 호스트**: `projects.optional` 항목의 `host` 필드 중 필수 호스트에 포함되지 않는 것
   - 중복 제거
2. **필수 호스트**는 각각 순서대로:
   - `gh auth status --hostname {host}` 로 인증 상태 확인
   - 인증됨 → `{host} 인증 : [완료]` 출력
   - 미인증 → `gh auth login --hostname {host}` 실행 (`timeout: 120000`). 브라우저 인증을 요구한다. 사용자에게 "브라우저에서 {host} 인증을 완료해주세요."라고 안내한다. 타임아웃 초과 시 "인증이 완료되지 않았습니다. 수동으로 `gh auth login --hostname {host}`를 실행해주세요."라고 안내 후 다음 호스트로 진행한다.
3. **선택 호스트**는 각각:
   - AskUserQuestion으로 `{host} 인증이 필요하신가요? (해당 호스트의 프로젝트를 사용하지 않으면 건너뛸 수 있습니다)` 질문 (선택지: "인증하기" / "건너뛰기")
   - "건너뛰기" → `{host} 인증 : [건너뜀]` 출력하고, **스킵된 호스트 목록을 기억**해둔다
   - "인증하기" → 필수 호스트와 동일한 인증 절차 수행

### 3단계: 필수 프로젝트 clone

1. `.claude/workspace.json`에서 `projects.required` 배열을 읽는다.
2. 각 `{org}/{repo}` 에 대해:
   - 해당 프로젝트의 호스트를 결정한다: `project.host ?? ghe_host`
   - `projects/{repo}` 디렉토리가 이미 있으면 → `{repo} clone : [완료]`
   - 없으면 → `gh repo clone https://{host}/{org}/{repo} projects/{repo}` 실행 (`timeout: 120000`)
   - clone 완료 → `{repo} clone : [완료]`
3. `projects.optional`에 레포가 있으면 목록을 보여주고 clone 여부를 물어본다.
   - 2단계에서 스킵된 호스트를 사용하는 프로젝트는 목록에서 제외한다.
   - 사용자가 선택한 레포만 clone한다. 호스트 결정 로직은 동일: `project.host ?? ghe_host`

### 완료

모든 단계가 끝나면:

```
=== 세팅 완료 ===
```

## 주의사항

- 각 단계를 **하나씩** 실행하고, 실패하면 원인을 파악하여 사용자에게 안내한다.
- 설치 도중 에러가 나면 멈추고 사용자에게 상황을 설명한다.
- 이미 완료된 항목은 재실행하지 않고 `[완료]` 만 출력한다.
