# Status — 재고 관리

> AC별 구현 추적. 완료 후 20일 이상 경과된 항목은 정리 대상.

## 재고 점유 (stock-reservation)

| AC | 상태 | 비고 |
|----|------|------|
| 점유 API (`POST /stocks/reserve`) | ✅ | example-inventory-api |
| Redis 분산 락 | ✅ | 키: `lock:stock:{product_id}` |
| stock-reservation-record 생성 (TTL=15분) | ✅ |  |
| stock.reserved 갱신 | ✅ | 트랜잭션 내 처리 |
| 가용 수량 부족 시 거부 | ✅ | 명시적 에러 코드 반환 |
| TTL 만료 시 자동 복원 | ⬜ | Redis keyspace notification 도입 검토 |

## 재고 확정/복원 (stock-fulfillment)

| AC | 상태 | 비고 |
|----|------|------|
| paid 이벤트 구독 | ⬜ | commerce-order의 토픽 구독 설정 필요 |
| stock.total 차감, reserved 해제 | ⬜ |  |
| stock-movement 기록 (fulfillment) | ⬜ |  |
| refunded 이벤트 구독 → 복원 | ⬜ |  |
| 저재고 트리거 | ⬜ | 임계값 미만 진입 시 low-stock-alert 호출 |
| 중복 처리 방지 (idempotency) | ⬜ | event_id 기반 |

## 입고 처리 (stock-replenishment)

| AC | 상태 | 비고 |
|----|------|------|
| 입고 API | ✅ | 셀러용 백오피스 연동 |
| 일괄 입고 (CSV 업로드) | ⬜ | 셀러 요청 사항 |
| 실사 조정 (양수/음수 모두) | ✅ |  |
| 폐기 처리 (disposal 사유) | ⬜ | CS 권한 필요 |

## 저재고 알림 (low-stock-alert)

| AC | 상태 | 비고 |
|----|------|------|
| 기본 임계값 5개 | ✅ |  |
| 셀러별 임계값 설정 | ⬜ |  |
| Kafka 이벤트 발행 | ⬜ | `commerce.inventory.low_stock` |
| 이메일·푸시 알림 (알림 서비스 연동) | ⬜ | 별도 도메인 |
| 입고 후 알림 해제 | ⬜ | 임계값 이상 복귀 시 |

## 정합성

| AC | 상태 | 비고 |
|----|------|------|
| stock-movement 누적합 == stock.total 검증 | ⬜ | 일배치 |
| TTL 만료 미정리 잔여 점유 감지 | ⬜ | redis vs mysql 대사 |
