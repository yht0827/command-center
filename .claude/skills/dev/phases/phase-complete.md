# phase-complete: 완료

**state.md 갱신**: Phase 진입 시 `phase: complete`, `phase-file: ${CLAUDE_SKILL_DIR}/phases/phase-complete.md`, `phases.complete: in_progress`, `current-step: commit`으로 갱신한다.

각 단계가 실패하면 사용자에게 보고하고 진행 여부를 확인한다.

## 5.1 Commit
**반드시 Skill 도구로 `/commit` 스킬을 호출한다.** `git commit`을 직접 실행하지 않는다.

```
Skill(skill: "commit", args: "--target ${PROJECT_ROOT}")
```

`PROJECT_ROOT`가 `./`(일반 모드)이면 `--target` 없이 호출한다: `Skill(skill: "commit")`

**test 실패 시 자동 수정 (1회):**
1. `/commit`이 test 실패로 중단하면, 실패 로그와 코드 맵, PROJECT_ROOT를 `Task(subagent_type="coder")`에 전달하여 수정 요청.
2. 수정 완료 후 `/commit`을 재호출한다.
3. 재호출도 실패하면 사용자에게 실패 목록을 보고하고 진행 여부를 확인한다.

## 5.2 PR 생성
**state.md**: `current-step: pr`로 갱신한다.
**반드시 Skill 도구로 `/pull-request` 스킬을 호출한다.** `gh pr create`를 직접 실행하지 않는다.

```
Skill(skill: "pull-request", args: "--target ${PROJECT_ROOT}")
```

`PROJECT_ROOT`가 `./`(일반 모드)이면 `--target` 없이 호출한다: `Skill(skill: "pull-request")`

pull-request은 독립 스킬이므로 dev 컨텍스트를 알지 못한다. 오케스트레이터는 **Skill 호출 전에** `${PROJECT_ROOT}/.dev/pr-context.md`에 추가 맥락을 Write하여 전달한다.

**pr-context.md 작성 절차:**

1. **비즈니스 맥락**: PRD의 "배경"과 "요구사항", 설계서의 "배경 및 목적"을 `## Background` 섹션으로 작성한다. `--hotfix`이면 ARGS[0]을 사용.
2. **Trust Ledger 요약**: `${PROJECT_ROOT}/.dev/trust-ledger.md`가 존재하면 Read하여 `## Audit Summary` 섹션을 추가한다:
   ```
   ## Audit Summary
   - 총 N건 (CRITICAL: n, HIGH: n, MEDIUM: n)
   - [주요 발견 항목 1줄 요약] (최대 5건)
   ```
   Trust Ledger가 없으면 이 섹션을 생략한다.
3. `Write(${PROJECT_ROOT}/.dev/pr-context.md)`로 파일을 저장한다.
4. 이후 `Skill(skill: "pull-request", ...)`을 호출한다. pull-request 스킬이 이 파일을 자동으로 감지하여 PR 본문에 반영한다.

pull-request이 전제조건 미충족(gh 미설치, remote 미설정 등)으로 종료하면, 오케스트레이터는 후속 안내를 추가한다: "나중에 `/pull-request`로 PR을 생성할 수 있습니다."

## 5.3~5.5 공통 규칙

**5.3~5.5는 조건이 충족되면 반드시 실행한다. "나중에", "별도로" 등의 이유로 defer하지 않는다.** 각 단계의 AskUserQuestion은 이 시점에서 사용자에게 질문해야 한다. 사용자가 AskUserQuestion에서 "건너뛰기"를 명시적으로 선택한 경우에만 해당 단계를 건너뛸 수 있다. 오케스트레이터가 임의로 묶어서 건너뛰는 것은 금지한다.

## 5.3 도메인 status.md 갱신
**state.md**: `current-step: domain-status`로 갱신한다.

`DOMAIN_CONTEXT`가 있고 (phase-setup 또는 phase-requirements에서 도메인 매칭/생성 성공), `${PROJECT_ROOT}/.dev/ac-results.md`가 존재하며 PASS한 AC가 1건 이상이면 실행한다. 조건 미충족 시에만 건너뛴다. FAIL한 AC가 있어도 PASS한 항목은 갱신한다.

**wiki 파일 편집 경로**: `CC_WORKTREE`가 설정되어 있으면 `${CC_WORKTREE}/wiki/...`를 편집한다. 비어있으면 `wiki/...`를 직접 편집한다 (command-center 외부에서 실행 중이거나 CC worktree 생성이 실패한 경우).

1. `${PROJECT_ROOT}/.dev/ac-results.md`를 Read하여 **PASS한 AC 목록**을 추출한다 (예: AC-1, AC-4, AC-7).
2. 매칭된 도메인의 status.md를 Read한다 (경로: `${CC_WORKTREE}/wiki/{domain}/status.md` 또는 `wiki/{domain}/status.md`).
3. 통과한 AC와 일치하는 행의 상태를 `⬜`→`✅`로, PR 열에 생성된 PR 링크를 기입한다.
4. AC가 `-`인 행은 변경하지 않는다 (PR 머지 시 수동 판정).
5. Edit으로 status.md를 갱신한다.
6. 갱신 결과를 사용자에게 보고한다:
   ```
   status.md 갱신: ✅ AC-1, AC-4, AC-7 (FR-1, FR-16, FR-19)
   ```

## 5.4 wiki 환류 제안
**state.md**: `current-step: wiki-sync`로 갱신한다.

