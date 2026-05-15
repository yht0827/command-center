# Architecture — 재고 관리

> 정책 인덱스 + 데이터 흐름. 코드 구조/ERD는 ontology와 코드에 위임합니다.

## 정책 인덱스

| 주제 | 책임 entity | 핵심 정책 |
|------|-------------|----------|
| [재고 점유 흐름](재고-점유-흐름/README.md) | `stock-reservation`, `stock-fulfillment`, `stock-reservation-record` | 점유→확정/해제 2단계, TTL 15분, 분산 락 |
| [입고·출고 처리](입고-출고-처리/README.md) | `stock-replenishment`, `stock-movement` | 모든 변동의 이력 보관, 정합성 감사 |
| [저재고 알림](저재고-알림/README.md) | `low-stock-alert` | 임계값 정책, 알림 채널 |

## 데이터 흐름

### 주문 → 점유 → 확정 (정상 경로)

```
[commerce-order 도메인]
   │ order-placement (cross-domain triggers)
   ▼
stock-reservation
   │ 1. Redis 분산 락 획득
   │ 2. stock.available 확인
   │ 3. stock-reservation-record 생성 (TTL=15분)
   │ 4. stock.reserved += quantity
   │ 5. 락 해제
   ▼
[order: paid 이벤트 발행 by commerce-order]
   │ Kafka 토픽 commerce.order.paid (cross-domain consumes)
   ▼
stock-fulfillment
   │ 1. stock-reservation-record 조회
   │ 2. stock.total -= quantity (실제 차감)
   │ 3. stock.reserved -= quantity (점유 해제)
   │ 4. stock-movement 기록 (사유: fulfillment)
   │ 5. 잔여 stock.available < 임계값이면 low-stock-alert 트리거
```

### TTL 만료 (사용자 미결제)

```
stock-reservation-record (Redis, TTL=15분)
   │ TTL 만료
   ▼ Redis가 자동 삭제
[별도 워커가 만료 감지 → stock.reserved -= quantity 복원]
또는 다음 reservation 시도 시 정합성 검증으로 보정
```

### 환불 (commerce-order 도메인이 refund 이벤트 발행)

```
[order: refunded 이벤트]
   │ Kafka 토픽 commerce.order.refunded
   ▼
stock-fulfillment (consumes 모드)
   │ 1. stock.total += refund_quantity (복원)
   │ 2. stock-movement 기록 (사유: refund)
```

### 입고 (셀러 액션)

```
[셀러]
   │ POST /stocks/replenish
   ▼
stock-replenishment
   │ 1. stock.total += quantity
   │ 2. stock-movement 기록 (사유: replenishment, 처리자: 셀러 ID)
   │ 3. (저재고였다면) 알림 해제
```

## 의존하는 인프라

| infra | 용도 |
|-------|------|
| `mysql` | stock 본체, stock-movement 영구 이력 |
| `redis` | stock-reservation-record (TTL 자동 회수), 분산 락 |
| `kafka` | 저재고 알림 발행 (`commerce.inventory.low_stock`), 주문 이벤트 구독 |

## 도메인 경계

- **소유**: 재고 본체, 점유 기록, 이동 이력
- **참조 가능**: 다른 도메인은 가용 수량(`available`)만 조회 가능
- **외부 통합**:
  - `commerce-order/order-placement` → `stock-reservation` (동기 RPC, 점유)
  - `commerce-order/order-event` → `stock-fulfillment` (Kafka 구독, 확정/복원)
  - cross-domain.yaml에서 정의됨

## 변경 시 영향

- TTL 변경 → 결제 페이지 평균 체류 시간 분석 필요. 짧으면 결제 중 만료 위험, 길면 재고 점유 시간 증가.
- 점유 모델 변경(예: 차감형 → 점유형) → commerce-order의 주문 생성 흐름도 동기 변경 필요.
- 분산 락 구현 변경 (Redis → Redlock 등) → 동시성 시나리오 전수 재검증 필요.
