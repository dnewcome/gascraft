// Maps live wasteland data into simState entities.
// Preserves existing animation state for entities already in the sim.

// Deterministic grid position from a string ID — same ID always lands on same tile.
function hashPos(str, mapW = 22, mapH = 22, margin = 1) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  const x = margin + (h % (mapW - margin * 2));
  const y = margin + ((h >>> 11) % (mapH - margin * 2));
  return { gx: x, gy: y };
}

const EFFORT_VALUE = { small: 8, medium: 15, large: 30 };
const EFFORT_REMAINING = { small: 40, medium: 80, large: 150 };

export function applyWasteland(simState, { wanted, rigs, completions }) {
  applyRigs(simState, rigs);
  applyBeads(simState, wanted);
  simState.resources = completions;
  simState.liveData = true;
}

function applyRigs(simState, rigRows) {
  // Keep the player's own rig and refinery in place.
  // Add/update real wasteland rigs as outpost markers.
  const existingBuildings = new Map(simState.buildings.map(b => [b.id, b]));

  for (const row of rigRows) {
    const id = `wl-rig-${row.handle}`;
    if (existingBuildings.has(id)) {
      // Update label but leave position alone
      existingBuildings.get(id).label = row.display_name || row.handle;
      existingBuildings.get(id).lastSeen = row.last_seen;
      existingBuildings.get(id).handle = row.handle;
    } else {
      const pos = hashPos(row.handle);
      // Avoid clobbering the player's rig/refinery footprint
      if (pos.gx >= 8 && pos.gx <= 17 && pos.gy >= 8 && pos.gy <= 14) {
        pos.gx = (pos.gx + 7) % 22 + 1;
      }
      simState.buildings.push({
        id,
        type: 'outpost',
        gx: pos.gx,
        gy: pos.gy,
        width: 1,
        height: 1,
        label: row.display_name || row.handle,
        handle: row.handle,
        lastSeen: row.last_seen,
        trustLevel: row.trust_level ?? 0,
      });
    }
  }
}

function applyBeads(simState, wantedRows) {
  const existingBeads = new Map(simState.beads.map(b => [b.id, b]));
  const incomingIds = new Set();

  for (const row of wantedRows) {
    incomingIds.add(row.id);
    const effort = row.effort_level ?? 'medium';

    if (existingBeads.has(row.id)) {
      // Update mutable fields, leave position + animation state alone
      const b = existingBeads.get(row.id);
      b.depleted = false;
      b.label = row.title;
      b.project = row.project;
      b.beadType = row.type;
      b.claimedBy = row.claimed_by ?? null;
      b.isClaimed = row.status === 'claimed';
    } else {
      const pos = hashPos(row.id);
      simState.beads.push({
        id: row.id,
        gx: pos.gx,
        gy: pos.gy,
        value: EFFORT_VALUE[effort] ?? 10,
        remaining: EFFORT_REMAINING[effort] ?? 80,
        depleted: false,
        assigned: null,
        label: row.title,
        project: row.project,
        beadType: row.type,       // feature | bug | docs | design
        postedBy: row.posted_by,
        claimedBy: row.claimed_by ?? null,
        isClaimed: row.status === 'claimed',
      });
    }
  }

  // Mark beads no longer in the feed as depleted (completed/withdrawn server-side)
  for (const b of simState.beads) {
    if (b.id.startsWith('bd-')) continue; // leave simulated beads alone
    if (!incomingIds.has(b.id)) {
      b.depleted = true;
      b.remaining = 0;
    }
  }
}
