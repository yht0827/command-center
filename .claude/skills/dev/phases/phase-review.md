# phase-review: 검토 + 통합 감사 (QA Manager + ZeroTrust 병렬)

**state.md 갱신**: Phase 진입 시 `phase: review`, `phase-file: ${CLAUDE_SKILL_DIR}/phases/phase-review.md`, `phases.review: in_progress`, `current-step: mechanical-gate`로 갱신한다.

**최대 2회 반복.**

**문서 로드**: `${PROJECT_ROOT}/.dev/prd.md`와 `${PROJECT_ROOT}/.dev/design.md`를 Read한다. 파일이 없으면 건너뛴다.

## Step 0: Mechanical Gate (lint + build + test)

QA/ZT 에이전트 호출 전에 기계적 검증을 통과시킨다. 실패하는 코드를 리뷰하는 것은 토큰 낭비이다.

프로젝트 타입은 config.json의 `projectTypes`를, 타임아웃은 `timeouts`를 참조한다.

### 0-1. Lint

리뷰 전에 lint를 실행하여 포맷팅을 확정한다. 리뷰 대상 diff에 최종 포맷팅이 반영되어, phase-complete의 commit에서 lint가 추가 변경을 만드는 것을 방지한다.
- 프로젝트 타입에 따른 lint 명령: kotlin-gradle → `./gradlew ktlintFormat` 후 `./gradlew ktlintCheck`, node → `bun run lint --fix` 또는 `npm run lint -- --fix`, python → `ruff format .`
- lint 변경이 있으면 `${GIT_PREFIX} add -A`로 스테이징에 포함한다.
- `ktlintCheck` 실패(auto-fix 불가 에러) 시 에러 내용을 `Task(subagent_type="coder")`에 전달하여 수정 시도한다. 수정 후 재검증.

### 0-2. Build

**빌드 명령 결정**:

1. `${PROJECT_ROOT}/CLAUDE.md`를 Read하여 빌드/컴파일 명령을 탐색한다. `build`, `compile`, `빌드` 키워드가 포함된 명령을 찾는다. CLAUDE.md가 없으면 다음 단계로.
2. CLAUDE.md에 빌드 명령이 없으면 → 프로젝트 타입에서 기본값을 사용한다:
   | 프로젝트 타입 | 기본 빌드 명령 |
   |---------------|---------------|
   | kotlin-gradle, java-gradle | `./gradlew build -x test` |
   | node | `bun run build` 또는 `npm run build` (package.json의 scripts.build가 있을 때만. `which bun` → bun, 없으면 npm) |
   | python | 건너뛰기 (인터프리터 언어) |
3. 프로젝트 타입으로도 결정 불가 → AskUserQuestion: "빌드 검증 명령을 감지하지 못했습니다." 선택지: 사용자가 직접 입력 / 건너뛰기.
   - 직접 입력 → 해당 명령을 사용.
   - 건너뛰기 → 다음 단계로 진행.

**실행 흐름**:
1. 감지된 빌드 명령을 `PROJECT_ROOT`에서 실행한다.
2. **성공** → 0-3으로 진행.
3. **실패** → 에러 출력을 `Task(subagent_type="coder")`에 전달하여 자동 수정 시도 (Context Slicing: coder 수정 모드 — 빌드 에러 메시지 + 코드 맵 + 프로젝트 루트 경로).
4. 수정 후 빌드를 **1회 재시도**한다.
5. **재시도 성공** → 0-3으로 진행.
6. **재시도 실패** → 사용자에게 빌드 에러를 표시하고 AskUserQuestion: "빌드가 실패했습니다. 직접 수정 후 계속 진행할까요, 아니면 중단할까요?"

### 0-3. Test

**테스트 명령 결정**: config.json `projectTypes`의 `test` 필드를 사용한다. 테스트 명령이 없으면 건너뛴다.

**실행 흐름**:
1. 테스트 명령을 `PROJECT_ROOT`에서 실행한다.
2. **성공** → Step 1로 진행.
3. **실패** → 에러 출력을 `Task(subagent_type="coder")`에 전달하여 자동 수정 시도.
4. 수정 후 테스트를 **1회 재시도**한다.
5. **재시도 성공** → Step 1로 진행.
6. **재시도 실패** → 사용자에게 테스트 실패를 표시하고 AskUserQuestion: "테스트가 실패했습니다. 직접 수정 후 계속 진행할까요, 아니면 중단할까요?"

### Gate 통과 기준

lint, build, test 모두 통과해야 Step 1로 진행한다. 단일 Gate에서 오케스트레이터가 직접 판단한다 (에이전트 호출 불필요).

**state.md**: `execution-log`에 Mechanical Gate 결과를 기록한다 (예: `"lint ✓, build ✓, test ✓"`).

---

각 반복(1~2회)에서:

**Step 1**: 변경사항 수집 및 파일 저장 (작업 경로 기준에 따라 GIT_PREFIX를 붙여 실행).
- `${GIT_PREFIX} add -A`로 스테이징한 후, **Diff 수집 규칙**에 따라 `--cached` diff를 `DIFF_FILE`에 리다이렉트한다.

**Step 2**: qa-manager와 security-auditor를 **병렬로** 호출한다.
- **state.md**: `current-step: qa-review`로 갱신한다.

