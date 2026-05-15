---
name: dev
disable-model-invocation: true
description: "PRD → 설계 → 구현 → 리뷰 → 커밋/PR까지 전체 개발 사이클을 에이전트 팀이 Q&A 루프로 수행"
argument-hint: "<기능/버그 설명> [--hotfix] [--base <branch>] [--status] [--resume]"
allowed-tools:
  # git - 실사용 서브커맨드만 (파괴적 명령 차단)
  - "Bash(git -C *)"
  - "Bash(git init *)"
  - "Bash(git rev-parse *)"
  - "Bash(git branch *)"
  - "Bash(git checkout *)"
  - "Bash(git pull *)"
  - "Bash(git remote *)"
  - "Bash(git show-ref *)"
  - "Bash(git worktree *)"
  - "Bash(git add *)"
  - "Bash(git diff *)"
  - "Bash(git status *)"
  - "Bash(git push *)"
  - "Bash(git commit *)"
  # 파일시스템
  - "Bash(test *)"
  - "Bash(mkdir *)"
  - "Bash(ls *)"
  - "Bash(find *)"
  - "Bash(pwd *)"
  - "Bash(basename *)"
  - "Bash(dirname *)"
  - "Bash(which *)"
  - "Bash(wc *)"
  - "Bash(echo *)"
  # 빌드/린트/테스트 (Mechanical Gate + CLAUDE.md 명령)
  - "Bash(./gradlew *)"
  - "Bash(npm *)"
  - "Bash(npx *)"
  - "Bash(bun *)"
  - "Bash(bunx *)"
  - "Bash(yarn *)"
  - "Bash(pnpm *)"
  - "Bash(pip *)"
  - "Bash(poetry *)"
  - "Bash(pytest *)"
  - "Bash(ruff *)"
  # GitHub CLI
  - "Bash(gh *)"
  - "Bash(GH_HOST= *)"
  # 파일 도구
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  # 오케스트레이션
  - Task
  - Skill
  - AskUserQuestion
---

오케스트레이터. 직무 기반 Agent 팀과 Q&A 피드백 루프로 전체 개발 사이클을 관리한다.

항상 한국어로 응답한다.

## 스킬 참조 경로

Phase 파일은 `${CLAUDE_SKILL_DIR}/phases/` 하위에 위치한다.

다른 스킬의 프로세스를 실행할 때 아래 경로에서 Read한다:
- `${CLAUDE_SKILL_DIR}/../commit/SKILL.md`
- `${CLAUDE_SKILL_DIR}/../pull-request/SKILL.md`
- `${CLAUDE_SKILL_DIR}/../worktree/SKILL.md`

> **git/gh 권한 사용 경계:** 본 스킬은 `allowed-tools`에 `git commit`, `git push`, `git worktree`, `gh` 등을 직접 포함한다. 이는 `behavior.md § 8`의 "스킬 우선" 원칙의 예외가 아니라, **phase 파일이 위 스킬들의 절차를 inline으로 실행**할 때 필요한 권한이다. phase-complete 등에서 `/commit`·`/pull-request` 절차를 Read한 뒤 그 절차를 직접 수행하므로, 절차 내부의 Bash 명령을 모두 허용해야 한다. 새 phase를 추가할 때도 이 SSOT(스킬 절차)에서 벗어난 git 직접 호출은 금지한다.

## 인자

- `ARGS[0]` (필수): 기능 또는 버그 설명 (e.g., "[JIRA-123] 로그인 기능 추가")
- `--hotfix`: 긴급 버그 수정용 경량 경로. 설계/리뷰를 건너뛰되 경량 PRD는 실행 (setup → requirements → implement → complete)
- `--base <branch>`: 베이스 브랜치 지정 (미지정 시 자동 감지)
- `--status`: 현재 파이프라인 진행 상태를 조회한다. 다른 플래그/인자와 함께 사용 불가.
- `--resume`: 이전 파이프라인을 명시적으로 재개한다. state.md가 없거나 completed이면 에러.

