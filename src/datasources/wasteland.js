// DoltHub public API — no auth required
// hop/wl-commons is the shared wasteland database
// DoltHub sends Access-Control-Allow-Origin echoing the request Origin,
// so direct browser calls work fine — no proxy needed.

const BASE = 'https://www.dolthub.com/api/v1alpha1/hop/wl-commons/main';

async function query(sql) {
  const url = `${BASE}?q=${encodeURIComponent(sql)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DoltHub ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.rows ?? [];
}

export async function fetchWanted() {
  return query(`
    SELECT id, title, project, type, status, effort_level, posted_by, claimed_by
    FROM wanted
    WHERE status IN ('open', 'claimed')
    ORDER BY status DESC, effort_level DESC
    LIMIT 60
  `);
}

export async function fetchRigs() {
  return query(`
    SELECT handle, display_name, rig_type, trust_level, gt_version, last_seen
    FROM rigs
    ORDER BY last_seen DESC
    LIMIT 40
  `);
}

export async function fetchCompletions() {
  return query(`SELECT COUNT(*) AS total FROM completions`);
}

// Poll wasteland and call onUpdate(data) whenever fresh data arrives.
// Returns a stop() function.
export function startPolling(onUpdate, intervalMs = 30000) {
  let stopped = false;

  async function poll() {
    if (stopped) return;
    try {
      const [wanted, rigs, completions] = await Promise.all([
        fetchWanted(),
        fetchRigs(),
        fetchCompletions(),
      ]);
      const total = completions[0]?.total ?? 0;
      onUpdate({ wanted, rigs, completions: Number(total), ts: Date.now() });
    } catch (err) {
      console.warn('[wasteland] fetch failed:', err.message);
    }
    if (!stopped) setTimeout(poll, intervalMs);
  }

  poll(); // immediate first fetch
  return () => { stopped = true; };
}
