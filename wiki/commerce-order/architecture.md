# Architecture — 주문/결제

> 정책 인덱스 + 데이터 흐름. 코드 구조/ERD는 ontology와 코드에 위임합니다.

## 정책 인덱스

| 주제 | 책임 entity | 핵심 정책 |
|------|-------------|----------|
| [주문 생성](주문-생성/README.md) | `order-placement`, `order` | 가격 재검증, 재고 점유, Kafka 이벤트 발행 |
| [결제 흐름](결제-흐름/README.md) | `payment-processing`, `payment` | 결제 상태 머신, PG 연동, 실패 복구 |
| [환불 정책](환불-정책/README.md) | `refund-pipeline`, `payment` | 부분/전체 환불, 결제 수단별 절차 |
| [쿠폰 규칙](쿠폰-규칙/README.md) | `coupon`, `order-placement` | 중복 사용 차단, 사용량 카운터 |

## 데이터 흐름

### 주문 생성 → 결제 완료

```
[구매자]
   │ 장바구니 → 결제 페이지 → "결제하기"
   ▼
order-placement
   │ 1. 가격 재검증 (카탈로그 도메인 조회)
   │ 2. 쿠폰 검증·할인 계산
   │ 3. 재고 점유 요청 (재고 도메인)
   │ 4. order 레코드 생성 (status=pending)
   │ 5. order_created 이벤트 발행
   ▼
payment-processing
   │ PG API 호출
   ├──[성공]──► payment(captured) + order(paid) + paid 이벤트
   └──[실패]──► payment(failed) + order(payment_failed) + 재고 점유 해제
```

### 환불 흐름

```
[구매자/CS]
   │ 환불 요청 (전체 또는 라인별)
   ▼
refund-pipeline
   │ 1. 환불 가능 여부 검증 (배송 상태, 환불 기한)
   │ 2. 환불 금액 계산 (쿠폰 회수 포함)
   │ 3. PG 환불 API 호출 (결제 수단별)
   │ 4. payment(refunded) + order(refunded/partial_refunded)
   │ 5. refunded 이벤트 발행
   ▼
[재고 도메인이 이벤트 구독 → 재고 복원]
```

## 의존하는 인프라

| infra/external | 용도 |
|----------------|------|
| `mysql` | 주문/결제/쿠폰 마스터 |
| `kafka` | 주문 라이프사이클 이벤트 (`commerce.order.*`) |
| `redis` | 쿠폰 사용량 카운터, 분산 락 (재고 점유 시) |
| `pg-gateway` (external) | 외부 PG. 카드/계좌/간편결제별 다른 PG에 연결 |

## 도메인 경계

- **소유**: 주문, 결제 레코드, 쿠폰 정책, 주문 이벤트
- **참조 가능**: 다른 도메인은 주문 ID로 주문 정보를 조회만 가능
- **외부 통합**:
  - 상품 정보 → `commerce-catalog`에 조회 (가격·노출 상태)
  - 재고 점유/복원 → `commerce-inventory`에 요청 (cross-domain.yaml에서 정의 예정)

## 변경 시 영향

- 결제 상태 머신 변경 → CS 운영팀의 수동 보정 절차도 동기 변경 필요
- 환불 정책 변경 → 회계·정산 시스템에 영향. 정산팀 사전 협의 필수
- 쿠폰 규칙 변경 → 마케팅·CRM이 발행한 쿠폰들의 유효성을 재검증해야 할 수 있음
