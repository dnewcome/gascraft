// Simulation state and logic — no Phaser dependency, pure data

export const POLECAT_STATES = {
  IDLE: 'idle',
  MOVING_TO_BEAD: 'moving_to_bead',
  MINING: 'mining',
  MOVING_TO_REFINERY: 'moving_to_refinery',
  DEPOSITING: 'depositing',
  STUCK: 'stuck',
  RETURNING: 'returning',
};

let _nextId = 1;
const uid = (prefix) => `${prefix}-${(_nextId++).toString(36)}`;

export function createSim() {
  const state = {
    tick: 0,
    resources: 0,        // total merged (deposited to refinery)
    pending: 0,          // in refinery queue
    apiTokens: 1000,     // vespene equivalent — rate limiting budget
    polecats: [],
    beads: [],
    buildings: [],
    convoys: [],
    events: [],          // last N log lines
    mayor: null,
    deacon: null,
  };

  // ── Initial map layout ─────────────────────────────────────────
  // Rig (command center) at grid (10, 10)
  state.buildings.push({ id: uid('rig'), type: 'rig', gx: 10, gy: 10, width: 3, height: 3 });
  // Refinery at (15, 9)
  state.buildings.push({ id: uid('ref'), type: 'refinery', gx: 15, gy: 9, width: 2, height: 2 });

  // Mayor — special persistent agent at rig center
  state.mayor = { id: 'mayor', gx: 11, gy: 11, label: 'MAYOR', state: 'commanding' };

  // Deacon — roving monitor
  state.deacon = { id: 'deacon', gx: 10, gy: 14, label: 'DEACON', state: 'patrolling', path: [] };

  // Beads and polecats come from the wasteland API — none seeded here

  return state;
}

// Spawn one agent polecat for a claimed wasteland bead.
// Called by mapper whenever a bead transitions to claimed.
export function spawnAgentPolecat(state, bead) {
  const rig = state.buildings.find(b => b.type === 'rig') ?? { gx: 10, gy: 10 };
  bead.assigned = `agent-${bead.id}`;
  state.polecats.push({
    id: `agent-${bead.id}`,
    beadId: bead.id,          // stable reference — targetBead may clear temporarily
    gx: rig.gx + 1 + Math.random(),
    gy: rig.gy + 1 + Math.random(),
    state: POLECAT_STATES.MOVING_TO_BEAD,
    targetBead: bead.id,
    carrying: 0,
    stuckTimer: 0,
    speed: 0.04 + Math.random() * 0.02,
    mineTimer: 0,
    depositTimer: 0,
    idleTimer: 0,
    label: bead.claimedBy,    // real agent handle shown in roster + tooltip
    isAgent: true,
  });
}

// ── Simulation tick (called ~60fps by game loop) ───────────────────
export function tick(state) {
  state.tick++;

  tickDeacon(state);
  tickPolecats(state);
  tickApiTokens(state);

  // Trim events log
  if (state.events.length > 40) {
    state.events = state.events.slice(state.events.length - 40);
  }
}

function tickPolecats(state) {
  const refinery = state.buildings.find(b => b.type === 'refinery');

  for (const pc of state.polecats) {
    switch (pc.state) {
      case POLECAT_STATES.IDLE: {
        // Agent polecats don't wander — they wait to be cleaned up by mapper
        if (pc.isAgent) break;
        if (pc.idleTimer > 0) { pc.idleTimer--; break; }
        // Find nearest available bead
        const bead = nearestAvailableBead(state, pc);
        if (bead) {
          bead.assigned = pc.id;
          pc.targetBead = bead.id;
          pc.state = POLECAT_STATES.MOVING_TO_BEAD;
          log(state, `${pc.id} → bead ${bead.id}`);
        } else {
          pc.idleTimer = 30; // wait and retry
        }
        break;
      }

      case POLECAT_STATES.MOVING_TO_BEAD: {
        const bead = state.beads.find(b => b.id === pc.targetBead);
        if (!bead || bead.depleted) {
          pc.state = POLECAT_STATES.IDLE;
          pc.targetBead = null;
          break;
        }
        const arrived = moveToward(pc, bead.gx, bead.gy, pc.speed);
        checkStuck(pc);
        if (arrived) {
          pc.state = POLECAT_STATES.MINING;
          pc.mineTimer = 0;
          log(state, `${pc.id} mining ${bead.id}`);
        }
        break;
      }

      case POLECAT_STATES.MINING: {
        const bead = state.beads.find(b => b.id === pc.targetBead);
        if (!bead || bead.depleted) {
          pc.state = POLECAT_STATES.RETURNING;
          pc.targetBead = null;
          break;
        }
        pc.mineTimer++;
        if (pc.mineTimer >= 90) { // ~1.5 seconds at 60fps
          const amount = Math.min(bead.value, bead.remaining);
          bead.remaining -= amount;
          pc.carrying += amount;
          pc.mineTimer = 0;
          if (bead.remaining <= 0) {
            bead.depleted = true;
            bead.assigned = null;
            log(state, `${bead.id} depleted`);
          }
          if (pc.carrying >= 15) {
            pc.state = POLECAT_STATES.MOVING_TO_REFINERY;
            if (bead.assigned === pc.id) bead.assigned = null;
            log(state, `${pc.id} → refinery (carrying ${pc.carrying})`);
          }
        }
        break;
      }

      case POLECAT_STATES.MOVING_TO_REFINERY: {
        const tx = refinery.gx + 0.5;
        const ty = refinery.gy + 0.5;
        const arrived = moveToward(pc, tx, ty, pc.speed);
        checkStuck(pc);
        if (arrived) {
          pc.state = POLECAT_STATES.DEPOSITING;
          pc.depositTimer = 0;
          log(state, `${pc.id} depositing ${pc.carrying}`);
        }
        break;
      }

      case POLECAT_STATES.DEPOSITING: {
        pc.depositTimer++;
        if (pc.depositTimer >= 40) {
          state.resources += pc.carrying;
          state.pending = Math.max(0, state.pending - pc.carrying);
          state.apiTokens -= Math.floor(pc.carrying / 5); // cost tokens to merge
          pc.carrying = 0;
          pc.depositTimer = 0;
          log(state, `merged → ${state.resources} total`);
          if (pc.isAgent) {
            // Work is still open — cycle back to the same bead
            pc.targetBead = pc.beadId;
            pc.state = POLECAT_STATES.MOVING_TO_BEAD;
          } else {
            pc.state = POLECAT_STATES.RETURNING;
          }
        }
        break;
      }

      case POLECAT_STATES.RETURNING: {
        const rig = state.buildings.find(b => b.type === 'rig');
        const tx = rig.gx + 1 + Math.random() * 0.5;
        const ty = rig.gy + 1 + Math.random() * 0.5;
        const arrived = moveToward(pc, tx, ty, pc.speed);
        if (arrived) {
          pc.state = POLECAT_STATES.IDLE;
          pc.idleTimer = 10;
        }
        break;
      }

      case POLECAT_STATES.STUCK: {
        pc.stuckTimer--;
        if (pc.stuckTimer <= 0) {
          pc.state = POLECAT_STATES.IDLE;
          pc.targetBead = null;
          pc.carrying = 0;
          pc.idleTimer = 30;
          log(state, `DEACON nudged ${pc.id} — unstuck`);
        }
        break;
      }
    }
  }
}