ARGS[0]이 없고 `--status`도 `--resume`도 없으면 다음을 응답:
"구현할 기능이나 수정할 버그를 설명해주세요. 예: `/dev [JIRA-123] 로그인 기능 추가`"

### --status 동작
`--status`가 지정되면 파이프라인을 실행하지 않고 현재 상태만 출력한다:

1. phase-setup의 0.0과 동일한 방식으로 `.dev/state.md`를 탐색한다.
2. state.md가 없으면: "진행 중인 파이프라인이 없습니다." 출력 후 종료.
3. state.md가 있으면 다음을 출력:
   ```
   ## 파이프라인 상태
   - 작업: {args}
   - 브랜치: {branch} (base: {base})
   - 프로젝트: {project-type} ({project-root})
   - 현재 Phase: {phase} ({status})
   - 플래그: {flags}
   - 시작: {started}

   ### Phase 진행
   - setup: {status}
   - requirements: {status}
   - ...
   ```
4. 출력 후 종료. 파이프라인을 시작하지 않는다.

## Agent 팀

| Agent | 분류 | 역할 | 관점 | 모델 |
|-------|------|------|------|------|
| product-owner | PRODUCT | PRD 작성 | "뭘 만들지" | sonnet |
| architect | PLANNING | 설계 | "어떻게 만들지" / "구조적 일관성" | sonnet |
| design-critic | REVIEW | 설계 비판 검토 | "이 가정이 맞나" / "더 단순하게 안 되나" | opus |
| coder | EXECUTION | 구현 + 수정 | "만든다" | inherit |
| qa-manager | REVIEW | 코드 리뷰 + 스펙 충족 검증 | "스펙대로 됐나" | sonnet |
| security-auditor | REVIEW | 정책/보안/허점 감사 | "뭘 놓쳤나" | sonnet |
| researcher | ANALYSIS | 코드베이스 조사 + 기술 비교 | "이해한다" (독립 호출 전용) | sonnet |
| hacker | RECOVERY | 제약 우회 + 정체 탈출 | "다른 길이 있다" (정체 감지 시 호출) | sonnet |
| simplifier | RECOVERY | 복잡도 제거 + 범위 축소 | "더 작게 만들자" (정체 감지 시 호출) | sonnet |

### 모델 라우팅 원칙

- 비판적 분석 (가정 도전, 설계 비판): opus — 추론 깊이 우선
- 산출물 생성 (PRD, 설계, 코드, 리뷰): sonnet — 비용 효율 우선
- 정체 탈출 (제약 우회, 복잡도 제거): sonnet — 빠른 판단 우선
- 단순 검증 (Mechanical Gate 결과 판단): 오케스트레이터가 직접 수행 — 에이전트 불필요

## Phase 개요

| Phase | 파일 | 주 Agent | Q&A Loop |
|-------|------|----------|----------|
| setup | 작업환경 준비 | (inline) | No |
| requirements | PRD Q&A | product-owner | Yes (max 1) |
| design | 설계 Q&A | architect + design-critic (대형 또는 사용자 요청) | Yes (max 2) |
| implement | 구현 | coder | No |
| review | 검토 + 감사 | qa-manager + security-auditor (병렬) | Yes (max 2) |
| complete | 완료 | (스킬 참조) | No |

### Hotfix 경로 (`--hotfix`)

긴급 버그 수정용 경량 경로. 설계/리뷰를 건너뛰지만, **경량 PRD는 실행**한다 (coder TDD에 수용 기준을 제공하기 위함):
```
--hotfix: setup → requirements (경량) → implement → complete
정상:     setup → requirements → design → implement → review → complete
```
- requirements: product-owner가 소형 PRD를 작성한다 (배경 + 요구사항 + 수용 기준만).
- design: 건너뛴다. coder가 PRD와 코드 맵을 기반으로 직접 구현한다.
- review: 건너뛴다. coder의 증강 구현(단계별 빌드+테스트+린트)과 commit pre-check이 검증을 대체한다.

