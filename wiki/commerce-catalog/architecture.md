# Architecture — 상품 카탈로그

> 정책 인덱스 + 데이터 흐름. 코드 구조/ERD는 ontology와 코드에 위임합니다.

## 정책 인덱스

| 주제 | 책임 entity | 핵심 정책 |
|------|-------------|----------|
| [상품 등록](상품-등록/README.md) | `catalog-registration`, `product` | 필수 필드, 자동 검수 룰, Kafka 이벤트 발행 |
| [검색 노출 규칙](검색-노출-규칙/README.md) | `search-index-sync`, `search-index-document` | 비동기 동기화, 노출 우선순위, 키워드 가중치 |
| [가격 정책](가격-정책/README.md) | `price-update-pipeline`, `price` | 정가/할인가, 동시 적용 우선순위, 할인 기간 |
| [카테고리 구조](카테고리-구조/README.md) | `category` | 트리 깊이, 다중 매핑, 리프 노드 규칙 |

## 데이터 흐름

### 상품 등록 → 검색 노출

```
[셀러]
   │ 1. 상품 입력 (이름, 이미지, 가격, 카테고리 선택)
   ▼
catalog-registration ──► product (mysql)
                    ──► product-image (s3, 메타: mysql)
                    ──► price (mysql)
                    ──► kafka (commerce.catalog.product.changed)
                                  │
                                  ▼
                            search-index-sync
                                  │ 본문 로딩
                                  ▼
                          search-index-document (elasticsearch)
                                  │
                                  ▼
                              [구매자 검색]
```

### 가격 변경 흐름

```
[MD/운영팀]
   │ 가격 변경 요청 (단건 또는 배치)
   ▼
price-update-pipeline ──► price (mysql, 갱신)
                    ──► search-index-sync (트리거)
                                  │
                                  ▼
                          search-index-document (가격 필드 갱신)
```

## 의존하는 인프라

| infra | 용도 |
|-------|------|
| `mysql` | 상품·카테고리·가격 마스터 |
| `s3` | 상품 이미지 원본 (비공개 버킷) |
| `cloudfront` | 상품 이미지 외부 노출 (CDN) |
| `kafka` | 상품 변경 이벤트 스트림 |
| `elasticsearch` | 검색 인덱스 |
| `redis` | 카테고리 매핑 캐시, 검수 룰 캐시 |

## 도메인 경계

- **소유**: 상품, 카테고리, 상품 이미지, 가격, 검색 인덱스 문서
- **참조 가능**: 다른 도메인은 상품 ID로 카탈로그 정보를 조회만 가능
- **외부 통합**: 주문(`commerce-order`)·재고(`commerce-inventory`)와 상품 ID 기반으로만 연결 (cross-domain.yaml 참조)

## 변경 시 영향

- 상품 등록 흐름 변경 → Kafka 이벤트 스키마도 호환 변경 필요 (다운스트림: search-index-sync)
- 가격 정책 변경 → 검색 노출 가격 계산식도 동기 변경 필요
- 카테고리 트리 변경 → 검색 인덱스 재색인 작업 필요