function tickDeacon(state) {
  const d = state.deacon;

  // Deacon patrols in a wide loop around the map
  if (!d.path || d.path.length === 0) {
    // Generate patrol waypoints around the active area
    d.path = [
      [4, 4], [20, 4], [20, 20], [4, 20], [12, 12]
    ].map(([x, y]) => ({ x: x + Math.random() * 2, y: y + Math.random() * 2 }));
    d.pathIdx = 0;
  }

  const target = d.path[d.pathIdx];
  const dx = target.x - d.gx;
  const dy = target.y - d.gy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.2) {
    d.pathIdx = (d.pathIdx + 1) % d.path.length;
  } else {
    const speed = 0.025;
    d.gx += (dx / dist) * speed;
    d.gy += (dy / dist) * speed;
  }

  // Deacon detects stuck polecats and nudges them
  if (state.tick % 120 === 0) {
    for (const pc of state.polecats) {
      if (pc.stuckTimer > 200) {
        pc.state = POLECAT_STATES.STUCK;
        pc.stuckTimer = 60; // recovery countdown
        log(state, `DEACON: ${pc.id} stuck — nudging`);
      }
    }
  }
}


function tickApiTokens(state) {
  // Tokens regenerate slowly (rate limit recovery)
  if (state.tick % 60 === 0) {
    state.apiTokens = Math.min(1000, state.apiTokens + 5);
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function nearestAvailableBead(state, pc) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const b of state.beads) {
    if (b.depleted || b.assigned) continue;
    const dx = b.gx - pc.gx;
    const dy = b.gy - pc.gy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < nearestDist) { nearestDist = d; nearest = b; }
  }
  return nearest;
}

function moveToward(entity, tx, ty, speed) {
  const dx = tx - entity.gx;
  const dy = ty - entity.gy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < speed) {
    entity.gx = tx;
    entity.gy = ty;
    return true; // arrived
  }
  entity.gx += (dx / dist) * speed;
  entity.gy += (dy / dist) * speed;
  return false;
}

function checkStuck(pc) {
  // A real stuck check would compare position over time;
  // here we just increment a counter and let the deacon handle it
  pc.stuckTimer++;
}

function log(state, msg) {
  state.events.push({ tick: state.tick, msg });
}

// ── Commands (will wire to real gt CLI later) ──────────────────────

export function spawnPolecat(state) {
  if (state.apiTokens < 50) return false;
  state.apiTokens -= 50;
  state.polecats.push(makePolecat(state));
  log(state, `spawned polecat (${state.polecats.length} total)`);
  return true;
}

export function createConvoy(state, label) {
  const idle = state.polecats.filter(p => p.state === POLECAT_STATES.IDLE).slice(0, 3);
  if (idle.length === 0) return null;
  const convoy = { id: uid('cv'), label: label || `convoy-${uid('c')}`, members: idle.map(p => p.id) };
  for (const pc of idle) pc.label = convoy.label;
  state.convoys.push(convoy);
  log(state, `convoy ${convoy.label} formed (${idle.length} polecats)`);
  return convoy;
}
