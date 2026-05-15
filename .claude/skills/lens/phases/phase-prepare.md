# Prepare Phase: 준비 & 후보 확정

## 0. 인자 파싱

ARGS에서 파싱:
- `--detail` → `DETAIL_MODE = true`. 기본 `false`.
- `--skip-update` → `SKIP_UPDATE = true`. 기본 `false`.
- `--idea "<텍스트>"` → `IDEA_RAW`. Report Phase에서 사용.
- 나머지 → `RAW_QUERY`.

## 1. 초기화 (병렬)

**CC_ROOT 확정**: `git rev-parse --show-toplevel`로 command-center 루트 경로를 확인한다.

다음을 **모두 동시에** 발행한다:

1. `Read(<CC_ROOT>/.claude/workspace.json)` → 프로젝트 목록
2. `Read(<CC_ROOT>/ontology/index.yaml)` → 도메인별 repos, summary, 비즈니스 위계
3. `Bash(ls -d <PROJECTS_DIR>/*/main/.git <PROJECTS_DIR>/*/.git 2>/dev/null || true)` → 로컬 프로젝트 스캔
4. `Bash(mkdir -p <CC_ROOT>/.lens/<SESSION_ID>)` → SESSION_DIR 생성

**동시에 LLM이 수행** (도구 호출 불필요):

`PROJECTS_DIR` = `<CC_ROOT>/projects` (절대 경로로 확정).

**쿼리 분석**:
- "~에서" 패턴으로 명시 레포명을 추출. 레포명 제거 후 → `QUERY`.
- 불용어/조사 제거 → 비즈니스 키워드. shell 특수문자 제거.
- **의도어 제거**: 사용자가 알고 싶은 "의도"를 나타내는 메타 용어는 코드 검색에 유효하지 않으므로 키워드에서 제외한다. 의도어 목록: `정책, 규칙, 로직, 구현, 코드, 설명, 정리, 점검, 분석, 확인, 조회`.
- 키워드 0개 → AskUserQuestion. 최대 2회 재시도.

## 2. 후보 선택

도구 결과 도착 후, 아래 정보를 종합하여 **LLM이 직접 판단**한다.

### 입력 정보

1. **workspace.json의 프로젝트 목록**: `required`, `optional`, `local` 각 항목의 `repo`(또는 `path`)와 `desc`
2. **ontology/index.yaml의 도메인 목록**: 각 도메인의 `repos`(관련 레포), `summary`(비즈니스 요약), `path`(비즈니스 위계). workspace.json보다 의미론적으로 풍부한 정보.
3. **로컬 스캔 결과**: `ls -d` 출력에서 실제 존재하는 프로젝트명과 구조(격리/일반) 파악
4. **쿼리에서 추출한 명시 레포명과 키워드**

### 선택 로직

1. **명시 레포**: 쿼리에서 "~에서" 패턴으로 추출한 레포명이 있으면 해당 프로젝트를 우선 포함한다.
2. **LLM 판단**: ontology index.yaml의 `summary`/`path`와 workspace.json의 `desc`를 종합하여, 쿼리 키워드와 관련 있는 프로젝트를 선택한다. ontology 정보를 우선 참조하고, workspace.json은 ontology에 없는 프로젝트를 보완한다.
3. **로컬 존재 확인**: 선택된 프로젝트가 로컬 스캔 결과에 있는지 확인한다.

### 경로 결정

로컬 스캔 결과에서 각 프로젝트의 경로를 결정한다:
- `<name>/main/.git` 존재 → 격리 구조 → `path = <PROJECTS_DIR>/<name>/main`
- `<name>/.git` 존재 → 일반 구조 → `path = <PROJECTS_DIR>/<name>`

### 로컬에 없는 프로젝트

선택했으나 로컬에 없는 프로젝트가 있으면:
```
<프로젝트명>이(가) 로컬에 없습니다. `/sync-projects`로 추가한 뒤 다시 실행해주세요.
```
해당 프로젝트는 CANDIDATES에서 제외하고 계속 진행한다.

### 후보 0개

CANDIDATES가 0개이면:
```
탐색할 프로젝트를 찾지 못했습니다.

- 프로젝트 추가: `/sync-projects`
- 특정 프로젝트 지정: `/lens <프로젝트명>에서 <쿼리>`
```
여기서 종료한다.

### 상한

CANDIDATES **10개 초과** → 상위 10개. 안내 출력.

## 3. 최신화

`CANDIDATES`가 0개이면 건너뛴다.
`SKIP_UPDATE = true`이면 건너뛴다.

### 브랜치 감지 + pull (프로젝트별 병렬)

각 후보에 대해 **동시에** (5개씩 배치) 아래를 순차 실행한다:

**Step 1 — 기본 브랜치 감지**:
```bash
git -C <path> symbolic-ref refs/remotes/origin/HEAD
```
- 성공 시 `refs/remotes/origin/<branch>` 출력 → `refs/remotes/origin/` 접두사를 제거하여 branch명 파싱.
- 실패 시 Step 2로 진행.

**Step 2 — fallback 브랜치 감지** (Step 1 실패 시):
```bash
git -C <path> branch --list main master develop
```
- 출력된 첫 줄에서 `*`와 공백을 제거하여 branch명으로 사용.
- 출력 없음 → 해당 프로젝트 스킵.

**Step 3 — pull**:
```bash
git -C <path> pull origin <branch> --ff-only --quiet
```
- `timeout: 120000`.

**실패 처리**: best-effort. 실패해도 탐색 계속.

## 4. 사용자 보고

```
정책 탐지를 시작합니다.

- 탐색 후보: <K>개
  <후보 목록>
- 쿼리: "<QUERY>"

코드를 탐색합니다.
```

Explore Phase로 진행한다.
