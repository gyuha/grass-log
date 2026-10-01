# grass-log

매일 자동으로 내 GitHub 활동을 수집해 하루치 로그 파일로 남긴다. 잔디(기여 그래프)가 유지되는 것은 그 부수 효과다.

활동이 없는 날에도, 수집이 실패한 날에도 같은 경로에 같은 형식의 파일이 생성된다 — 로그가 비어 있다는 사실 자체가 기록이다.

## 동작

```
KST 01:00 (cron '0 16 * * *') — 전날 로그를 기록
   → GitHub GraphQL 로 그날 활동 수집
   → logs/YYYY/MM/YYYY-MM-DD.md 생성
   → 변경이 있으면 커밋 & 푸시
        ↓ 수집 실패
   실패 사실을 담은 파일을 커밋한 뒤 워크플로를 실패로 종료 (알림 이메일 발생)
```

`contributionsCollection` 으로 그날 활동한 리포 목록·개수·PR·이슈·리뷰와 그래프 카운트를 얻고, 리포별 default branch 히스토리에서 커밋 메시지를 가져온다. 두 소스의 커밋 수가 어긋나면 로그 본문에 **불일치**로 명시 기록한다 — default branch 외 커밋이거나 하루 경계 추론이 틀렸다는 신호다.

하루의 경계는 GitHub 프로필 타임존에 위임한다. 근거와 트레이드오프는 `.forge/adr/260822-093205-day-boundary-delegated-to-github-profile-timezone.md`.

## 파일 레이아웃

```
logs/2026/08/2026-08-22.md
```

각 파일은 기계가 읽을 수 있는 YAML 프론트매터로 시작한다:

```yaml
---
date: 2026-08-21
status: active      # active | empty | error
commits: 8
repos: 3
prs: 1
issues: 0
reviews: 0
graph_count: 9     # 잔디 그래프에 실제로 표시되는 그날의 기여 수
---
```

## 설치

### 1. Personal Access Token 발급

기본 `GITHUB_TOKEN` 은 이 리포에만 스코프가 있어 다른 리포의 활동을 볼 수 없다. classic PAT 가 필요하다.

1. https://github.com/settings/tokens → **Generate new token (classic)**
2. 스코프 두 개를 체크: **`repo`** (비공개 리포 활동 조회), **`read:user`** (프로필·기여 조회)
3. 만료일을 설정한 경우 갱신을 잊으면 조용히 실패한다 — 실패 시 워크플로가 실패로 끝나므로 이메일 알림이 온다

### 2. 시크릿 등록

```sh
gh secret set GRASS_LOG_TOKEN --repo gyuha/grass-log
```

### 3. 잔디가 심기는 전제 확인

- 이 리포가 private 이면, GitHub 프로필 → 기여 그래프 우상단 **···** → **Private contributions** 표시가 켜져 있어야 커밋이 잔디에 카운트된다.
- 워크플로는 커밋 author 를 `신규하 <nicegyuha@gmail.com>` 으로 명시 설정한다. 이걸 빼면 `github-actions[bot]` 으로 커밋되어 기여로 카운트되지 않는다.

## 로컬 실행

```sh
# 특정 날짜를 표준출력으로 (파일을 쓰지 않음)
GH_TOKEN=$(gh auth token) node scripts/build-log.mjs --date 2026-08-21 --stdout

# 파일로 기록 (--date 생략 시 Asia/Seoul 기준 어제)
GH_TOKEN=$(gh auth token) node scripts/build-log.mjs --date 2026-08-21
```

의존성은 없다. Node 20+ 의 내장 `fetch` 만 쓴다.

## 테스트

```sh
node --test
```

렌더링 순수 함수(`src/render.mjs`)만 테스트한다 — 네트워크 호출과 워크플로 YAML 은 대상이 아니다.

> `node --test test/` 처럼 디렉터리를 인자로 넘기면 Node 24 는 그걸 엔트리포인트로 해석해 `Cannot find module` 로 죽는다. 인자 없이 `node --test` (자동 탐색) 또는 파일 경로를 직접 넘길 것.

## 수동 실행

```sh
gh workflow run daily-log.yml --repo gyuha/grass-log
```

Actions 의 `schedule` 트리거는 정시에 오지 않는다 — 부하가 높으면 수십 분 지연되고 아예 스킵될 수도 있다. 그래서 하루가 끝난 뒤 KST 01:00 에 전날을 기록하며, 어느 날이든 지연돼도 같은 날짜를 기록한다. 구멍이 난 날은 위 명령으로 메꾼다.
