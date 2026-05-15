# Design Reference 참조 문서

designer 에이전트가 참조하는 디자인 시스템 및 제품 원칙 문서.

---

## Design System 개요

디자인 시스템으로, 제품을 구성하는 공통의 디자인 언어이자 개발자의 도구.

### Principle

- 디자인시스템은 공유된 디자인 언어이며 하나의 목소리로 말하려는 의지이고 노력이다.
- 기본적으로 **간단**하고 **유연**해야 한다.
- 재사용이 용이하다.
- 대다수의 제품 문제를 해결할 수 있게 한다.
- 디자인 시스템의 사용을 지향하지만, 더 나은 경험이 필요한 경우 커스텀 UI를 가질 수 있게 한다.
- 컴포넌트는 재사용 가능하도록 설계하며 서로 디펜던시 영향을 받지 않도록 한다.
- 사일로/프로덕트 간 디자인 미스 커뮤니케이션을 최소화한다.

### Goal

- 재사용 가능하고 아름다운 Design System으로 UI 개발 효율화와 질적 향상
- 제품의 Minimum quality를 높이면서 일관된 UI 유지
- 빠른 Iteration, 생산성 향상, 문제 해결에 집중
- Interaction/Animation/Illustration로 정성적 완성도를 Industry Leader급으로

---

## 디자인시스템 구조 (용어 체계)

### Foundation
가장 기본적이고 추상적인 시각 요소의 단위. 컬러, 타이포그래피, 여백, 그림자, 아이콘 등.
- **Design Token**: Foundation 요소들을 코드로 관리하는 변수 (예: blue-500, text-primary)
- **Theme**: 색상, 타이포 등 모든 디자인 토큰을 변경할 수 있는 스타일 세트. Light/Dark 모드, 고대비, Device Type 등.

### Component
하나 이상의 기능을 수행하며, 재사용 가능한 최소 UI 단위.
- 고유한 의미와 목적, 독립적으로 사용 가능
- 예: Button, Input Field, Checkbox, Tab, Toast
- **Property**: 컴포넌트의 동작이나 스타일을 제어하는 속성 (Variant, Size, State, Disabled, Color)
- **Value**: Property에 할당되는 구체적인 값 (Primary, Secondary, Tertiary)

### Module
둘 이상의 컴포넌트가 결합되어 반복적으로 재사용 가능한 UI 블록.
- 예: Card List, Profile Summary, Transaction List

### Page
특정 목적/기능 중심으로 컴포넌트가 배치된 단일 화면.
- 사용자가 명확한 Task를 수행할 수 있도록 설계

### Flow
두 개 이상의 Page가 순차적으로 연결된 사용 흐름.
- 명확한 시작과 끝, 달성해야 하는 목표(Outcome)

---

## Product Principle (PP)

제품의 성공 전략을 담고 있는 제품 원칙. 'Simplicity'가 core principle.

> 단순함이란, 사용자가 제품을 사용하기 위해 특별히 '알아야 할 것', '배워야 할 것'이 없으며, 본능적으로 이해할 수 있음을 의미한다.

### Product Strategy (9개 원칙)

1. **Casual Concept** — 어려운 금융 개념을 친숙하고 이해하기 쉽게 만들었는가?
2. **Simple Policy** — 고객이 사용을 위해 '알아야 할' 것을 없앨 수 있는가?
3. **Value First** — 무엇이 좋은지도 모르는데 과업을 완료하게끔 요구하지는 않는가?
4. **Clear Action** — 과업을 완료하기 위한 액션이 명확하게 드러나는가? (글을 읽지 않고도 다음 액션 가능)
5. **Context Based** — 사용자의 앞뒤 맥락을 고려했는가? (맥락이 끊기면 이탈)
6. **Easy to Answer** — 모든 질문에 3초 안에 대답할 수 있는가? (추천 제공, 어려운 질문 1개보다 쉬운 질문 3개)
7. **Explain Why** — 왜 이 과업을 완료해야 하는지 충분히 설명했는가?
8. **One thing** — 화면에 하나의 명확한 목표가 잘 드러나는가? (더 줄일 수 있을 때까지 정리)
9. **No more Loading** — 사용자의 기다림을 완전히 없앴는가?
10. **Minimum Features** — 이 기능 없이는 절대 목표를 달성할 수 없나? (기능은 가치가 아니라 비용)

**윤리 원칙**: 다크패턴 금지. 사용자의 인지 오류를 의도적으로 유도하지 않는다.

---

## 디자인 품질 레벨 (Aesthetic Ability)

```
Lv1. TDS를 적절히 사용하며 이를 준수하기 위해 노력한다.
Lv2. TDS를 적절히 사용하며, 불필요하게 TDS를 어긴 디자인을 하지 않는다.
Lv3. TDS를 넘어서지만 여전히 TDS와 조화롭고 아름다운 디자인으로 문제 해결을 할 수 있다.
Lv4. 업계의 레퍼런스가 되는 디자인으로 TDS를 만든다.
```

designer 에이전트는 **Lv2~Lv3** 수준을 목표로 한다:
- TDS를 기본으로 준수하되, 더 나은 경험이 필요할 때는 TDS와 조화롭게 확장

