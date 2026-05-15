# Glossary — 재고 관리

> 이 도메인에서 자주 쓰이는 용어 정리.

## 데이터/엔티티

**재고 (stock)**
상품별 현재 재고 상태. 세 가지 수량을 가집니다.
- `total`: 셀러가 입고한 전체 수량
- `reserved`: 점유된(아직 확정 안 된) 수량
- `available`: 가용 수량 = `total - reserved`. 신규 점유는 이 값 기준으로 결정.

**재고 점유 기록 (stock-reservation-record)**
주문이 막 들어왔을 때 만들어지는 짧은 수명의 기록. order_id, 상품 ID, 수량, TTL을 가지며 Redis에 저장됩니다. 결제 완료 시 영구 이력으로 옮겨지고, TTL 만료 시 자동으로 사라집니다.

**재고 이동 이력 (stock-movement)**
모든 재고 변동의 영구 기록. 사유 코드, 수량(양수=증가, 음수=감소), 시각, 처리자(시스템/셀러/CS)를 가집니다. 정합성 점검·정산·감사에 사용됩니다.

## 프로세스

**재고 점유 (stock-reservation)**
주문 생성 시점에 재고를 임시로 잡아두는 과정. Redis 분산 락으로 동시성 충돌을 막고, 15분 TTL로 자동 회수가 보장됩니다.

**재고 확정/복원 (stock-fulfillment)**
주문 도메인의 결제·환불 이벤트를 Kafka에서 구독해 점유를 영구 확정하거나 환불 시 복원하는 비동기 컨슈머. 결제는 동기 흐름이 아니라 비동기로 처리되는 이유는 [재고 점유 흐름](재고-점유-흐름/README.md)을 참조하세요.

**입고 처리 (stock-replenishment)**
셀러가 새 재고를 입고하거나 실사 결과로 수량을 조정할 때 사용하는 프로세스. 모든 변동이 stock-movement에 양수/음수 이동으로 기록됩니다.

**저재고 알림 (low-stock-alert)**
재고가 임계값 미만으로 떨어지면 셀러에게 알림을 발행하는 프로세스. 알림은 Kafka 이벤트로 발행되어 별도 알림 서비스가 채널(이메일/푸시)을 결정합니다.

## 상태 전이

`stock-reservation-record`의 라이프사이클:

```
[created] ──결제완료──► [committed] (→ stock-movement으로 이동, Redis에서 삭제)
   │
   ├──TTL 만료──► [expired] (자동 삭제, stock.reserved 복원)
   │
   └──명시적 취소──► [cancelled] (Redis 즉시 삭제, stock.reserved 복원)
```

## 사유 코드 (stock-movement)

| 코드 | 의미 |
|------|------|
| `reservation` | 점유 (음수 이동, available 감소) |
| `fulfillment` | 결제 완료로 확정 (total 감소, reserved 감소) |
| `refund` | 환불로 복원 (total 증가) |
| `replenishment` | 셀러 입고 (total 증가) |
| `adjustment` | 실사 차이 조정 (양수 또는 음수) |
| `disposal` | 파손/폐기 (음수, total 감소) |

## 자주 혼동되는 개념

| 비슷해 보이지만 다른 것 | 차이 |
|-------------------------|------|
| `total` vs `available` | total은 셀러가 입고한 양, available은 구매 가능한 양. 두 값은 점유 중일 때 다름. |
| reservation vs fulfillment | reservation은 잠시 잡아둠(되돌릴 수 있음), fulfillment는 영구 차감(되돌리려면 refund 사유로 별도 처리). |
| stock-movement vs stock-reservation-record | movement는 영구 이력(MySQL), reservation-record는 단기 임시(Redis, TTL). |
| TTL 만료 vs 명시적 취소 | 둘 다 같은 결과(점유 해제)지만, 만료는 시스템 자동, 취소는 commerce-order의 cancel 액션. |