## Phase 라우팅

Phase에 진입할 때 **반드시** 해당 Phase 파일을 Read한 후 실행한다:
```
Read(`${CLAUDE_SKILL_DIR}/phases/phase-{name}.md`)
```
예: `phase-setup.md`, `phase-requirements.md`, `phase-design.md`, `phase-implement.md`, `phase-review.md`, `phase-complete.md`

Phase 파일의 지시에 따라 실행하고, 완료 후 다음 Phase로 진행한다.

## 코드 맵

오케스트레이터가 관리하는 누적 문서. 관련 파일의 경로와 역할을 기록한다.

**구조:**
```
## 코드 맵: <기능 설명>

### 핵심 파일
- <파일경로:라인> → 역할 설명
- ...

### 참조 파일
- <파일경로:라인> → 역할 설명
- ...

### 설정
- <파일경로> → 역할 설명
- ...
```

**생성**: phase-setup의 Step 0.4에서 초기 맵을 생성한다.
**누적**: 각 agent 출력에 "탐색 추가 항목" 섹션이 있으면 해당 항목을 맵에 append한다. 누적 맵은 **최대 25개**로 제한한다. 초과 시 참조 파일부터 제거한다.
**저장**: 코드 맵이 갱신될 때마다 `${PROJECT_ROOT}/.dev/codemap.md`에 Write한다.
**전달**: 모든 agent 호출 시 현재 코드 맵을 프롬프트에 포함한다.

## Trust Ledger (신뢰 원장)

security-auditor의 감사 결과를 누적하는 문서. 오케스트레이터가 관리한다.

**구조:**
```
## Trust Ledger

### 통합 감사 (review)
- [분류/심각도] 항목 설명
  - 근거: ...
  - 권고: ...
```

**생성**: phase-review에서 ZT 통합 감사 완료 시 생성.
**저장**: `${PROJECT_ROOT}/.dev/trust-ledger.md`에 저장한다.
**전달**: PR 본문에 감사 결과 요약으로 포함한다.

---

## 공유 규칙

### 작업 경로 기준
phase-setup에서 결정된 변수를 이후 모든 Phase에서 사용한다:
- `GIT_PREFIX`: git 명령의 prefix. 격리 모드면 `git -C <worktree-path>`, 일반 모드면 `git`.
  - 워크트리 생성 후에는 `git -C worktrees/<branch-name>`으로 갱신.
- `PROJECT_ROOT`: 프로젝트 소스 코드의 루트 경로. 격리 모드면 `main/` (워크트리 생성 후 `worktrees/<branch-name>/`), 일반 모드면 현재 디렉토리.
- `DIFF_FILE`: 변경사항 diff를 저장하는 파일 경로. `${PROJECT_ROOT}/.dev/diff.txt`. Diff 수집 규칙에 따라 phase-review, phase-complete에서 갱신된다.
- `DOMAIN_CONTEXT`: phase-setup 0.3에서 `ontology/index.yaml` 매칭으로 로드된 도메인 용어(glossary)와 아키텍처 정보. 매칭되지 않으면 빈 상태.
- `CC_WORKTREE`: command-center 워크트리 경로. phase-setup 0.5b에서 `DOMAIN_CONTEXT`가 있을 때 생성된다. `worktrees/chore/sync-wiki-<branch>/`. 없으면 빈 상태 (wiki 동기화 불필요).
- `GIT_PREFIX`를 갱신할 때 `test -d <path>`로 대상 경로 존재를 검증한다. 실패 시 갱신하지 않고 사용자에게 에러를 보고한다.
- Agent에게 `PROJECT_ROOT` 경로를 항상 전달하여 파일 도구(Read/Write/Edit/Glob/Grep)의 기준점으로 사용하게 한다.
- 빌드/린트/테스트 명령(`./gradlew`, `npm`, `pytest` 등)을 `PROJECT_ROOT`에서 실행할 때는 `(cd ${PROJECT_ROOT} && <명령>)` 서브셸 패턴을 사용한다. 직접 `cd`를 호출하면 이후 `GIT_PREFIX`의 상대경로가 무효화된다. 서브셸 패턴 일반 규칙은 `.claude/rules/behavior.md § 8` 참조.

