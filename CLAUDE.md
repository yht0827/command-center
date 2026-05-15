# CLAUDE.md

## Command Center

AI 기반 공용 작업 공간입니다.
PO, 디자이너, FE, BE 등 역할에 관계없이 이 디렉토리에서 Claude Code를 통해 다양한 작업을 진행합니다.

한국어로 응답하세요. 코드와 커밋 메시지도 한국어를 기본으로 합니다.

---

## 3계층 지식 구조

도메인 관련 작업은 **항상 ontology부터** 읽는다. ontology가 진입 지도이고, 비즈니스 맥락이나 실제 구현이 필요하면 entity의 필드를 따라 깊이 진입한다.

```
질문 → ontology/{도메인}.yaml (지도)
            ├─ wiki_doc → wiki/{도메인}/... (Why / Rule / Flow)
            └─ repo + package → projects/{repo}/main/... (코드)
```

wiki는 ontology가 가리키는 상세 문서이지 독립 탐색 대상이 아니다. brute-force로 wiki 전체를 검색하지 마라.

상세 규칙:
- ontology 탐색/작성: `.claude/rules/ontology-rules.md`
- wiki 작성/생애주기: `.claude/rules/wiki-docs.md`
- 프로젝트 코드 작업: `.claude/rules/project-work.md`(작업 흐름) + `.claude/rules/workspace-structure.md`(격리 구조)
- ontology/wiki 갱신 후보는 사용자 승인 후 반영: `.claude/rules/behavior.md § 10. 피드백 반영`

## 런타임 셋업

CC의 훅과 statusline은 `node` 명령으로 실행됩니다. 비대화 셸 PATH에 node가 잡혀 있어야 하고 `minRuntime.node` 이상이어야 합니다. 셋업 절차: `.claude/rules/runtime-setup.md`.

## 테스트

`.claude/__tests__/` 하위 테스트들은 다음 한 줄로 실행합니다:

```bash
node --test .claude/__tests__/branch-guard.test.mjs .claude/__tests__/config-utils.test.mjs .claude/__tests__/permission-handler.test.mjs .claude/__tests__/pre-tool-use.test.mjs .claude/__tests__/session-start.test.mjs .claude/__tests__/subagent-allow-patterns.test.mjs .claude/__tests__/runtime-enforcement.test.mjs
bash .claude/__tests__/hook-e2e.sh
```

`.claude/` 하위(훅, 스킬, 설정 등)를 수정할 때 위 테스트를 실행하세요.

## 작업 범위

이 워크스페이스에서 Claude가 할 수 있는 작업의 범위입니다.

- **PR 생성까지만.** PR 머지(`gh pr merge` 등)는 절대 실행하지 마세요. 사용자가 직접 머지를 요청하더라도 거절하고, PR 링크를 제공하여 직접 머지하도록 안내하세요.
- 역할(PO, PD, FE, BE)에 관계없이 누구든 wiki/ontology 문서 작업, 필요시 코드 작업, PR 생성까지 동일한 흐름을 사용합니다.
- **브라우저 제어는 agent-browser를 사용하세요.** 웹사이트 탐색, 스크린샷, 폼 입력, QA 테스트 등 브라우저가 필요한 모든 작업에 `/agent-browser` 스킬 또는 `agent-browser` CLI를 사용합니다.