`DOMAIN_CONTEXT`가 있으면 **반드시 실행한다** (defer 금지). 없을 때만 건너뛴다.

**wiki 파일 편집 경로**: 5.3과 동일하게 `CC_WORKTREE`가 설정되어 있으면 해당 경로를 사용한다.

PRD와 설계서에서 wiki 갱신 후보를 추출하여 사용자에게 제안한다:

1. **glossary 후보**: PRD/설계서에 등장하는 도메인 용어 중, 현재 `glossary.md`에 없는 것을 추출한다.
2. **주제 문서 후보**: PRD 제목과 배경을 기반으로, 주제 문서 생성을 제안한다.
3. **architecture.md 갱신 후보**: 설계서에 새로운 구조적 결정(레이어, 의존관계 등)이 있으면 인덱스 갱신을 제안한다.
4. **status.md 불일치 감지**: PRD의 요구사항과 status.md의 항목을 대조하여, PRD에서 폐기된 항목이 status.md에 남아있거나, PRD에 신규 추가된 항목이 status.md에 없으면 갱신을 제안한다.

**AskUserQuestion으로 사용자에게 즉시 질문한다** (defer 금지):
- "wiki 문서에 반영할까요?" + 후보 목록 표시
- 반영 선택 → 해당 파일 Edit/Write. 주제 문서 생성 시 architecture.md 인덱스에 링크 추가.
- 건너뛰기 선택 → 다음 단계 진행.

**임의 반영 금지**: 사용자 승인 없이 wiki 문서를 수정하지 않는다. 단, 질문 자체를 생략하는 것도 금지한다.

## 5.5 ontology 갱신 제안
**state.md**: `current-step: ontology-sync`로 갱신한다.

`DOMAIN_CONTEXT`가 있으면 **반드시 실행한다** (defer 금지). 없을 때만 건너뛴다.

PRD/설계서/코드 변경에서 ontology 갱신 후보를 추출하여 사용자에게 제안한다:

1. **새 entity 후보**: 설계서에 새 서비스/프로세스/데이터 개념이 등장했는데, ontology abox에 대응 entity가 없는 경우.
2. **relation 변경 후보**: 코드 변경으로 기존 의존관계가 추가/제거된 경우 (diff에서 import/주입 변경 감지).
3. **summary 갱신 후보**: 기존 entity의 동작이 변경된 경우 (예: 새 모드 추가, 조건 변경).

**AskUserQuestion으로 사용자에게 즉시 질문한다** (defer 금지):
- "ontology에 반영할까요?" + 후보 목록 표시
- 반영 선택 → ontology abox 파일 Edit. tbox.yaml axiom 준수 확인.
- 건너뛰기 선택 → 다음 단계 진행.

**임의 반영 금지**: 사용자 승인 없이 ontology를 수정하지 않는다. 단, 질문 자체를 생략하는 것도 금지한다.

## 5.4a Command-Center 커밋 및 PR
**state.md**: `current-step: cc-commit`으로 갱신한다.

`CC_WORKTREE`가 설정되어 있으면 실행한다.

1. `git -C ${CC_WORKTREE} status --short`로 변경사항을 확인한다.
   - **변경 없음**: CC worktree를 즉시 정리한다 (`git worktree remove ${CC_WORKTREE} && git branch -d <cc-branch>`). "wiki 변경 없음. CC worktree 정리 완료." 보고 후 다음 단계로.
   - **변경 있음**: 아래 커밋/PR 절차를 진행한다.
2. `/commit` 스킬을 호출하여 커밋한다:
   ```
   Skill(skill: "commit", args: "--target ${CC_WORKTREE}")
   ```
3. `/pull-request` 스킬을 호출하여 PR을 생성한다:
   ```
   Skill(skill: "pull-request", args: "--target ${CC_WORKTREE}")
   ```
4. PR URL을 사용자에게 보고한다.
5. 실패해도 프로젝트 파이프라인 완료에는 영향 없음. 경고만 표시.

## 5.6 진행 상태 완료
`${PROJECT_ROOT}/.dev/state.md`의 `status`를 `completed`, `phases.complete`를 `completed`로 갱신한다.

## 5.7 다음 단계

PR이 생성되었으면 완료이다. **PR 머지는 절대 실행하지 않는다** — 머지는 리뷰어가 직접 수행한다.

리뷰 수정 요청에 대비하여 작업환경 유지를 안내한다:

**격리 모드** (`PROJECT_ROOT`가 `worktrees/` 하위인 경우):
"리뷰 피드백 대응을 위해 워크트리를 유지합니다. 리뷰 완료 후 `/worktree done`으로 정리하세요."
- 워크트리 정리는 반드시 `/worktree done` 스킬을 호출한다. `git worktree remove`나 `git branch -d` 등 git 명령을 직접 실행하지 않는다.
- 대상 프로젝트가 여러 개이면 각 프로젝트마다 `/worktree done`을 개별 호출한다.

**일반 모드** (브랜치만 사용 시):
"리뷰 피드백 대응을 위해 현재 브랜치를 유지합니다. 리뷰 완료 후 베이스 브랜치로 전환하세요."

**CC worktree 정리**: `CC_WORKTREE`가 설정되어 있으면, CC PR이 머지된 후 `git worktree remove ${CC_WORKTREE}`로 정리하도록 안내한다. CC worktree는 command-center repo의 워크트리이므로 `/worktree` 스킬이 아닌 `git worktree remove`를 직접 사용한다 (command-center 자체의 워크트리 규칙).