### 워크트리 정리
격리 모드에서 워크트리를 정리할 때는 **반드시 `/worktree done` 스킬을 호출**한다. `git worktree remove`, `git branch -d` 등 git 명령을 직접 실행하지 않는다. 파이프라인 완료 후 사용자가 "정리해", "워크트리 삭제해" 등을 요청하면 `/worktree done`으로 처리한다.

### 베이스 브랜치 감지
`--base`가 지정되었으면 해당 브랜치를 사용한다. 미지정이면 자동 감지:
1. `${GIT_PREFIX} branch --list main master develop`로 존재하는 브랜치를 확인한다.
2. `main`이 존재하면 → 베이스로 자동 선택.
3. `main`이 없으면 → 존재하는 `develop`/`master`를 선택지로 사용자에게 제시한다 (AskUserQuestion). 하나도 없으면 직접 입력을 요청한다.

확정된 베이스 브랜치를 이후 phase-review (diff 계산), phase-complete (PR 생성)에서 사용한다.

### Q&A 히스토리 관리
Agent prompt 크기를 관리하기 위해:
- Agent에게는 **최신 설계/리뷰 출력만** 전달한다. 이전 버전은 전달하지 않는다.
- 이전 라운드의 질문+답변은 **핵심 결정 사항만 요약**하여 전달한다 (원문 그대로 X).
- 예: "Q: 세션 기반 vs JWT? → A: JWT 선택. Q: 토큰 만료 시간? → A: 30분"

### Agent 결과 전달 규칙 (컨텍스트 경량화)
Agent 출력을 사용자에게 전달할 때, **Phase 상태에 따라** 전문 표시 여부를 결정한다:
- **Q&A Phase** (requirements, design): Agent 출력의 첫 표시는 항상 **전문 표시**한다 (사용자가 산출물을 검토할 수 있도록). Phase 파일의 구체적인 표시 규칙이 이 일반 규칙보다 우선한다.
- **Q&A Phase 완료 보고**: 확정된 산출물을 파일에 저장하고, 사용자에게는 **요약만** 보고한다 ("PRD 확정. .dev/prd.md에 저장됨" 등).
- **Q&A 없는 Phase** (implement, review, complete): Agent 출력의 **요약만** 사용자에게 표시한다. 전문은 파일에 저장하거나 변수에 보관한다.

이후 Phase에서 이전 산출물이 필요하면 **파일을 Read하여 Agent prompt에 포함**하되, 오케스트레이터 자신의 출력에는 포함하지 않는다. 각 Phase 파일에서 구체적인 요약 포맷을 정의한다.

### 문서 보관
- phase-requirements 완료 시 확정된 PRD를 `${PROJECT_ROOT}/.dev/prd.md`에 저장한다.
- phase-design 완료 시 확정된 설계 문서를 `${PROJECT_ROOT}/.dev/design.md`에 저장한다.
- Q&A 히스토리를 `${PROJECT_ROOT}/.dev/qa-history.md`에 누적 저장한다 (Q&A 히스토리 저장 규칙 참조).
- Trust Ledger를 `${PROJECT_ROOT}/.dev/trust-ledger.md`에 저장한다.
- AC 검증 결과를 `${PROJECT_ROOT}/.dev/ac-results.md`에 저장한다 (phase-review에서 생성, phase-complete에서 Read).
- 코드 맵을 `${PROJECT_ROOT}/.dev/codemap.md`에 저장한다 (갱신 시마다).
- phase-design, phase-review 진입 시 해당 파일들을 Read하여 에이전트 프롬프트에 사용한다.
- `.gitignore` 보강은 phase-setup의 Step 0.5a에서 프로젝트 타입별로 처리한다 (`.dev/` 포함).

