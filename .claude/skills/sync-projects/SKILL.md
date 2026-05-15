---
name: sync-projects
disable-model-invocation: true
description: |
  GHE에서 레포를 검색하고 projects/에 clone 또는 sync하는 스킬.
  이미 clone된 레포는 최신화하고, 없으면 검색 후 clone합니다.
argument-hint: "[검색어 또는 레포명]"
allowed-tools:
  - "Bash(gh *)"
  # git - clone 후 sync에 필요한 명령만
  - "Bash(git -C *)"
  - "Bash(git fetch *)"
  - "Bash(git pull *)"
  - "Bash(git remote *)"
  # 파일시스템 - 격리 구조 변환
  - "Bash(mkdir *)"
  - "Bash(find *)"
  - "Bash(mv *)"
  - "Bash(cp *)"
  - "Bash(test *)"
  - Glob
  - Read
  - Edit
  - AskUserQuestion
---

# sync-projects

GHE에서 레포를 검색하여 `projects/`에 clone하거나, 이미 있는 레포를 sync합니다.

## 사용 패턴

| 입력 | 동작 |
|------|------|
| `/sync-projects` | 현재 `projects/` 전체 상태 표시 + 일괄 sync |
| `/sync-projects {검색어}` | GHE에서 검색 → 결과 표시 → 선택 → clone/sync |
| `/sync-projects {org/repo}` | 정확한 레포를 바로 clone/sync |

## 실행 절차

### 1. 워크스페이스 감지

- 현재 디렉토리 또는 상위에서 `.claude/workspace.json`이 있는 디렉토리를 찾는다.
- 해당 디렉토리의 `projects/`를 작업 대상으로 사용한다.
- `.claude/workspace.json`에서 워크스페이스 설정을 읽는다:
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
- 각 프로젝트의 `repo` 필드에서 `{org}/{repo}` 를 읽고, `desc`는 사용자에게 표시할 때 사용한다.
- 프로젝트에 `host` 필드가 있으면 해당 호스트를, 없으면 `ghe_host` 기본값을 사용한다.
- 찾지 못하면 사용자에게 경로를 물어본다.

### 2. 인자 없이 호출된 경우 (`/sync-projects`)

1. `.claude/workspace.json`의 `projects.required` + `projects.optional` 목록과 `projects/` 하위 디렉토리를 비교한다.
2. `required` 중 아직 clone되지 않은 레포가 있으면 자동으로 clone한다.
3. `optional` 중 아직 clone되지 않은 레포가 있으면 clone 여부를 물어본다.
4. 이미 clone된 레포에 대해:
   - git repo인지 확인
   - 현재 브랜치, default branch 확인
   - `git fetch` 후 remote와의 차이 (behind/ahead) 확인
4. 상태를 테이블로 표시한다:
   ```
   | 레포 | 브랜치 | 상태 |
   |------|--------|------|
   | shopping-fep | main | ✓ 최신 |
   | shopping-order | main | ↓ 3 commits behind |
   ```
5. behind인 레포가 있으면 "전체 sync할까요?"로 물어본다.
6. 승인 시 각 레포에서 `git pull` 실행한다.

### 3. 검색어와 함께 호출된 경우 (`/sync-projects {검색어}`)

1. `projects/`에 이미 해당 이름의 디렉토리가 있는지 확인한다.
   - 있으면 → sync (git fetch + git pull) 후 상태 표시
   - 없으면 → 2단계로

2. GHE에서 검색한다. 검색 대상 호스트는 `ghe_host` 기본값을 사용한다:
   ```bash
   gh api search/repositories --hostname {ghe_host} -X GET -f q="{검색어}" --jq '.items[] | {full_name, description}'
   ```

3. 검색 결과를 표시하고 clone할 레포를 선택받는다.

4. 선택된 레포를 clone한다. 검색 결과의 호스트(`ghe_host`)를 사용한다:
   ```bash
   gh repo clone https://{ghe_host}/{org}/{repo} projects/{repo}
   ```

5. clone 완료 후 상태를 표시한다.
6. clone한 레포가 `workspace.json`에 없으면 **7단계(workspace.json 등록)** 를 실행한다.

### 4. 정확한 레포명으로 호출된 경우 (`/sync-projects {org/repo}`)

- `{org/repo}` 형식(슬래시 포함)이면 검색 없이 바로 clone/sync한다.
- 호스트 결정: `workspace.json`에 해당 레포가 등록되어 있고 `host` 필드가 있으면 사용, 없으면 `ghe_host` 기본값.
- clone 명령:
  ```bash
  gh repo clone https://{host}/{org}/{repo} projects/{repo}
  ```
- clone한 레포가 `workspace.json`에 없으면 **7단계(workspace.json 등록)** 를 실행한다.

