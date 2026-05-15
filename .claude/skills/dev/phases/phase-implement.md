# phase-implement: 구현

**state.md 갱신**: Phase 진입 시 `phase: implement`, `phase-file: ${CLAUDE_SKILL_DIR}/phases/phase-implement.md`, `phases.implement: in_progress`, `current-step: coder`로 갱신한다.

## Hotfix 모드 분기

오케스트레이터가 `--hotfix` 모드이면:
- Step 0에서 설계서(`design.md`) 로드를 건너뛴다. PRD(`prd.md`)는 로드한다.
- 구현 Task에서 설계서 대신 PRD와 코드 맵을 전달한다.
  - prompt: "다음 PRD를 참고하여 최소한의 변경으로 구현하라: {PRD 내용}. 코드 맵을 참고하라."

hotfix가 아닌 경우 아래 정상 플로우를 따른다.

## 구현

**Task A**: coder 구현.

**Step 0**: 문서 로드.
- `${PROJECT_ROOT}/.dev/design.md`를 Read하여 설계서를 로드한다.
- `${PROJECT_ROOT}/.dev/prd.md`를 Read하여 PRD를 로드한다.

`Task(subagent_type="coder")` — prompt에 다음을 포함:
- 확정된 설계서 (Step 0에서 로드한 설계 문서 전체)
- 코드 맵 (누적된 상태)
- 프로젝트 타입 및 구조
- 프로젝트 루트 경로 (작업 경로 기준 참조)
- "구현 순서" 섹션에 따라 순서대로 구현할 것

## Task 완료 후

**Step 1**: coder 결과를 받은 후:
- **state.md**: `execution-log`에 coder 결과 엔트리를 추가한다. `steps.implement`에 `coder 구현: completed`를 기록한다.
- 설계서 "구현 순서"의 항목 수와 coder의 보고 단계 수(`[N/M]`의 M)를 비교한다. 불일치 시 누락 항목을 명시하고 사용자에게 확인한다.
- **요약만** 사용자에게 보고한다 (Agent 전문 출력 금지. 코드는 파일에 이미 작성됨):
  ```
  구현 완료: M단계
  - [1/M] <파일> - <변경 요약>
  - [2/M] <파일> - <변경 요약>
  - ...
  특이사항: (설계 불일치 등, 있으면)
  ```
- Agent가 설계에서 벗어난 판단을 했다면 해당 내용을 특이사항에 포함하고 사용자 확인을 받는다.

**state.md 갱신**: `phases.implement: completed`, `current-step` 제거.

이후 phase-review로 진행.
