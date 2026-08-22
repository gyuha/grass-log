const ENDPOINT = 'https://api.github.com/graphql';

const DAY_QUERY = `
query($from: DateTime!, $to: DateTime!) {
  viewer {
    id
    contributionsCollection(from: $from, to: $to) {
      commitContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner }
        contributions { totalCount }
      }
      pullRequestContributions(first: 100) {
        nodes { occurredAt pullRequest { number title url state repository { nameWithOwner } } }
      }
      issueContributions(first: 100) {
        nodes { occurredAt issue { number title url repository { nameWithOwner } } }
      }
      pullRequestReviewContributions(first: 100) {
        nodes { occurredAt pullRequest { number title url repository { nameWithOwner } } }
      }
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}`;

const HISTORY_QUERY = `
query($owner: String!, $name: String!, $since: GitTimestamp!, $until: GitTimestamp!, $author: ID!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef {
      target {
        ... on Commit {
          history(since: $since, until: $until, author: {id: $author}, first: 100) {
            nodes { messageHeadline committedDate }
          }
        }
      }
    }
  }
}`;

async function graphql(token, query, variables) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'grass-log',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const payload = await res.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join('; '));
  }
  return payload.data;
}

/** UTC ISO 타임스탬프 → Asia/Seoul 기준 HH:MM. */
function kstTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 하루치 GitHub 활동을 수집해 renderLog 가 받는 형태로 정규화한다.
 *
 * 하루의 경계는 GitHub 프로필 타임존에 위임한다 (ADR 260822-093205).
 * contributionsCollection 은 from/to 의 시각 성분을 무시하고 계정 타임존 기준
 * 하루로 버킷팅하므로, 여기서 클라이언트 측 재필터링을 하지 않는다.
 * 커밋 히스토리 쪽은 오프셋을 지키므로 두 소스가 어긋날 수 있고,
 * 그 불일치는 렌더링 단계에서 명시 기록된다.
 */
export async function fetchDay(token, date) {
  const data = await graphql(token, DAY_QUERY, {
    from: `${date}T00:00:00+09:00`,
    to: `${date}T23:59:59+09:00`,
  });

  const viewerId = data.viewer.id;
  const cc = data.viewer.contributionsCollection;

  const day = cc.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .find((d) => d.date === date);
  const graphCount = day ? day.contributionCount : 0;

  const repos = [];
  for (const entry of cc.commitContributionsByRepository) {
    const [owner, name] = entry.repository.nameWithOwner.split('/');
    const repoData = await graphql(token, HISTORY_QUERY, {
      owner,
      name,
      since: `${date}T00:00:00+09:00`,
      until: `${date}T23:59:59+09:00`,
      author: viewerId,
    });
    const nodes = repoData.repository?.defaultBranchRef?.target?.history?.nodes ?? [];
    repos.push({
      name: entry.repository.nameWithOwner,
      graphCommits: entry.contributions.totalCount,
      commits: nodes.map((n) => ({ message: n.messageHeadline, time: kstTime(n.committedDate) })),
    });
  }

  const prs = cc.pullRequestContributions.nodes.map((n) => ({
    time: kstTime(n.occurredAt),
    number: n.pullRequest.number,
    title: n.pullRequest.title,
    url: n.pullRequest.url,
    repo: n.pullRequest.repository.nameWithOwner,
    state: n.pullRequest.state,
  }));
  const issues = cc.issueContributions.nodes.map((n) => ({
    time: kstTime(n.occurredAt),
    number: n.issue.number,
    title: n.issue.title,
    url: n.issue.url,
    repo: n.issue.repository.nameWithOwner,
  }));
  const reviews = cc.pullRequestReviewContributions.nodes.map((n) => ({
    time: kstTime(n.occurredAt),
    number: n.pullRequest.number,
    title: n.pullRequest.title,
    url: n.pullRequest.url,
    repo: n.pullRequest.repository.nameWithOwner,
  }));

  const empty =
    repos.length === 0 && prs.length === 0 && issues.length === 0 && reviews.length === 0;

  return {
    date,
    status: empty ? 'empty' : 'active',
    graphCount,
    error: null,
    repos,
    prs,
    issues,
    reviews,
  };
}
