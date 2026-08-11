// GitHub live datasource — replaces the dormant DoltHub wasteland.
//
// The wl-commons database stopped taking writes on 2026-05-05, so the map was
// rendering a three-month-old snapshot. The wasteland was itself a mirror of
// GitHub (its bead IDs were literally `w-gh-gascity-1672`), so this reads the
// upstream directly.
//
// Emits the same row shapes the old wasteland.js did, so mapper.js and the
// whole sim are unchanged:
//   wanted      → { id, title, project, type, status, effort_level, posted_by, claimed_by }
//   rigs        → { handle, display_name, rig_type, trust_level, gt_version, last_seen }
//   completions → integer
//
// api.github.com sends Access-Control-Allow-Origin: * for public data, so this
// still works from a static page with no proxy and no token.

const REPOS = [
  'gastownhall/gastown',
  'gastownhall/gascity',
  'gastownhall/beads',
];

const SEARCH = 'https://api.github.com/search/issues';
const REPO_SCOPE = REPOS.map(r => `repo:${r}`).join(' ');

// Unauthenticated search is 10 req/min per IP. We spend 3 per poll, so a 60s
// interval leaves room for a couple of tabs open on the same connection.
// Anything faster starts eating 403s.
const POLL_MS = 60_000;

const MAX_ISSUE_BEADS = 36;
const MAX_PR_BEADS = 24;   // each becomes a claimed bead → one agent polecat
const MAX_RIGS = 14;

