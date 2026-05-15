# 온톨로지 규칙

`ontology/`는 **코드에 존재하는 비즈니스 개념과 그 관계의 지도**다. 각 entity는 `repo` + `package` 필드로 코드 위치를 고정하고, Claude는 도메인 관련 작업 전에 이 지도를 먼저 읽어 "어느 레포 어느 패키지를 봐야 하는지"를 즉시 파악한다. 코드 밖 비즈니스 배경은 `wiki/`에 두고, ontology entity의 `wiki_doc` 필드로 연결한다.

Claude가 이 시스템과 상호작용하는 방식은 세 축으로 요약된다:
1. **읽기**: 도메인 작업 시 ontology를 먼저 탐색한다 (§ 탐색 흐름).
2. **갱신**: 코드·wiki가 바뀌면 ontology도 함께 갱신한다 (§ 최신화 의무).
3. **작성**: 새 entity·relation은 코드 근거 + tbox axiom을 준수하여 작성한다 (§ 작성 원칙).

> 외부 시스템(팔란티어·RDF·Neo4j)과의 차이, 코드 중심 설계 의사결정의 근거 등 상세 배경은 `wiki/ontology-design.md` 참조. 이 룰 파일은 매 작업 시 참조되는 운영 규칙만 다룬다.

## 3계층 분리

| 계층 | 역할 | 정합성 앵커 |
|------|------|-------------|
| **ontology** | 코드에 있는 것의 지도 | `repo` + `package` (코드 존재 확인) |
| **wiki** | 코드 밖 비즈니스 맥락 | 사람이 작성·검토 |
| **code** | 실제 구현 (진실의 원천) | — |

ontology entity의 `wiki_doc` 필드가 두 계층을 연결합니다. wiki는 ontology가 가리키는 상세 문서이므로 **LLM은 `wiki_doc` 경유로만 wiki에 진입**합니다 ("이 코드가 뭐하는지" → ontology, "왜 이렇게 만들었는지" → wiki).

## 파일 구조

```
ontology/
├── tbox.yaml              ← T-Box: 용어 정의 (클래스, 프로퍼티, Axiom). 드물게 참조
├── index.yaml             ← 탐색 진입점. 매 요청 시 읽음
└── abox/                  ← A-Box: 인스턴스
    ├── infra.yaml         ← 공유 인프라 (mysql, redis, kafka 등). 도메인 공통
    ├── example.yaml ← 도메인별 process/data/external + relation
    └── cross-domain.yaml  ← 도메인 간 관계
```

## 탐색 흐름

질문이 특정 도메인의 코드 구조, 비즈니스 정책, entity 관계를 다룰 때:

**필수 단계** (항상 수행):
1. `ontology/index.yaml`을 읽어 전체 도메인 맵 파악
2. 관련 도메인의 A-Box 파일(`ontology/abox/{file}`)을 읽어 개념/관계 파악

**조건부 단계** (필요할 때만 진입):
3. 도메인 간 관계가 필요하면 → `index.yaml`의 `cross_domain` 필드가 가리키는 파일 참조
4. 비즈니스 정책/의사결정("왜?")이 필요하면 → entity의 `wiki_doc`을 따라 wiki로 이동
5. 코드를 읽거나 수정해야 하면 → entity의 `repo` + `package`로 코드 탐색
6. 새 entity/relation을 작성할 때만 → `ontology/tbox.yaml`로 타입/규칙 확인

> wiki는 `wiki_doc` 경유로만 진입한다. `wiki/` 전체를 검색해 답하지 마라.

## 네이밍 규칙

- **id** (도메인, entity 모두): 영문 소문자 + 하이픈. 예: `asset-factory`, `growth-system`
- **name**: 팀에서 부르는 이름. 한글 허용, 대명사(NPU, TUBA 등)는 영어. 예: 고양이키우기, NPU
- **file**: `abox/{도메인id}.yaml`

## 최신화 의무

ontology는 코드와 동기화되어야 한다. 오래된 ontology는 없는 것보다 해롭다.

### 코드 변경 시
- 새 서비스/프로세스가 추가되면 ontology entity를 **함께 추가**
- 기존 개념의 관계가 바뀌면 (새 의존성, 제거된 의존성) ontology를 **함께 갱신**
- entity가 삭제/deprecated 되면 ontology에서도 제거
- 코드 모듈 구조 변경은 entity가 아니라 `notes`에 반영

### wiki/ 변경 시
- wiki 문서를 추가/수정하면, 대응하는 ontology entity의 `wiki_doc`이 정확한지 확인
- 새 비즈니스 개념이 추가되면 ontology에 entity 추가

### 새 도메인 추가 시
1. `ontology/index.yaml`에 도메인 항목 추가 (path, summary, repos, infra)
2. `ontology/abox/{도메인id}.yaml` 파일 생성
3. 코드 분석 기반으로 entity/relation 작성 — `tbox.yaml`의 타입/axiom 준수
4. 도메인 간 관계가 있으면 `abox/cross-domain.yaml` 갱신

### 갱신 순서

ontology와 wiki를 동시에 갱신할 때 누가 먼저인지:

- **새 도메인·entity 추가**: ontology 먼저 (wiki_doc 필드가 wiki를 가리켜야 하므로). 그 다음 해당 wiki 문서 작성.
- **기존 정책 변경**: wiki 먼저 (ontology summary는 코드 근거를 따르므로 정책 결정이 먼저). 그 다음 ontology summary/notes를 정렬.
- **코드 변경 동반**: 코드 PR 안에서 ontology/wiki를 함께 갱신한다. 별도 PR 분리 금지.

### 정합성 점검
- `/domain-audit` 실행 시 ontology ↔ wiki ↔ 코드 3자 정합성 점검
- wiki_doc이 가리키는 파일이 실존하는지 확인
- ontology의 entity가 코드에 여전히 존재하는지 확인

## 작성 원칙

### entity는 비즈니스 기능 단위
- 코드 모듈(api 모듈, application 모듈 등)은 entity로 만들지 않는다 — notes에 기록
- 코드 위치는 각 entity의 `repo` + `package` 필드로 참조

### summary는 코드 근거 + 비즈니스 의미
- 코드에서 확인된 사실을 근거로 작성
- 문서에 없는 것을 발견하면 "wiki 문서 미작성"으로 명시

### 도메인 = 비즈니스 기능
- 코드 레포 단위가 아니라 비즈니스 기능 단위
- 하나의 레포에 여러 도메인이 있을 수 있음 (예: shopping-growth 안에 NPU + 매일방문)

### 코드 연동 없는 관계
- 사람이 개입하는 수동 데이터 전달(human-in-the-loop)은 relation이 아닌 notes에 기록

### 관계 유형 확장
- 기존 10개(`tbox.yaml` → `relation_types`)로 표현이 어려운 관계가 **같은 도메인 작업 내 2회 이상** 반복되면 사용자에게 유형 추가를 제안. 1회성은 `notes`에 기록한다.
- 미채택 유형 목록은 `wiki/ontology-design.md § 미채택 관계 유형` 참조.
- 발동 빈도가 낮은 룰. 다음 점검 회차에서 실제 발동 사례를 검토해 유지/삭제를 결정한다.
