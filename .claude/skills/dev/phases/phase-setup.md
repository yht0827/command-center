# phase-setup: 작업환경 준비

## 0.0 진행 중 작업 감지

### `--resume` 플래그가 있는 경우
1. state.md를 탐색한다 (아래 탐색 규칙 동일).
2. 존재하고 `status: in_progress`이면 → 질문 없이 바로 재개 (아래 "이어서 진행" 절차).
3. state.md가 없거나 `status: completed`이면 → "재개할 작업이 없습니다." 출력 후 종료.

### `--resume` 플래그가 없는 경우 (자동 감지)
ARGS[0]이 있으면 → 새 작업이므로 자동 감지를 건너뛰고 0.1로 진행.
ARGS[0]이 없으면 → 아래 자동 감지 로직 실행.

1. 현재 디렉토리 기준으로 `.dev/state.md`를 탐색한다:
   - `test -d main/.git` → `main/.dev/state.md` 또는 `worktrees/*/.dev/state.md` 탐색
   - 일반 모드 → `.dev/state.md` 탐색
2. state.md가 존재하고 `status: in_progress`이면:
   - 사용자에게 AskUserQuestion으로 질문: "이전에 진행하던 작업이 있습니다."
     - "이어서 진행" → 재개
     - "새로 시작" → 0.1로 진행 (0.6에서 덮어씀)
3. state.md가 없거나 `status: completed`이면 → 0.1로 진행.

**이어서 진행 시:**
- state.md에서 GIT_PREFIX, PROJECT_ROOT, 베이스 브랜치, 프로젝트 타입, ARGS[0], flags를 복원.
- `test -d`로 경로 검증. 실패 시:
  - 격리 모드이고 state.md에 branch 정보가 있으면 → 먼저 `${GIT_PREFIX} show-ref --verify --quiet refs/heads/{branch}`로 브랜치 존재를 확인한다. 브랜치가 없으면 "브랜치 `{branch}`가 존재하지 않습니다. 새로 시작합니다." → 새로 시작. 브랜치가 존재하면 → AskUserQuestion: "작업 경로(`{PROJECT_ROOT}`)가 존재하지 않습니다." 선택지: "워크트리 재생성" / "새로 시작"
    - 재생성 선택 → Skill 도구로 `/worktree create {branch} --target {WORK_DIR}`을 호출한다. 경로 재검증 후 성공 시 재개, 실패 시 "새로 시작".
  - 일반 모드이면 → "작업 경로가 유효하지 않습니다." → 새로 시작.
- prd.md, design.md, trust-ledger.md, codemap.md, qa-history.md가 있으면 Read하여 맥락 복원.
- **DOMAIN_CONTEXT 복원**: state.md에 `domain` 필드가 있으면, `ontology/index.yaml`에서 해당 도메인을 찾아 abox 파일과 wiki 문서(`glossary.md`, `architecture.md`)를 Read하여 `DOMAIN_CONTEXT`를 재구성한다. `domain` 필드가 없으면 빈 상태로 진행한다.
- **Q&A 히스토리 복원**: `qa-history.md`가 있으면 이전 Q&A의 핵심 결정 사항이 보존되므로, 해당 Phase의 agent 호출 시 히스토리로 전달한다.
- phases 맵에서 마지막 in_progress Phase를 찾고, state.md의 `phase-file` 경로(또는 `Phase 라우팅` 규칙에 따라 `phase-{name}.md`)를 Read한 후 재개.
- phase-setup의 나머지 단계(0.1~0.6)를 건너뛴다.

## 0.1 Git 저장소 및 모드 감지
아래 순서로 확인한다:
1. `test -d main/.git` 성공 → **격리 모드**. `GIT_PREFIX` = `git -C main`.
2. 실패하면 → `git rev-parse --is-inside-work-tree` 확인. 성공 → **일반 모드**. `GIT_PREFIX` = `git`.
3. 둘 다 실패 → AskUserQuestion: "Git 저장소가 아닙니다. `git init`으로 생성할까요?"
   - 예 → `git init` 실행 후 일반 모드로 계속.
   - 아니오 → 중단.

이후 phase-setup의 모든 git 명령은 `GIT_PREFIX`를 붙여 실행한다.

## 0.2 베이스 브랜치 결정
공유 규칙의 "베이스 브랜치 감지"에 따라 결정한다.

결정 후 베이스 브랜치를 최신 상태로 동기화한다:
1. `${GIT_PREFIX} remote get-url origin`으로 remote 존재를 확인한다. 없으면 건너뛴다.
2. `${GIT_PREFIX} branch --show-current`로 현재 브랜치를 확인한다.
   - 베이스 브랜치와 **일치하면** → 3단계로 진행.
   - **불일치하면** → "⚠️ main/이 `<현재 브랜치>`에 있습니다. 베이스 브랜치(`<base-branch>`)가 아닙니다."를 경고하고 현재 로컬 상태로 계속 진행한다. `main/`에서 checkout하지 않는다 (읽기 전용 원칙).
