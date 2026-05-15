# 격리 구조 (Isolated Mode)

`projects/` 하위의 코드 레포는 **격리 모드**로 운영한다.

## 디렉토리 구조

구체적인 경로명은 `.claude/config.json`의 `isolation` 필드를 참조한다.

```
projects/{repo}/              ← 격리 구조 루트
├── main/                     ← git repo 본체 (읽기 전용)
│   ├── .git/
│   └── src/...
├── worktrees/                ← 모든 워크트리
│   ├── feature-x/
│   └── feature-y/
└── CLAUDE.md                 ← main/CLAUDE.md 복사본
```

## 핵심 규칙

- `main/`은 **수정 금지** (Edit/Write 금지). 탐색·구조 파악·ontology/wiki 문서화 근거로 Read만 사용한다.
- 코드 수정은 워크트리에서 수행한다 (`/worktree create`).
- 격리 구조가 아닌 프로젝트(`projects/{name}/main/` 디렉토리가 없음)를 발견하면 `/worktree setup`을 제안한다. 트리거: `/sync-projects` 실행 직후, 또는 `projects/{name}/` 첫 접근 시.
- sync 시 `main/`만 pull한다. 워크트리는 개별 관리.

## 관련 스킬

- `/worktree`: 격리 구조 생성 및 워크트리 관리
- `/sync-projects`: clone 시 자동으로 격리 구조로 변환
- `/dev`: 격리 모드를 감지하여 GIT_PREFIX/PROJECT_ROOT 설정

## 환경 파일

워크트리 생성 시 `main/`에서 복사할 환경 파일 목록은 `.claude/config.json`의 `isolation.envFiles`를 참조한다.