### 진행 상태 추적 (state.md)
파이프라인 진행 상태를 `.dev/state.md`에 기록하여 세션 재개를 지원한다.

**state.md 구조:**
```yaml
phase: implement
phase-file: ${CLAUDE_SKILL_DIR}/phases/phase-implement.md
resume-instruction: "phase-file을 Read한 후 current-step부터 진행하라"
status: in_progress
branch: JIRA-123
base: main
project-type: kotlin-gradle
project-root: worktrees/JIRA-123/
domain: asset-factory          # DOMAIN_CONTEXT 복원용 (ontology 도메인 ID). 미매칭이면 생략.
args: "[JIRA-123] 로그인 기능 추가"
flags: --hotfix
cc-worktree: worktrees/chore/sync-wiki-JIRA-123/
started: 2026-02-17T10:30:00
current-step: "mechanical-gate"
phases:
  setup: completed
  requirements: completed
  design: completed
  implement: completed
  review: in_progress
steps:
  implement:
    - coder 구현: completed
  review:
    - mechanical-gate: in_progress
    - qa-review-1: pending
execution-log:
  - phase: implement
    agent: coder
    result: completed
    steps-reported: 5/5
  - phase: review
    step: mechanical-gate
    result: "lint ✓, build ✓, test ✓"
  - phase: review
    agent: qa-manager
    result: "CERTAIN 0건, QUESTION 1건"
  - phase: review
    agent: security-auditor
    result: "CRITICAL 0건"
```

**갱신 규칙:**
- **초기화**: phase-setup 0.6에서 모든 필드가 확정된 후 생성한다. 격리 모드에서 `main/`에 `.dev/`가 생기는 것을 방지.
- Phase 진입 시: `phase: {name}`, `phase-file: ${CLAUDE_SKILL_DIR}/phases/phase-{name}.md`, `phases.{name}: in_progress`로 갱신.
- Phase 완료 시: `phases.{name}: completed`로 갱신.
- Phase 내 주요 Step 시작/완료 시: `current-step`과 `steps` 갱신.
- `--resume` 시 `current-step`에서 재개한다 (Phase 처음부터가 아닌 중단 Step부터).
- 에이전트 호출 완료 시: `execution-log`에 엔트리 추가 (agent명, result 요약).
- Gate 실행 결과도 `execution-log`에 기록한다.
- 정체 감지 시: 해당 `execution-log` 엔트리에 `stagnation: {패턴}` 필드를 추가한다.
- `domain` 필드: phase-setup 0.3 또는 phase-requirements Step 5에서 도메인이 매칭/생성되면 기록한다. resume 시 DOMAIN_CONTEXT 복원에 사용.
- phase-complete 완료 시: `status: completed`로 갱신.
- 새 파이프라인 시작 시 기존 state.md를 덮어쓴다.

### Context Slicing 규칙
설계서와 PRD를 Agent에게 전달할 때, 역할에 따라 필요한 섹션만 전달하여 컨텍스트 효율을 높인다:
- **product-owner (PRD 작성)**: ARGS[0] + 코드 맵 + 프로젝트 타입/구조 + 프로젝트 루트 경로 + DOMAIN_CONTEXT (있으면)
- **architect (설계)**: PRD 전체 + 코드 맵 + 프로젝트 타입/구조/컨벤션 + 프로젝트 루트 경로 + DOMAIN_CONTEXT (있으면)
- **coder (구현)**: 설계서 전체 + 코드 맵 + 프로젝트 루트 경로. `--hotfix`이면 설계서 대신 PRD + 코드 맵.
- **coder (수정)**: 수정 항목 목록 + 수정 방안 + 코드 맵 + 프로젝트 루트 경로
- **qa-manager**: PRD의 "요구사항" + "수용 기준" + 설계서의 "변경 범위" 섹션 + diff 파일 경로 (`DIFF_FILE`) + 코드 맵
- **security-auditor (통합 감사)**: PRD 전체 + 설계서 전체 + diff 파일 경로 (`DIFF_FILE`) + 코드 맵
- **design-critic (설계 비판)**: 설계서 초안 + PRD + 코드 맵 + 프로젝트 루트 경로
- **researcher (독립 조사)**: 조사 요청 + 코드 맵 (있으면) + 프로젝트 루트 경로
- **hacker (제약 우회)**: 정체 상황 설명 (에러 메시지, 시도한 접근) + 코드 맵 + 프로젝트 루트 경로
- **simplifier (복잡도 제거)**: 정체 상황 설명 + 설계서 + PRD + 코드 맵