async function search(q, { perPage = 1, sort = 'updated' } = {}) {
  const url = `${SEARCH}?q=${encodeURIComponent(q)}&sort=${sort}&order=desc&per_page=${perPage}`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });

  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
    const err = new Error('rate limited');
    err.rateLimited = true;
    err.retryAfter = Number.isFinite(reset) ? Math.max(0, reset - Date.now()) : 60_000;
    throw err;
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${res.statusText}`);

  const data = await res.json();
  return { items: data.items ?? [], total: data.total_count ?? 0 };
}

function repoOf(item) {
  return (item.repository_url ?? '').split('/').pop() || 'unknown';
}

// Three tiers, most authoritative first:
//   1. an explicit kind/* label (only ~half of items carry any label)
//   2. a conventional-commit prefix, which most PR titles here follow
//      (`fix(gc): …`, `feat(mail): …`)
//   3. the population base rate for that item kind
// Tier 3 matters: of open issues that ARE labelled, bugs outnumber features
// 312 to 123, and the unlabelled ones read as defect reports too — so an
// untyped issue is a bug, while an untyped PR is a change.
const PREFIX_TYPE = {
  fix: 'bug', bugfix: 'bug', hotfix: 'bug', bug: 'bug', perf: 'bug',
  feat: 'feature', feature: 'feature',
  refactor: 'feature', chore: 'feature', build: 'feature',
  ci: 'feature', test: 'feature',
  docs: 'docs', doc: 'docs',
  design: 'design', rfc: 'design', proposal: 'design',
};

function beadType(item, kind) {
  const labels = (item.labels ?? []).map(l => (l.name ?? '').toLowerCase());
  if (labels.some(l => l === 'kind/bug' || l === 'bug')) return 'bug';
  if (labels.some(l => l === 'kind/feature' || l === 'enhancement')) return 'feature';
  if (labels.some(l => l === 'kind/docs' || l === 'documentation')) return 'docs';
  if (labels.some(l => l === 'kind/design')) return 'design';

  const prefix = (item.title ?? '').toLowerCase().match(/^([a-z]+)[(:]/);
  if (prefix && PREFIX_TYPE[prefix[1]]) return PREFIX_TYPE[prefix[1]];

  return kind === 'issue' ? 'bug' : 'feature';
}

// No story points in these repos, so effort is a proxy: priority label first,
// then discussion volume. Drives gem size and mining capacity only.
function effortLevel(item) {
  const labels = (item.labels ?? []).map(l => (l.name ?? '').toLowerCase());
  if (labels.some(l => l === 'priority/p0' || l === 'priority/p1')) return 'large';
  const comments = item.comments ?? 0;
  if (comments >= 4) return 'large';
  if (comments >= 1) return 'medium';
  return 'small';
}

// Open issue → unclaimed bead. IDs must not use the `bd-` prefix, which the
// sim reserves for its own seeded beads.
function issueToWanted(item) {
  return {
    id: `gh-${repoOf(item)}-${item.number}`,
    title: item.title,
    project: repoOf(item),
    type: beadType(item, 'issue'),
    status: 'open',
    effort_level: effortLevel(item),
    posted_by: item.user?.login ?? null,
    claimed_by: null,
  };
}

// Open PR → claimed bead. The PR author is the agent actually working it,
// which is what reconcileAgents turns into a polecat on the map.
function prToWanted(item) {
  return {
    id: `pr-${repoOf(item)}-${item.number}`,
    title: item.title,
    project: repoOf(item),
    type: beadType(item, 'pr'),
    status: 'claimed',
    effort_level: effortLevel(item),
    posted_by: item.user?.login ?? null,
    claimed_by: item.user?.login ?? null,
  };
}

// Rigs were gastown instances people run. The live analog with no extra API
// spend is the set of people with open PRs right now — last_seen is their most
// recent PR touch, which makes mapper's 7-day staleness filter meaningful again.
function prsToRigs(prItems) {
  const byAuthor = new Map();
  for (const item of prItems) {
    const handle = item.user?.login;
    if (!handle) continue;
    const seen = item.updated_at;
    const existing = byAuthor.get(handle);
    if (!existing) {
      byAuthor.set(handle, { handle, count: 1, last_seen: seen });
    } else {
      existing.count += 1;
      if (seen > existing.last_seen) existing.last_seen = seen;
    }
  }

  return [...byAuthor.values()]
    .sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1))
    .slice(0, MAX_RIGS)
    .map(r => ({
      handle: r.handle,
      display_name: r.handle,
      rig_type: 'github',
      trust_level: Math.min(3, r.count),
      gt_version: null,
      last_seen: r.last_seen,
    }));
}

export async function fetchSnapshot() {
  const [issues, prs, merged] = await Promise.all([
    search(`is:issue is:open ${REPO_SCOPE}`, { perPage: MAX_ISSUE_BEADS }),
    search(`is:pr is:open ${REPO_SCOPE}`, { perPage: MAX_PR_BEADS }),
    search(`is:pr is:merged ${REPO_SCOPE}`, { perPage: 1 }),
  ]);

  return {
    wanted: [...prs.items.map(prToWanted), ...issues.items.map(issueToWanted)],
    rigs: prsToRigs(prs.items),
    completions: merged.total,
    ts: Date.now(),
  };
}

// Poll GitHub and call onUpdate(data) whenever fresh data arrives.
// Returns a stop() function.
export function startPolling(onUpdate, intervalMs = POLL_MS) {
  let stopped = false;
  let failures = 0;

  async function poll() {
    if (stopped) return;
    let wait = intervalMs;

    try {
      onUpdate(await fetchSnapshot());
      failures = 0;
    } catch (err) {
      failures += 1;
      if (err.rateLimited) {
        // Wait out the window GitHub told us about rather than hammering it.
        wait = Math.max(intervalMs, err.retryAfter + 1000);
        console.warn(`[github] rate limited, backing off ${Math.round(wait / 1000)}s`);
      } else {
        wait = Math.min(intervalMs * 2 ** failures, 10 * 60_000);
        console.warn(`[github] fetch failed (${err.message}), retrying in ${Math.round(wait / 1000)}s`);
      }
    }

    if (!stopped) setTimeout(poll, wait);
  }

  poll(); // immediate first fetch
  return () => { stopped = true; };
}