3. `${GIT_PREFIX} fetch origin <base-branch> && ${GIT_PREFIX} pull origin <base-branch>`를 실행한다. 실패 시 (네트워크 오류 등) 경고를 표시하고 현재 로컬 상태로 계속 진행한다.

## 0.3 프로젝트 정보 수집
프로젝트 루트를 결정한다: 격리 모드면 `PROJECT_ROOT = main/`, 일반 모드면 `PROJECT_ROOT = ./` (현재 디렉토리).

아래 4개 작업은 서로 독립적이므로 **병렬로 실행**한다:
1. **프로젝트 타입 감지**: `PROJECT_ROOT`에서 빌드/설정 파일을 스캔하여 타입을 결정한다 (`build.gradle.kts`, `build.gradle`, `package.json`, `pyproject.toml`, `setup.py`).
2. **디렉토리 구조 수집**: `PROJECT_ROOT`의 최상위 2레벨 디렉토리 구조를 수집한다.
3. **CLAUDE.md 확인**: `PROJECT_ROOT`에 CLAUDE.md가 있으면 읽어서 코딩 컨벤션을 확보한다.
4. **도메인 컨텍스트 탐색**: 현재 레포와 매칭되는 도메인 컨텍스트를 찾는다.
   - `${GIT_PREFIX} remote get-url origin`으로 레포명을 추출한다 (예: `hubtwork/example`).
   - `ontology/index.yaml`을 Read하여 `repos` 필드에 해당 레포가 포함된 도메인을 찾는다.
   - 매칭되면 해당 도메인의 ontology abox 파일(`ontology/abox/{file}`)과 wiki 문서(`glossary.md`, `architecture.md`)를 Read하여 `DOMAIN_CONTEXT`에 저장한다.
   - 매칭되지 않으면 `DOMAIN_CONTEXT`는 빈 상태로 진행한다. 안내 메시지를 출력하지 않는다 (PRD 확정 후 phase-requirements에서 처리).
   - `DOMAIN_CONTEXT`는 이후 agent 프롬프트에 "도메인 컨텍스트"로 포함한다.

## 0.4 관련 코드 맵 생성
ARGS[0]에서 도메인 키워드를 추출하여 `PROJECT_ROOT` 내에서 관련 코드를 탐색하고 초기 코드 맵을 생성한다.

1. **키워드 추출**: ARGS[0]에서 핵심 도메인 키워드를 추출한다 (이슈 키 제외).
   - 예: "[JIRA-123] 결제 한도 변경" → `결제`, `한도` → `payment`, `limit`, `amount`
2. **관련 파일 탐색**: `PROJECT_ROOT`를 기준으로 키워드로 Grep하여 관련 파일을 수집한다.
   - 서비스, 도메인 모델, 컨트롤러/핸들러 등 핵심 파일을 식별한다.
3. **핵심 파일 스캔**: 발견된 파일의 상단(클래스 선언, 주요 상수/메서드 시그니처)을 Read하여 역할을 한 줄로 정리한다.
4. **코드 맵 작성**: 핵심 파일 / 참조 파일 / 설정으로 분류하여 맵을 작성한다.

탐색은 **가볍게** — 파일 전체를 읽지 않고, 역할 파악에 필요한 최소한만 읽는다. 코드 맵에 등록하는 파일은 **최대 15개**로 제한한다 (핵심 ≤ 5, 참조 ≤ 7, 설정 ≤ 3). 초과 시 관련도가 높은 파일을 우선한다. 상세한 코드 분석은 이후 agent들이 맵을 기반으로 타겟팅하여 수행한다.

## 0.5 작업환경 생성
격리된 작업환경을 생성한다.
- ARGS[0]에서 브랜치명을 생성한다:
  1. 이슈 키 추출 시도: 대문자 영문 + `-` + 숫자 패턴 (e.g., `JIRA-123`, `PAY-456`)
  2. **이슈 키가 있으면**: 이슈 키를 브랜치명으로 사용 (e.g., `[JIRA-123] 로그인 기능 추가` → 브랜치 `JIRA-123`)
  3. **이슈 키가 없으면**: 핵심 키워드 추출, 한국어→영어 번역, 최대 40자 (e.g., `로그인 기능 추가` → `login-feature`)