각 에이전트에 전달하는 입력 크기가 `.claude/config.json`의 `contextLimits`를 초과하면, 우선순위가 낮은 섹션부터 요약 또는 생략한다.

### 병렬 실행 규칙
읽기 전용 Agent(product-owner, architect, design-critic, qa-manager, security-auditor, researcher, hacker, simplifier)는 서로 병렬 실행이 가능하다. 병렬 실행 시:
1. 하나의 메시지에서 여러 `Task()` 호출을 동시에 발행한다.
2. 모든 병렬 Task가 완료된 후 결과를 합산한다 (Gate 로직).
3. 쓰기 Agent(coder)는 다른 쓰기 Agent와 병렬 실행하지 않는다.
4. coder와 읽기 전용 Agent의 병렬은 **읽기 Agent가 이전 Phase의 산출물(설계서 등)만 참조하는 경우** 허용한다. 현재 구현 중인 코드를 참조하는 읽기 Agent와는 병렬하지 않는다.

### 정체 감지 + 에스컬레이션

phase-review(QA→수정→재리뷰 루프)에서 적용한다.
각 루프의 최대 반복은 기존과 동일하다. 정체 감지 시 반복을 소진하지 않고 에스컬레이션으로 전환한다.

#### 감지 패턴

| 패턴 | 감지 기준 | 유형 |
|------|----------|------|
| SPINNING | 동일 에러 메시지가 2회 연속 반복 | 기계적 (텍스트 비교) |
| OSCILLATION | 접근법 A→B→A 왕복이 감지됨 | 정성적 (LLM 판단) |
| NO_DRIFT | 이전 반복과 비교해 코드 변경이 실질적으로 없음 (diff 비교) | 반기계적 (diff stat) |
| DIMINISHING_RETURNS | 수정 범위가 줄어드는데 테스트/리뷰 결과가 개선되지 않음 | 정성적 (LLM 판단) |

#### 에스컬레이션 경로

| 감지 패턴 | 1차 대응 | 2차 대응 (1차 실패 시) |
|----------|---------|---------------------|
| SPINNING | hacker에 제약 우회 분석 위임 | researcher에 근본 원인 분석 위임 |
| OSCILLATION | architect에 설계 재검토 요청 | 사용자에게 두 접근법 제시, 선택 요청 |
| NO_DRIFT | hacker에 제약 식별 + 우회 경로 요청 | researcher에 코드베이스 탐색 위임 |
| DIMINISHING_RETURNS | simplifier에 복잡도 분석 + 범위 축소 요청 | 사용자에게 현재 상태 보고, 방향 전환 여부 확인 |

### Gate 로직
phase-review.md의 Step 3~4에 정의. QA + ZT 결과를 합산하고 심각도별로 처리한다.

### Diff 수집 규칙
Agent에게 변경사항 diff를 전달할 때, 메인 컨텍스트 절약을 위해 **파일 리다이렉트 + 경로 전달**을 사용한다.

**핵심 원칙**: diff 출력이 Bash 결과로 메인 컨텍스트에 진입하지 않도록, **셸 리다이렉트로 파일에 직접 쓴다**.

#### 수집 절차

1. `DIFF_FILE = ${PROJECT_ROOT}/.dev/diff.txt`. **매 수집 시** `mkdir -p $(dirname ${DIFF_FILE})`을 실행하여 디렉토리 존재를 보장한다.
2. diff를 파일에 직접 리다이렉트한다 (Bash 결과에 diff가 나타나지 않음):
   ```bash
   ${GIT_PREFIX} diff --cached > ${DIFF_FILE}
   ```
