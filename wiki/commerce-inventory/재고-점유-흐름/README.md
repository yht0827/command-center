# 재고 점유 흐름

> 작성일: 2026-05-13 | 수정일: 2026-05-13 | 유형: 정책 | 관련 레포: example-inventory-api, example-inventory-worker

## 개요

주문이 들어왔을 때 재고를 잠시 잡아두는 "점유"부터, 결제 완료 시 영구 차감하는 "확정", TTL 만료나 환불로 되돌리는 "복원"까지의 라이프사이클을 정의합니다. 점유와 확정을 분리해 결제 실패·미완료 시 재고가 묶이지 않게 하는 것이 핵심입니다.

## 왜 2단계인가

만약 주문 시 바로 차감하면:
- 결제가 실패하면 차감된 재고가 영원히 묶임 (수동 복구 필요)
- 사용자가 결제 페이지에서 외출하면 다른 사용자가 그 재고를 사지 못함

만약 결제 완료 후 차감하면:
- 결제 직전에 다른 사용자가 같은 재고를 사면 결제 후 재고 없음 발생 (오버셀)

**점유(reserve) + 확정(commit)**의 2단계가 두 문제를 모두 해결합니다.

## 점유 절차

`stock-reservation` 프로세스가 처리합니다:

1. `POST /stocks/reserve { order_id, product_id, quantity }` 수신
2. Redis 분산 락 획득: `lock:stock:{product_id}` (acquire timeout: 100ms)
3. MySQL에서 `stock` 조회
4. `stock.available >= quantity` 검증, 부족하면 `INSUFFICIENT_STOCK` 반환
5. Redis에 `stock-reservation-record` 생성: `key=reserve:{order_id}:{product_id}`, TTL 15분, value: `{quantity, created_at}`
6. MySQL `stock.reserved += quantity` 트랜잭션
7. Redis 분산 락 해제

같은 트랜잭션 내에서 Redis와 MySQL을 모두 갱신하는 게 아니라, Redis 키는 따로 쓰입니다. MySQL이 진실의 원천이며 Redis는 (1) 분산 락, (2) TTL 자동 회수 용도로만 사용합니다.

## 확정 절차

`stock-fulfillment` 컨슈머가 처리합니다:

1. `commerce.order.paid` 이벤트 수신 (cross-domain.yaml 참조)
2. event_id로 중복 처리 체크 (idempotency, Redis `processed:{event_id}` 키)
3. Redis에서 `reserve:{order_id}:{product_id}` 조회
4. `stock-reservation-record` 존재하지 않으면 (TTL 만료) 경고 로그, 재고 재점유 시도
5. 트랜잭션 내에서:
   - `stock.total -= quantity` (영구 차감)
   - `stock.reserved -= quantity` (점유 해제)
   - `stock-movement` 기록 (사유: `fulfillment`)
6. Redis에서 `reserve:{order_id}:{product_id}` 삭제
7. 잔여 `stock.available < 임계값`이면 `low-stock-alert` 트리거

## TTL 만료 처리

15분 TTL이 만료되면 Redis가 자동으로 키를 삭제합니다. 하지만 그것만으로는 MySQL의 `stock.reserved`가 복원되지 않습니다. 두 가지 방식:

**옵션 A: Redis Keyspace Notification 구독**
- Redis가 만료 이벤트를 발행 → 별도 워커가 수신 → MySQL 복원
- 단점: Redis 설정이 필요하고 노티 손실 가능성

**옵션 B: 다음 reservation 시 lazy 보정 (현재 채택)**
- 새 점유 시도 시 `stock-reservation-record` 일치 여부 검증
- 만료된 키가 있던 자리는 MySQL의 reserved 값 보정

옵션 B는 단순하지만 트래픽이 적은 상품의 재고가 오래 묶일 수 있어, 5분 주기 정합성 배치를 추가로 운영합니다.

## 환불 시 복원

`commerce.order.refunded` 이벤트 수신:

1. event_id로 중복 처리 체크
2. 환불 정보(상품, 수량) 추출
3. 트랜잭션 내에서:
   - `stock.total += quantity` (복원)
   - `stock-movement` 기록 (사유: `refund`)
4. 임계값 이상 복귀 시 저재고 알림 해제 이벤트 발행

이 경로는 점유→확정과 달리 `stock-reservation-record`를 거치지 않습니다. 이미 확정된 재고를 직접 복원하기 때문입니다.

## 동시성 시나리오

| 시나리오 | 처리 |
|----------|------|
| 두 사용자가 마지막 1개를 동시에 점유 시도 | 분산 락이 직렬화. 한 명 성공, 다른 한 명 `INSUFFICIENT_STOCK` |
| 점유 후 결제 중 다른 사용자가 점유 시도 | 점유된 재고는 `available`에서 제외되어 두 번째 시도는 거부 |
| 결제 완료 직후 환불 요청 | 이벤트 처리 순서: paid → refunded. event_id 기반 idempotency가 중복 처리 방지 |

## 의사결정 배경

- **왜 점유에 동기 RPC를 쓰는가**: 점유 실패는 주문을 막아야 하는 결정적 신호입니다. Kafka 같은 비동기 채널로 보내면 주문은 일단 생성되고 사후에 실패가 통지되어, 사용자 경험이 망가집니다.
- **왜 확정은 비동기 이벤트로 받는가**: 결제 처리에는 PG 응답 시간(수초 ~ 수십초)이 포함됩니다. 결제 완료를 동기로 기다리면 주문 도메인이 재고 도메인을 직접 호출하면서 응답 지연이 누적됩니다. 이벤트로 분리해 두 도메인이 독립적으로 진행됩니다.
- **왜 15분 TTL인가**: 평균 결제 완료 시간(p95) 3분 + 사용자 망설임·재시도 여유 12분. 짧으면 정상 결제 중 만료, 길면 인기 상품 재고가 오래 묶입니다.
- **왜 Redis와 MySQL을 분리하는가**: MySQL은 정합성의 원천이라야 합니다. Redis는 휘발성이라 단독으로는 신뢰할 수 없습니다. Redis는 (1) 빠른 분산 락, (2) TTL 자동 회수 보조 용도로만 쓰고, 모든 영구 상태는 MySQL에 기록합니다.

## 관련 entity

`stock-reservation`, `stock-fulfillment`, `stock`, `stock-reservation-record` — `ontology/abox/commerce-inventory.yaml` 참조
