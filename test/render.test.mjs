import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderLog } from '../src/render.mjs';

const base = {
  date: '2026-08-21',
  status: 'active',
  graphCount: 12,
  error: null,
  repos: [],
  prs: [],
  issues: [],
  reviews: [],
};

test('정상 활동: 프론트매터·요약·리포 섹션·커밋 줄을 렌더링한다', () => {
  const out = renderLog({
    ...base,
    repos: [
      {
        name: 'gyuha/forge',
        graphCommits: 3,
        commits: [
          { message: 'chore(release): v0.6.11', time: '17:42' },
          { message: 'feat(fg-ask): DoD 검증 규율 추가', time: '17:40' },
          { message: 'docs: fg-security 문서 정합 수리', time: '17:40' },
        ],
      },
      {
        name: 'gyuha/bongtoo',
        graphCommits: 2,
        commits: [
          { message: 'fix: 정산 반올림 오차', time: '11:03' },
          { message: 'test: 정산 경계값', time: '10:58' },
        ],
      },
    ],
    prs: [
      { number: 14, title: '5행 72키 배열로 전환', url: 'https://github.com/gyuha/my-keyboard/pull/14', repo: 'gyuha/my-keyboard', state: 'MERGED', time: '23:29' },
    ],
  });

  assert.match(out, /^---\n/);
  assert.match(out, /^date: 2026-08-21$/m);
  assert.match(out, /^status: active$/m);
  assert.match(out, /^commits: 5$/m);
  assert.match(out, /^repos: 2$/m);
  assert.match(out, /^prs: 1$/m);
  assert.match(out, /^issues: 0$/m);
  assert.match(out, /^reviews: 0$/m);
  assert.match(out, /^graph_count: 12$/m);

  assert.match(out, /^# 2026-08-21 \(금\)$/m);
  assert.match(out, /커밋 5건/);
  assert.match(out, /리포 2곳/);
  assert.match(out, /그래프 카운트 12/);

  assert.match(out, /^### gyuha\/forge \(3\)$/m);
  assert.match(out, /^- 17:42 `chore\(release\): v0\.6\.11`$/m);
  assert.match(out, /^### gyuha\/bongtoo \(2\)$/m);

  assert.match(out, /^## Pull Requests$/m);
  assert.match(out, /\[#14 5행 72키 배열로 전환\]\(https:\/\/github\.com\/gyuha\/my-keyboard\/pull\/14\)/);
  assert.match(out, /MERGED/);

  // 비어 있는 종류의 섹션은 만들지 않는다
  assert.doesNotMatch(out, /^## Issues$/m);
  assert.doesNotMatch(out, /^## Reviews$/m);
  assert.doesNotMatch(out, /불일치/);
});

test('활동 없음: status=empty 이고 본문이 활동 없음 한 줄이다', () => {
  const out = renderLog({ ...base, status: 'empty', graphCount: 0 });
  assert.match(out, /^status: empty$/m);
  assert.match(out, /^commits: 0$/m);
  assert.match(out, /^graph_count: 0$/m);
  assert.match(out, /^GitHub 활동 없음\.$/m);
  assert.doesNotMatch(out, /^## 커밋$/m);
});

test('수집 실패: status=error 이고 실패 사유를 본문에 남긴다', () => {
  const out = renderLog({ ...base, status: 'error', graphCount: null, error: 'HTTP 401: Bad credentials' });
  assert.match(out, /^status: error$/m);
  assert.match(out, /^graph_count: null$/m);
  assert.match(out, /^수집 실패: HTTP 401: Bad credentials$/m);
  assert.doesNotMatch(out, /GitHub 활동 없음/);
});

test('불일치: 그래프 기준 커밋 수와 목록화 개수가 다르면 명시 기록한다', () => {
  const out = renderLog({
    ...base,
    graphCount: 8,
    repos: [
      {
        name: 'gyuha/forge',
        graphCommits: 5,
        commits: [
          { message: 'a', time: '10:00' },
          { message: 'b', time: '10:01' },
          { message: 'c', time: '10:02' },
        ],
      },
    ],
  });
  assert.match(out, /불일치/);
  assert.match(out, /^### gyuha\/forge \(목록 3 · 그래프 기준 5\)$/m);
  // 프론트매터의 commits 는 목록화한 실제 개수다
  assert.match(out, /^commits: 3$/m);
});

test('이스케이프: 백틱 포함 커밋 메시지와 대괄호 포함 제목이 마크다운을 깨지 않는다', () => {
  const out = renderLog({
    ...base,
    repos: [
      {
        name: 'gyuha/forge',
        graphCommits: 2,
        commits: [
          { message: 'fix: `--dry-run` 플래그 처리', time: '09:00' },
          { message: 'docs: 백틱 두 개 ``x`` 설명', time: '09:01' },
        ],
      },
    ],
    issues: [
      { number: 7, title: '[BUG] 대괄호 [중첩] 제목', url: 'https://github.com/gyuha/forge/issues/7', repo: 'gyuha/forge', time: '08:00' },
    ],
  });

  // 백틱을 포함한 메시지는 더 긴 백틱 펜스로 감싸고 양쪽에 공백 패딩을 둔다
  assert.match(out, /^- 09:00 `` fix: `--dry-run` 플래그 처리 ``$/m);
  assert.match(out, /^- 09:01 ``` docs: 백틱 두 개 ``x`` 설명 ```$/m);
  // 링크 텍스트의 대괄호는 이스케이프한다
  assert.match(out, /\\\[BUG\\\] 대괄호 \\\[중첩\\\] 제목/);
});

test('활동 없음인데 그래프 카운트가 0이 아니면 불일치를 명시한다', () => {
  const out = renderLog({ ...base, status: 'empty', graphCount: 1 });
  assert.match(out, /^status: empty$/m);
  assert.match(out, /^graph_count: 1$/m);
  assert.match(out, /^GitHub 활동 없음\.$/m);
  assert.match(out, /불일치: 그래프 카운트는 1인데 목록화된 활동이 없다/);
});
