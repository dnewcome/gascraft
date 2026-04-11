// Maps live wasteland data into simState entities.
// Preserves existing animation state for entities already in the sim.

import { spawnAgentPolecat } from '../sim.js';

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
  if (!simState.feed) simState.feed = [];
  applyRigs(simState, rigs);
  applyBeads(simState, wanted);
  simState.resources = completions;
  simState.liveData = true;
  if (simState.feed.length > 200) simState.feed = simState.feed.slice(-200);
}

function applyRigs(simState, rigRows) {
  const existingBuildings = new Map(simState.buildings.map(b => [b.id, b]));

  for (const row of rigRows) {
    const id = `wl-rig-${row.handle}`;
    if (existingBuildings.has(id)) {
      existingBuildings.get(id).label = row.display_name || row.handle;
      existingBuildings.get(id).lastSeen = row.last_seen;
    } else {
      const pos = hashPos(row.handle);
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
      feed(simState, 'rig', `rig registered: ${row.handle}`);
    }
  }
}

function applyBeads(simState, wantedRows) {
  const existingBeads = new Map(simState.beads.map(b => [b.id, b]));
  const incomingIds = new Set();

  for (const row of wantedRows) {
    incomingIds.add(row.id);
    const effort = row.effort_level ?? 'medium';
    const isClaimed = row.status === 'claimed';

    if (existingBeads.has(row.id)) {
      const b = existingBeads.get(row.id);
      // Detect claim state change
      if (!b.isClaimed && isClaimed) {
        feed(simState, 'claimed', `claimed: ${truncate(row.title, 36)} → ${row.claimed_by}`);
      }
      b.depleted = false;
      // Restore mining capacity each poll — bead is still open so
      // polecats should keep working it as a visualization of ongoing effort
      if (b.remaining <= 0) b.remaining = EFFORT_REMAINING[effort] ?? 80;
      b.label = row.title;
      b.project = row.project;
      b.beadType = row.type;
      b.claimedBy = row.claimed_by ?? null;
      b.isClaimed = isClaimed;
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
        beadType: row.type,
        postedBy: row.posted_by,
        claimedBy: row.claimed_by ?? null,
        isClaimed,
      });
      const typeTag = row.type ? `[${row.type}]` : '';
      feed(simState, row.type ?? 'feature',
        `${typeTag} ${truncate(row.title, 38)} — ${row.project ?? '?'}`);
    }
  }

  for (const b of simState.beads) {
    if (b.id.startsWith('bd-')) continue;
    if (!incomingIds.has(b.id) && !b.depleted) {
      b.depleted = true;
      b.remaining = 0;
      feed(simState, 'done', `completed: ${truncate(b.label ?? b.id, 40)}`);
    }
  }

  reconcileAgents(simState);
}

function reconcileAgents(simState) {
  // One polecat per claimed bead, keyed by bead ID.
  // Remove agents whose bead completed; spawn agents for newly claimed beads.
  const claimedBeads = simState.beads.filter(b => b.isClaimed && !b.depleted);
  const claimedIds = new Set(claimedBeads.map(b => b.id));

  // Remove agent polecats for beads no longer claimed/active
  simState.polecats = simState.polecats.filter(pc =>
    !pc.isAgent || claimedIds.has(pc.beadId)
  );

  // Spawn for newly claimed beads that don't have an agent yet
  const agentBeadIds = new Set(simState.polecats.filter(pc => pc.isAgent).map(pc => pc.beadId));
  for (const bead of claimedBeads) {
    if (!agentBeadIds.has(bead.id)) {
      spawnAgentPolecat(simState, bead);
      feed(simState, 'sim', `agent dispatched: ${bead.claimedBy} → ${truncate(bead.label, 30)}`);
    }
  }
}

function feed(simState, type, msg) {
  simState.feed.push({ type, msg, ts: Date.now() });
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}