3. `wc -l < ${DIFF_FILE}`로 줄 수를 확인한다.
4. 총 변경이 **500줄 이상**이면: `--stat` 요약을 파일 앞에 추가하고, 파일 끝에 "변경된 파일을 Read 도구로 직접 확인하라"는 안내를 추가한다:
   ```bash
   ${GIT_PREFIX} diff --cached --stat > ${DIFF_FILE}
   echo "---" >> ${DIFF_FILE}
   echo "위는 요약입니다. 변경된 파일을 Read 도구로 직접 확인하라." >> ${DIFF_FILE}
   ```
5. Agent 프롬프트에는 **파일 경로만 전달**한다:
   ```
   변경사항 diff: <DIFF_FILE>
   이 파일을 Read하여 변경사항을 확인하라.
   ```

이 규칙은 모든 diff 패턴에 적용한다: `${GIT_PREFIX} diff --cached` (스테이징), `${GIT_PREFIX} diff <base>...HEAD` (브랜치 비교) 등. 브랜치 비교 시에는 해당 diff 명령으로 리다이렉트한다.

### Q&A 히스토리 저장 규칙
Q&A Phase(requirements, design)에서 사용자와 agent 간 Q&A가 발생하면, 핵심 결정 사항을 `${PROJECT_ROOT}/.dev/qa-history.md`에 누적 저장한다. 세션이 종료되어도 Q&A 맥락을 보존하기 위함이다.

**저장 시점**: 각 Q&A Phase 완료 후 (PRD/설계서 저장과 함께).

**파일 구조**:
```markdown
## requirements Q&A

- Q: 세션 기반 vs JWT? → A: JWT 선택 (사용자)
- Q: 토큰 만료 시간? → A: 30분 (사용자)
- 미해결: 리프레시 토큰 전략

## design Q&A

- Q: 캐시 레이어 위치? → A: 서비스 레이어 (사용자)
- design-critic MUST-ADDRESS: 동시성 제어 필요 → 반영됨
```

**저장 규칙**:
- 질문 원문이 아닌 **핵심 결정 사항만 요약**한다 (1질문 1줄).
- 사용자 답변과 agent 답변을 구분한다 (`(사용자)`, `(agent)`).
- 미해결 질문이 있으면 `미해결:` 접두사로 기록한다.
- design-critic의 MUST-ADDRESS 항목 중 반영된 것도 기록한다.
- 새 Phase의 Q&A는 기존 파일에 **append**한다 (덮어쓰지 않음).

**resume 시 활용**: phase-setup 0.0의 "이어서 진행"에서 qa-history.md를 Read하여, 해당 Phase의 agent 호출 시 이전 Q&A 히스토리로 전달한다.

---

## 플래그 충돌 검증

- `--resume`과 `--hotfix`, `--status`는 **동시 사용 불가**. 함께 있으면: "`--resume`은 다른 모드 플래그와 동시에 사용할 수 없습니다." 에러 후 중단.
- `--resume`은 ARGS[0] 없이 단독 사용한다. ARGS[0]이 함께 있으면: "`--resume`은 작업 설명 없이 단독으로 사용합니다." 에러 후 중단.

---

## 에러 처리

- Phase가 심각하게 실패하면 에러를 표시하고 사용자에게 진행 방법을 확인한다.
- 에러를 조용히 무시하지 않는다.
- 도구나 명령이 사용 불가하면 대안을 제안한다.
- 사용자가 중단하면 진행 상황을 저장하고 완료된 내용을 보고한다.
- phase-review의 ZT 통합 감사가 실패해도 QA 리뷰 결과만으로 진행한다. 감사 실패를 사용자에게 알린다.
- 2분 이상 소요될 수 있는 Bash 명령(`./gradlew test`, `npm test`, `npm install` 등)에는 `timeout: 300000`(5분)을 설정한다.
