# Command Center

<!-- deployed-url:start -->
🌐 **Live demo**: https://hubtwork.github.io/command-center/
<!-- deployed-url:end -->

AI 기반 공용 작업 공간입니다. 팀의 도메인 지식(코드 위치·비즈니스 정책·데이터 흐름)을 ontology와 wiki로 관리하고, GitHub Pages에 자동 배포되는 사이트로 시각화합니다. PO·디자이너·FE·BE 누구든 같은 방식으로 작업합니다.

---

## 🚀 이 템플릿으로 시작하기

GitHub의 **"Use this template"** 버튼을 누르면 빈 워크스페이스가 만들어집니다. 아래 순서대로 활성화하세요.

### Step 1. 템플릿 복제

1. 이 페이지 우측 상단의 **"Use this template" → "Create a new repository"** 클릭
2. 우리 팀 계정/조직에 새 레포 생성 (이름·공개 범위 선택)

> Template 복제는 **파일만** 가져갑니다. Settings(Pages, Actions 권한 등)는 복제되지 않으므로 아래 Step 2를 직접 적용해야 합니다.

### Step 2. GitHub 활성화 (필수 3종)

#### ① Pages 활성화
- Settings → Pages → Source: **GitHub Actions** 선택

#### ② Workflow permissions
Settings → Actions → General → Workflow permissions:
- **"Read and write permissions"** 선택
- **"Allow GitHub Actions to create and approve pull requests"** 체크

> 두 옵션 모두 켜져야 (a) 사이트 자동 배포, (b) README 상단의 **데모 URL 자동 갱신 PR** 흐름이 동작합니다.
>
> **GHE 환경 주의**: "Allow Actions to create/approve PRs"는 admin 정책으로 막혀 있을 수 있습니다. 막혀 있으면 데모 URL 자동 갱신은 동작하지 않으니, README 상단 `<!-- deployed-url:start -->` 마커 사이를 수동으로 채우거나 admin에게 활성화를 요청하세요. 사이트 배포 자체는 정상 동작합니다.
🌐 **Live demo**: https://hubtwork.github.io/command-center/