- **격리 모드** (`main/.git` 존재): Skill 도구로 `/worktree create <branch-name> --target <WORK_DIR>`을 호출한다.
  - `git worktree` 명령을 직접 실행하지 않는다. 효율이나 편의를 이유로 우회 금지.
  - `--target`에는 프로젝트의 격리 구조 루트 경로를 전달한다 (예: `--target projects/shopping-growth`).
  - 대상 프로젝트가 여러 개이면 각 프로젝트마다 `/worktree create --target <경로>`를 개별 호출한다.
  - 실행 후 `test -d worktrees/<branch-name>`으로 디렉토리 존재를 확인한다.
  - 실패 시: "워크트리 생성에 실패했습니다. `worktrees/<branch-name>`이 존재하지 않습니다." → 사용자에게 재시도/중단 선택지를 제시한다. `GIT_PREFIX`는 갱신하지 않는다.
- **일반 모드**: `git checkout -b <branch-name>`으로 브랜치를 생성한다. 브랜치가 이미 존재하면 (`already exists` 에러) `git checkout <branch-name>`으로 전환한다.
  - **최초 실행 시에만** 격리 모드 전환을 제안한다. 조건: `.dev/` 디렉토리가 현재 프로젝트에 존재하지 않을 때만 제안. 이미 존재하면 (이전 `/dev` 실행 기록) 제안을 건너뛴다.
  - 제안 메시지: "격리 구조로 전환하면 기능 브랜치를 격리된 디렉토리에서 작업할 수 있습니다. 전환할까요? (`/worktree setup`)"
  - AskUserQuestion으로 "격리 구조로 전환" / "현재 구조 유지" 선택지를 제공한다.
  - "전환" 선택 시: 먼저 `git checkout <base-branch>`(Step 0.2에서 결정된 베이스 브랜치)로 원복한 뒤, `worktree` 스킬의 setup 프로세스를 실행한다. 완료 후 격리 모드의 워크트리 생성 흐름으로 이어간다 (위의 "격리 모드" 절차 실행). 워크트리 생성이 완료되면 최종적으로 `GIT_PREFIX = git -C worktrees/<branch-name>`, `PROJECT_ROOT = worktrees/<branch-name>/`이 된다.
  - "유지" 선택 시: 그대로 진행.
- 완료 후 프로젝트 타입, 브랜치명, 작업 경로를 사용자에게 보고한다. **사용자 확인을 기다리지 않고 즉시 0.5a로 진행한다.**

## 0.5b Command-Center 워크트리 사전 생성

현재 디렉토리에 `wiki/` 디렉토리가 존재하면 (= command-center에서 실행 중), CC worktree를 **무조건 생성**한다. wiki 동기화 필요 여부는 phase-complete에서 변경점 유무로 판단하므로, 사전 예측 없이 항상 준비한다. worktree 생성은 가벼우므로 비용 부담이 없다.

1. CC 브랜치명 결정: `chore/sync-wiki-<project-branch>` (예: `chore/sync-wiki-AFS-36`)
2. command-center git 루트를 명시하여 워크트리 생성: `git -C <command-center-root> worktree add worktrees/<cc-branch> -b <cc-branch>`. `<command-center-root>`는 `wiki/` 디렉토리가 존재하는 경로 (= CWD 또는 `git rev-parse --show-toplevel`로 확인). **주의:** `-C`를 생략하면 프로젝트 repo의 git에 워크트리가 등록되므로 반드시 명시한다.
3. 성공 시 `CC_WORKTREE = worktrees/<cc-branch>/`로 설정. state.md에 `cc-worktree` 필드로 기록.
4. 실패 시 (동명 브랜치 존재 등) 경고만 표시하고 `CC_WORKTREE`는 빈 상태로 진행.

`wiki/`가 없으면 건너뛴다 (command-center 외부에서 실행 중).

## 0.5a .gitignore 자동 보강
프로젝트 타입에 따라 `${PROJECT_ROOT}/.gitignore`에 빌드 아티팩트 패턴을 추가한다. 이미 존재하는 패턴은 건너뛴다.

| 프로젝트 타입 | 추가 패턴 |
|---------------|-----------|
| kotlin-gradle, java-gradle | `.gradle/`, `build/` |
| node (npm/yarn/pnpm/bun) | `node_modules/`, `dist/`, `.next/` |
| python | `__pycache__/`, `.venv/`, `*.pyc`, `dist/` |

`.dev/` 패턴도 이 단계에서 함께 추가한다 (dev 스킬의 문서 보관 규칙과 통합).

## 0.6 진행 상태 최종 갱신
`${PROJECT_ROOT}/.dev/state.md`를 생성한다. 이 시점에서 모든 필드가 확정되어 있다.
- `mkdir -p ${PROJECT_ROOT}/.dev`로 디렉토리를 보장한다.
- 모든 필드를 확정값으로 기록: phase, phase-file, resume-instruction, status, branch, base, project-type, project-root, args, flags, cc-worktree
- phases: { setup: completed }