### 5. 격리 구조 설정

clone 완료 후, 해당 프로젝트를 격리 구조(`main/` + `worktrees/`)로 변환한다.

1. clone된 `projects/{repo}/` 디렉토리에서:
   ```bash
   cd projects/{repo}
   mkdir -p main worktrees
   # .git 제외한 파일을 main/으로 이동
   find . -maxdepth 1 ! -name '.' ! -name '..' ! -name '.git' ! -name 'main' ! -name 'worktrees' -exec mv {} main/ \;
   # .git 이동 (마지막)
   mv .git main/
   ```
2. 변환 검증: `test -d main/.git && test -d worktrees`
3. `main/CLAUDE.md`가 있으면 격리 구조 루트에 복사: `cp main/CLAUDE.md ./CLAUDE.md`

이미 격리 구조(`main/.git` 존재)인 프로젝트는 이 단계를 건너뛴다.

### 6. Sync 시 격리 구조 확인

인자 없이 호출(`/sync-projects`)하여 기존 프로젝트를 sync할 때:
- 격리 구조가 아닌 프로젝트(`projects/{repo}/.git` 존재)를 발견하면, 상태 테이블에 "⚠️ 격리 구조 미설정"으로 표시하고 `/worktree setup` 실행을 제안한다.
- 격리 구조인 프로젝트는 `git -C projects/{repo}/main fetch && git -C projects/{repo}/main pull`로 sync한다.

### 7. workspace.json 등록 (워크트리 기반)

clone한 레포가 `workspace.json`의 `required`/`optional` 어디에도 없을 때 실행한다.

1. 추가할지 AskUserQuestion으로 물어본다. 거부하면 종료.
2. 승인 시 간단한 설명(desc)을 입력받는다.
3. CC 루트(`{ccRoot}`)에서 워크트리를 생성한다:
   ```bash
   git -C {ccRoot} worktree add worktrees/chore/sync-add-{repo} -b chore/sync-add-{repo}
   ```
4. 워크트리의 `.claude/workspace.json`을 Edit으로 수정한다:
   - `projects.optional` 배열에 `{ "repo": "{org}/{repo}", "desc": "{desc}" }` 추가
   - `ghe_host`와 다른 호스트에서 clone한 경우 `"host": "{host}"` 필드도 함께 추가
5. 커밋 → push → PR 생성. sync-projects는 일괄 자동화 흐름이므로 `/commit`/`/pull-request` 스킬을 거치지 않고 직접 git/gh를 호출한다 (커밋 메시지가 고정 형식이고 이슈 키 입력 단계가 흐름을 멈추기 때문):
   ```bash
   git -C {worktreePath} add .claude/workspace.json
   git -C {worktreePath} commit -m "workspace.json에 {org}/{repo} 등록"
   git -C {worktreePath} push -u origin chore/sync-add-{repo}
   gh pr create --repo {org}/command-center --head chore/sync-add-{repo} --title "workspace.json에 {repo} 등록" --body "sync-projects에서 자동 생성"
   ```
6. 워크트리 정리:
   ```bash
   git -C {ccRoot} worktree remove worktrees/chore/sync-add-{repo}
   ```
7. PR 링크를 사용자에게 표시한다.

## 주의사항

- clone 시 항상 **default branch**를 유지한다. 다른 브랜치로 체크아웃하지 않는다.
- clone 후 자동으로 격리 구조로 변환한다. 변환 실패 시 안내하고 수동 `/worktree setup`을 제안한다.
- `projects/`는 `.gitignore` 대상이므로 워크스페이스 repo에 영향을 주지 않는다.
- sync 시 `main/` 디렉토리 기준으로 pull한다. 워크트리는 개별 관리 대상이므로 건드리지 않는다.
- 네트워크 오류 시 어떤 레포가 실패했는지 명확히 알린다.
- **타임아웃**: 네트워크 명령(GHE API 검색, clone, fetch, pull)에 `timeout: 120000` (2분)을 설정한다. 타임아웃 초과 시 해당 레포를 건너뛰고 실패 목록에 기록한다.

## 호스트 결정

- **clone 전** (검색, 신규 clone): 프로젝트의 `host` 필드 → 없으면 `ghe_host` 기본값
- **clone 후** (sync, fetch/pull): `git -C projects/{repo}/main remote get-url origin`에서 호스트 추출
- 검색: `gh api search/repositories --hostname {host}` 사용
- clone: `gh repo clone https://{host}/{org}/{repo}` (full URL) 사용
- sync: `git -C projects/{repo}/main fetch/pull` 사용 (격리 구조 기준)
- 모든 명령이 `gh` 또는 `git`으로 시작해야 한다 (allowed-tools 제약).
