const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** YYYY-MM-DD → 한글 요일. 타임존 영향을 받지 않도록 UTC 자정으로 고정해 계산한다. */
function weekday(date) {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

/**
 * 임의의 문자열을 인라인 코드로 감싼다. 내용에 백틱이 있으면 그보다 하나 긴
 * 백틱 펜스를 쓰고 양쪽에 공백을 넣는다 (CommonMark 인라인 코드 규칙).
 */
function code(text) {
  const longest = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  if (longest === 0) return `\`${text}\``;
  const fence = '`'.repeat(longest + 1);
  return `${fence} ${text} ${fence}`;
}

/** 마크다운 링크 텍스트에서 대괄호를 이스케이프한다. */
function linkText(text) {
  return text.replace(/([[\]])/g, '\\$1');
}

function frontmatter(fields) {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v === null ? 'null' : v}`);
  return ['---', ...lines, '---'].join('\n');
}

function itemLine({ time, number, title, url, repo, state }) {
  const suffix = state ? ` — ${state} · ${repo}` : ` — ${repo}`;
  return `- ${time} [#${number} ${linkText(title)}](${url})${suffix}`;
}

/**
 * 정규화된 하루 데이터를 로그 파일 본문(프론트매터 + 마크다운)으로 렌더링한다.
 * 네트워크를 타지 않는 순수 함수다.
 */
export function renderLog(day) {
  const { date, status, graphCount, error, repos, prs, issues, reviews } = day;

  const listed = repos.reduce((sum, r) => sum + r.commits.length, 0);
  const graphCommits = repos.reduce((sum, r) => sum + r.graphCommits, 0);

  const head = frontmatter({
    date,
    status,
    commits: listed,
    repos: repos.length,
    prs: prs.length,
    issues: issues.length,
    reviews: reviews.length,
    graph_count: graphCount,
  });

  const title = `# ${date} (${weekday(date)})`;

  if (status === 'error') {
    return `${head}\n\n${title}\n\n수집 실패: ${error}\n`;
  }
  if (status === 'empty') {
    const note =
      graphCount > 0
        ? `\n\n⚠ 불일치: 그래프 카운트는 ${graphCount}인데 목록화된 활동이 없다 — 목록에 잡힐 수 없는 기여 종류이거나 조회 권한 밖의 리포일 수 있다.`
        : '';
    return `${head}\n\n${title}\n\nGitHub 활동 없음.${note}\n`;
  }

  const body = [head, '', title, '', '## 요약'];
  body.push(
    [
      `커밋 ${listed}건`,
      `리포 ${repos.length}곳`,
      `PR ${prs.length}건`,
      `이슈 ${issues.length}건`,
      `리뷰 ${reviews.length}건`,
      `그래프 카운트 ${graphCount === null ? 'null' : graphCount}`,
    ].join(' · '),
  );

  if (graphCommits !== listed) {
    body.push(
      '',
      `⚠ 불일치: 그래프 기준 커밋 ${graphCommits}건 중 ${listed}건만 목록화됨 — default branch 외 커밋이거나 하루 경계 추론 오류일 수 있다.`,
    );
  }

  if (repos.length > 0) {
    body.push('', '## 커밋');
    for (const repo of repos) {
      const count =
        repo.graphCommits === repo.commits.length
          ? `${repo.commits.length}`
          : `목록 ${repo.commits.length} · 그래프 기준 ${repo.graphCommits}`;
      body.push('', `### ${repo.name} (${count})`);
      for (const commit of repo.commits) {
        body.push(`- ${commit.time} ${code(commit.message)}`);
      }
    }
  }

  const sections = [
    ['## Pull Requests', prs],
    ['## Issues', issues],
    ['## Reviews', reviews],
  ];
  for (const [heading, items] of sections) {
    if (items.length === 0) continue;
    body.push('', heading);
    for (const item of items) body.push(itemLine(item));
  }

  return `${body.join('\n')}\n`;
}