**Task A**: qa-manager agent.
`Task(subagent_type="qa-manager")` — prompt에 다음을 포함:
- 변경사항 diff 파일 경로 (`DIFF_FILE`) + Read 지시
- PRD의 "요구사항" + "수용 기준" + 설계서의 "변경 범위" 섹션 (Context Slicing 규칙 참조). 문서가 없으면 diff만으로 코드 품질 리뷰를 수행하도록 안내한다.
- 코드 맵 (누적된 상태, 있으면)
- 이전 Q&A 히스토리 (이전 반복의 답변, 있으면)
- "PRD의 수용 기준(AC)을 반드시 검증하라. 각 AC에 대해 코드에서 충족 근거(파일:라인)를 찾아 PASS/FAIL을 판정하고, 결과를 `| # | 기준 | 판정 | 근거 |` 테이블로 출력하라."
- 반복 2회차면: 이전 리뷰 이후 수정된 내용
- 아래 **검토 관점**과 **CERTAIN 심각도 기준**을 qa-manager 프롬프트에 포함한다:

```
### 검토 관점

AC 검증 외에, 다음 관점에서 코드를 추가 검토한다.
발견 사항은 CERTAIN(Critical/Warning) 또는 QUESTION으로 분류한다.

1. 동시성 안전: 공유 상태 접근에 적절한 동기화가 있는가, 분산 환경 중복 실행이 방지되는가
2. 대용량 처리: 데이터 건수 증가 시 메모리/시간이 선형 이상 증가하지 않는가
   (전체 조회 vs 페이지네이션, N+1 쿼리, 배치 크기 제한 등)
3. 미사용 코드: 본인 변경으로 사용되지 않게 된 import/변수/함수가 정리되었는가
4. 하위 호환: 기존 API 계약(응답 형식, 필수 파라미터 등)이 의도치 않게 깨지지 않았는가

### CERTAIN 심각도 기준

판단 기준은 "자동 수정이 안전한가"이다.

- Critical: 설계서/PRD에 명시된 동작과 코드가 다르고, 수정 방향이 명확하다. coder가 자동 수정한다.
  예: 설계서에 "분산 락 사용" 명시인데 미구현, 컨벤션 위반, 미사용 코드 미정리
- Warning: 잠재적 문제이지만, 의도적 선택이거나 추가 맥락이 필요하다. 사용자가 판단한다.
  예: 설계서에 언급 없지만 동시 접근 우려, 대용량 시 병목 가능성, API 응답 형식 변경 감지
  동시성/대용량/하위호환 관련 발견은 설계서에 명시된 패턴 미구현이 아닌 한 Warning으로 분류한다.

보고할 가치가 없는 사항은 보고하지 않는다.
```

**Task B**: security-auditor 통합 감사.
`Task(subagent_type="security-auditor")` — prompt에 다음을 포함:
- PRD 전체 (있으면)
- 설계서 전체 (있으면)
- 변경사항 diff 파일 경로 (`DIFF_FILE`) + Read 지시
- 코드 맵
- "통합 감사"로 동작할 것

**Step 3**: 두 Task 완료 후 결과를 합산한다.
- **state.md**: `execution-log`에 qa-manager와 security-auditor 결과 엔트리를 각각 추가한다.

1. ZT 감사 결과를 Trust Ledger로 구성하고 `${PROJECT_ROOT}/.dev/trust-ledger.md`에 저장한다.
2. QA의 CERTAIN + ZT의 CRITICAL/HIGH/MEDIUM을 합산하여 **통합 findings**를 구성한다.
3. 중복 항목은 병합한다 (같은 파일:라인을 둘 다 지적한 경우).
4. QA의 AC 검증 테이블을 `${PROJECT_ROOT}/.dev/ac-results.md`에 저장한다 (phase-complete에서 Read하여 사용).
5. 사용자에게 **요약만** 표시한다 (Agent 전문 출력 금지):
   ```
   리뷰 완료:
   - AC 검증: PASS N건, FAIL N건
   - QA: Critical N건, Warning N건, QUESTION N건
   - ZT: CRITICAL N건, HIGH N건, MEDIUM N건
   - Trust Ledger: .dev/trust-ledger.md에 저장됨
   ```

**Step 4: 결과 처리 (의사코드)**
- **state.md**: `current-step: fix-findings`로 갱신한다 (Critical/QUESTION이 있을 때).

```
findings = Step 3에서 합산한 통합 findings
did_fix = false

# 4a: Critical 자동 수정
if findings에 Critical(QA) 또는 CRITICAL(ZT)이 있으면:
    해당 항목만 사용자에게 표시
    coder로 자동 수정 (수정 모드: 항목 목록 + 수정 방안 + 코드 맵 + PROJECT_ROOT)
    did_fix = true

# 4b: QUESTION 사용자 확인
if findings에 QUESTION(QA)이 있으면:
    질문 항목만 사용자에게 출력하고 답변 대기
    if 사용자가 스킵/넘어가기:
        미답변 QUESTION을 Trust Ledger에 기록:
        ### 미답변 QA QUESTION
        - [QUESTION] 항목 설명
          - 맥락: ...
    else:
        답변을 수렴하여 다음 반복에 반영
        did_fix = true

# 4c: 반복 판단
if did_fix:
    → 다음 반복 (재리뷰)
else:
    # Critical도 QUESTION도 없는 경우
    if Warning(QA) 또는 HIGH/MEDIUM(ZT) 항목이 있으면:
        항목 목록만 표시하고 "이 항목들을 수정할까요?" 확인
        if 수정 선택:
            coder로 수정 → qa-manager 1회 확인 리뷰 → phase-complete
            # 이 확인 리뷰는 최대 2회 반복 카운트에 포함되지 않는 단발성 검증이다.
        else:
            → phase-complete
    else:
        → phase-complete (클린 통과)
```

**2회 반복 후 미해결 Critical**: 2회 반복 후에도 Critical이 남아있으면 미해결 항목을 사용자에게 명시하고 AskUserQuestion으로 진행 여부를 확인한다 ("수동 수정 후 재리뷰" / "현재 상태로 진행").

**state.md 갱신**: phase-complete로 진행 시 `phases.review: completed`, `current-step` 제거.
