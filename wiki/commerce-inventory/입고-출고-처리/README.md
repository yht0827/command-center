# 입고·출고 처리

> 작성일: 2026-05-13 | 수정일: 2026-05-13 | 유형: 정책 | 관련 레포: example-inventory-api

## 개요

재고를 늘리고 줄이는 모든 변동(입고, 실사 조정, 폐기 등)을 어떻게 기록하고 추적하는지를 다룹니다. 핵심은 모든 변동이 `stock-movement` 이력에 남아야 하고, 그 누적합이 `stock.total`과 항상 일치해야 한다는 점입니다.

## 입고 (replenishment)

셀러가 새 재고를 들여올 때 호출합니다.

`POST /stocks/replenish`:
```json
{
  "product_id": 12345,
  "quantity": 100,
  "lot_id": "LOT-2026-05-13-A",
  "note": "5월 정기 입고"
}
```

처리 흐름:

1. 셀러 권한 검증 (해당 상품의 셀러인지)
2. 트랜잭션 내에서:
   - `stock.total += quantity`
   - `stock-movement` 기록 (사유: `replenishment`, 처리자: seller_id, 양수 이동)
3. 저재고 알림 상태였다면 해제 이벤트 발행
4. 입고 완료 응답

## 실사 조정 (adjustment)

정기 실사 결과 시스템 수량과 실물이 다를 때 사용합니다.

`POST /stocks/adjust`:
```json
{
  "product_id": 12345,
  "delta": -3,
  "reason_detail": "5월 실사: 시스템 100개, 실제 97개",
  "actor": "OPS-USER-456"
}
```

처리 흐름:

1. 운영팀 권한 검증 (셀러는 조정 불가)
2. 트랜잭션 내에서:
   - `stock.total += delta` (음수면 감소)
   - `stock-movement` 기록 (사유: `adjustment`, 처리자: 운영자 ID, note에 사유 상세)
3. 조정 사유는 향후 감사에서 확인할 수 있도록 보관

## 폐기 (disposal)

파손·반품·소실 등의 사유로 재고를 영구 폐기할 때 사용합니다.

`POST /stocks/dispose`:
```json
{
  "product_id": 12345,
  "quantity": 2,
  "reason": "damaged_in_warehouse",
  "actor": "CS-USER-789"
}
```

처리 흐름은 실사 조정과 유사하지만 사유 코드가 `disposal`로 분리되어 회계상 손실로 분류됩니다.

## stock-movement 스키마

| 필드 | 설명 |
|------|------|
| `id` | PK |
| `product_id` | 상품 |
| `delta` | 변동량 (양수=증가, 음수=감소) |
| `reason` | 사유 코드: reservation/fulfillment/refund/replenishment/adjustment/disposal |
| `actor` | 처리자 (system/seller_id/ops_user_id) |
| `reference_id` | 연관 ID (order_id, lot_id 등) |
| `note` | 자유 텍스트 사유 상세 |
| `occurred_at` | 시각 |

## 정합성 감사

매일 새벽 일배치가 다음을 검증합니다:

```
∑ stock_movement.delta WHERE product_id = X  =  stock.total WHERE product_id = X
```

차이가 발견된 상품은 알림이 발생하며, 운영팀이 사유를 추적합니다. 일반적인 차이 원인:

- 동시 트랜잭션 중 한쪽 실패 (rollback이 movement에서 누락된 경우)
- 수동 DB 조작 (긴급 보정 시)
- 마이그레이션 잔여물

차이가 자동으로 보정되지는 않습니다. 사람이 사유를 확인하고 `adjustment` 사유로 명시적 보정합니다.

## 셀러 이력 조회

`GET /stocks/{product_id}/movements?from=&to=`로 특정 상품의 이력을 조회합니다. 셀러는 자기 상품에 한해 모든 사유의 이력을 볼 수 있습니다(점유·확정 포함). 정산 정합성 확인이나 분쟁 시 증빙으로 사용됩니다.

## 의사결정 배경

- **왜 모든 변동을 movement에 기록하는가**: 정합성 점검의 기준이 필요하고, 셀러 정산과 회계 감사에서 "어디로 사라졌는지"를 추적해야 합니다. 점유(reservation)나 확정(fulfillment)을 별도 테이블에 두면 누락 위험이 커집니다. 모든 변동을 한 곳에 누적합니다.
- **왜 자동 보정을 하지 않는가**: 차이의 원인은 보통 시스템 버그입니다. 자동 보정하면 버그가 가려져 재발합니다. 사람이 사유를 확인하고 명시적 보정을 남기는 게 운영 안전성 측면에서 유리합니다.
- **왜 폐기와 조정을 분리하는가**: 회계상 손실(폐기)과 단순 시스템 차이(조정)는 다른 처리가 필요합니다. 사유 코드를 분리해야 재무 보고서 작성 시 자동 분류가 가능합니다.

## 관련 entity

`stock-replenishment`, `stock-movement`, `stock` — `ontology/abox/commerce-inventory.yaml` 참조
