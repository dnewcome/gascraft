# GASCRAFT

An isometric RTS visualization built to understand how [Gastown](https://github.com/gastownhall/gastown) works — the multi-agent AI coding orchestration system. This project started as a way to make the wasteland legible: what's being worked on, who's working it, and how the pieces fit together.

**Data source:** the GitHub issue and PR streams of [gastown](https://github.com/gastownhall/gastown), [gascity](https://github.com/gastownhall/gascity), and [beads](https://github.com/gastownhall/beads). No authentication required. The game polls them every 60 seconds directly from your browser.

Originally this read the [wasteland](https://wasteland.gastownhall.ai/) — a public [DoltHub database](https://www.dolthub.com/repositories/hop/wl-commons) that gastown instances wrote to. That database stopped taking writes on 2026-05-05, so the map was rendering a frozen three-month-old snapshot. The wasteland was itself a GitHub mirror (its bead IDs were literally `w-gh-gascity-1672`), so the game now reads the upstream directly. The old reader is kept at `src/datasources/wasteland.js` in case wl-commons ever wakes up.

**What you're watching:** work items (beads) appear as they're posted, change color when claimed by an agent, and disappear when completed. Outpost beacons are real rigs — project repositories actively registered in the system. Each polecat on the map corresponds to a real claimed work item, labeled with the agent handle working it.

The agent movement is simulated — polecats walk between beads and the refinery as a visualization of ongoing effort, not a literal representation of what the agents are doing internally. The 30-second polls update what exists; the sim fills in the motion between.

Actual control of gastown agents (spawning, nudging, directing) is a future goal and will require a bridge to a live instance. That isn't built yet. For now this is purely a read-only window into the public wasteland.

---

## Run the game

```bash
npm install
npm run dev
```

Open `http://localhost:3002` (or whichever port Vite picks if 3002 is busy — check terminal output).

## Deploy (static hosting)

The game is a fully static site — no server required. GitHub's API sends `Access-Control-Allow-Origin: *` for public data, so wasteland data is fetched directly from the browser with no proxy and no token.

```bash
npm run build   # outputs dist/
```

Then deploy `dist/` anywhere:
- **Cloudflare Pages**: connect GitHub repo, build command `npm run build`, output `dist`
- **Netlify**: same settings, or drag-and-drop the `dist/` folder
- **GitHub Pages**: `gh-pages -d dist` after installing `gh-pages`

The 1.5 MB JS bundle (350 KB gzipped) is almost entirely Phaser — normal for a WebGL game.

**Controls:**
- Click-drag to pan
- Scroll to zoom
- SPAWN POLECAT button costs 50 API tokens
- FORM CONVOY groups idle polecats
- `window.gascraft.simState` in the browser console for live inspection

---

## Reading the UI

```
┌─────────────────────────────────────────────────────────────┐
│  GASCRAFT   MERGED:42   POLECATS:3/5   ⚡[████] 800   BEADS:50/51  ● LIVE 8s  │  ← HUD bar
├──────────────────────────────────────────────────────────────┤
│  rig □  refinery □  outpost □  |  mayor ◆  polecat ◆  ...   │  ← Legend row 1
│  feature ◈  bug ◈  docs ◈  design ◈  claimed ◈             │  ← Legend row 2
├─────────────────────────────────────┬────────────────────────┤
│                                     │  // wasteland feed     │
│                                     │  13:42:01 [feature]... │
│                                     │  13:42:01 [bug]...     │
│       isometric map                 │  13:42:45 merged → 43  │
│                                     │  13:43:02 [claimed]... │
│                                     │                        │
├─────────────────────────────────────┴────────────────────────┤
│  polecat-1   moving_to_bead   carry:0   [rig-handle]        │  ← Roster
│  polecat-2   mining           carry:0                        │
│  ...                              // event log              │
└─────────────────────────────────────────────────────────────┘
```

### HUD bar (top)

| Field | What it shows |
|---|---|
| `MERGED` | Number of beads that have been completed and deposited at the refinery — the score |
| `POLECATS` | Active agents / total agents. Active = not idle |
| `⚡ [████]` | API token budget (vespene gas). Depletes as agents work; regenerates over time. Spawning a polecat costs 50 tokens |
| `BEADS` | Active work items on the map / total ever seen this session |
| `● LIVE Ns` | Green = live data, refreshed N seconds ago. Amber `● STALE Nm` = polls have stopped landing (rate limit, offline) and you are looking at old data. Dim `○ SIM` = no data has arrived at all |

### Legend bar (below HUD)

Two rows of mini-icons identifying every entity type on the map. Hover any entity on the map for a tooltip.

**Row 1 — buildings and units:**
- **rig** (green isometric box) — a project repository registered in the wasteland. Each rig is a real gastown instance someone is running somewhere.
- **refinery** (orange isometric box) — the merge queue. Polecats deposit completed beads here.
- **outpost** (blue beacon) — a rig pulled from the live wasteland that doesn't have a fixed position yet.
- **mayor** (gold diamond with crown) — the AI coordinator. Stays near the rig, plans work.
- **polecat** (orange diamond) — an idle worker agent. No assignment.
- **carrying** (orange diamond + cyan dot) — a polecat actively transporting a bead to the refinery.
- **stuck** (orange diamond + red bar) — a polecat that has been nudged by the deacon for being idle too long.
- **deacon** (blue triangle) — the cross-rig monitor. Patrols the map and nudges stuck polecats.

**Row 2 — bead types (work items):**
- **feature** (cyan) — new functionality
- **bug** (red) — defect fix
- **docs** (yellow) — documentation
- **design** (purple) — design / planning work
- **claimed** (grey) — bead currently assigned to an agent; a polecat is heading toward it or mining it

### Isometric map

The map shows the current state of the wasteland rendered as an isometric grid. Entities move and animate in real time.

- **Beads** pulse and glow on the ground. Their color matches their type. Each bead node has a `remaining` capacity value that decreases as polecats mine it. This single value is currently encoded three ways simultaneously — gem size, glow halo radius, and a small horizontal bar below the gem. All three shrink together as the node depletes. This redundancy is intentional: the plan is to repurpose these three visual channels for different metrics (e.g. effort level, age, claim status) once the right data is available. When `remaining` hits zero the bead disappears.
- **Polecats** walk between beads and the refinery following a simple state machine. Their path is simulated — not directly from API data.
- **Buildings** are fixed. The rig is the origin; the refinery is where completed work lands.
- **Outposts** are real rigs from the wasteland database, plotted at deterministic grid positions derived from their handle string.
- Hover any entity to see a tooltip with its ID, label, and current state.

### Wasteland feed (lower right)

A scrolling log of activity. Two types of entries are mixed together:

**Live API entries** (bright green) — pulled from the GitHub search API every 60 seconds:
- `[feature] title — project` — a new open work item discovered
- `[claimed] title → handle` — a bead was claimed by an agent
- `[done] completed: title` — a bead moved to completed status
- `rig registered: handle` — a new rig appeared in the database

The first poll hydrates the whole map at once; those 60-odd entries are not announced individually, since doing so would bury the feed in identical lines. Only changes after that first poll are reported.

**Sim events** (dim green) — generated by the local simulation at 60fps, shown between polls to keep the feed alive:
- `merged → N total` — a polecat deposited a bead at the refinery
- `bead depleted` — a bead node was exhausted by mining
- `DEACON nudged polecat-X — unstuck` — the deacon intervened on a stuck agent
- `polecat-X stuck — nudging` — the deacon detected an idle agent
- `new bead discovered` — a new sim bead node came into range
- `spawned polecat` — a new agent was created
- `convoy formed` — polecats were grouped into a convoy

### Bottom panel (roster + event log)

**Left — polecat roster:** one line per agent showing ID, current state, how much it's carrying, and which rig it's assigned to. States:
- `idle` — waiting for work
- `moving_to_bead` — walking toward a bead
- `mining` — extracting value from a bead node
- `moving_to_refinery` — carrying a bead back
- `depositing` — handing off at the refinery
- `returning` — walking back to idle position
- `stuck` — flagged by the deacon, waiting for nudge

**Right — event log:** raw sim events as they happen, fading with age. More verbose than the feed; shows every state transition.

### Buttons

- **SPAWN POLECAT [50 tokens]** — adds a new worker agent to the simulation. Disabled (dimmed) when token budget is below 50.
- **FORM CONVOY** — groups all idle polecats into a named convoy for coordinated dispatch.

---

## Concept mapping

The gastown terminology already maps almost 1:1 to StarCraft — refinery, convoy, and rig are the same words in both systems.

| Game entity | Gastown concept |
|---|---|
| You (the player) | Human operator — talks to the Mayor |
| Mayor (gold unit) | Primary AI coordinator (`gt mayor`) |
| Polecat (orange units) | Worker AI agents (`gt sling`) |
| Bead (cyan crystals) | Work items / issues (`bd create`) |
| Rig (green building) | Project repository under management |
| Refinery (orange building) | Merge queue processor |
| Convoy | Named group of beads assigned to agents |
| Deacon (blue triangle) | Cross-rig monitor daemon, nudges stuck polecats |
| API token bar | Rate limit budget (vespene gas) |
| Resources (merged count) | Completed / merged beads |
| Fog of war | Unread beads, unexplored rigs |

**Role hierarchy:**
```
You (player / god)
  └── Mayor  — breaks your intent into convoys + beads
        └── Polecats  — execute tasks in isolated git worktrees
              └── Beads  — work items mined and deposited
                    └── Refinery  — merges completed work to main
```

---

## Simulation notes

### What's real vs. simulated

Each polecat on the map maps 1:1 to a real claimed work item in the wasteland. The polecat's identity is the actual bead ID; the label shown above it is the real `claimed_by` agent handle from the API. If you see a polecat labeled `@sjarmak` heading toward a bead, that's a real agent working that real task.

What's fabricated is the motion itself — walking speed, mining animation, trips to the refinery. These are visual interpolation running at 60fps between 60-second polls. The real agent is running Claude in a git worktree somewhere; the sim shows continuous movement as a stand-in for "work is happening."

### What maps to what

| Game entity | GitHub source |
|---|---|
| Bead (unclaimed) | Open **issue**, most recently updated first |
| Bead (claimed, grey) | Open **pull request** — someone is actively on it |
| Polecat | The PR's author, one per open PR |
| Outpost | A person with an open PR right now; `last_seen` is their most recent PR touch |
| `MERGED` score | Total merged PRs across the three repos (~100/day) |
| Bead colour | `kind/*` label if present, else the conventional-commit prefix (`fix(` → bug, `feat(` → feature), else the population base rate |
| Bead size / capacity | `priority/p0`–`p1` labels, else comment count as an effort proxy |

Only about half of these items carry a `kind/*` label, and gastown's issue tracker is dominated by defect reports (of open issues that *are* labelled, bugs outnumber features 312 to 123). So untyped issues are coloured as bugs and untyped PRs as features — which makes the live map mostly red and grey. That is an honest reflection of the data, not a rendering bug.

### How polling works

The game polls GitHub every 60 seconds. Unauthenticated search allows 10 requests per minute per IP and each poll spends 3 (open issues, open PRs, merged count), which leaves room for a few tabs on one connection. On a 403/429 the poller backs off until the window GitHub reports in `x-ratelimit-reset` rather than hammering it, and the HUD flips from `● LIVE` to `● STALE` once the data is more than two poll intervals old.

Each poll is a merge, not a reset:

- **Existing beads** — metadata (title, project, claim status) is updated in place. Animation state is preserved. Mining progress (`remaining`) is left alone unless it hit zero, in which case it's restored so polecats keep cycling on still-open items.
- **New beads** — added to the map, a feed entry fires once.
- **Disappeared beads** — marked depleted, bead fades out, a "completed" feed entry fires.
- **Unchanged data** — nothing changes. No duplicate feed entries, polecats keep walking where they were.

Polecat assignments are reconciled on each poll: polecats are spawned for newly claimed beads and removed when their bead is no longer active. Between polls, polecats run a local state machine:

```
MOVING_TO_BEAD → MINING → MOVING_TO_REFINERY → DEPOSITING → (repeat)
```

If a polecat locally mines its bead to zero before the next poll, it idles briefly. When the poll restores the bead's remaining capacity (it's still open in the wasteland), the polecat re-targets automatically.

### What the "merged" counter means

Every time a polecat completes a deposit cycle at the refinery, the local merged count increments. This is a sim artifact — it reflects how many deposit cycles have completed locally, not how many PRs have actually merged in the real repositories. It's a rough proxy for activity level, not a literal merge count.

---

## Spinning up a real gastown instance

### Prerequisites

```bash
go version        # need 1.24+
git version       # need 2.25+
dolt version      # need 1.80+
tmux -V           # need 3.0+
jq --version
claude --version  # Claude Code CLI
```

Install Go if missing:
```bash
wget https://go.dev/dl/go1.24.12.linux-amd64.tar.gz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.24.12.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> ~/.bashrc && source ~/.bashrc
```

Install Dolt if missing:
```bash
curl -L https://github.com/dolthub/dolt/releases/latest/download/install.sh | bash
```

### Install the CLIs

Install `bd` (beads) first — it's a dependency of `gc`:
```bash
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
bd version
```

Install `gc` (gascity):
```bash
go install github.com/gastownhall/gascity/cmd/gc@latest
gc version
```

### Spin up a town

```bash
gc init ~/mytown
cd ~/mytown
gc start

# Add a rig — point at any git repo
cd /path/to/your/repo
gc rig add .
bd init

# Create a bead and sling it to a polecat
bd create "First task"
bd ready
gc sling $(bd list --ids | head -1) $(basename $(pwd))

# Watch it go
gc status
gc session attach mayor
```

### Gotchas

- **Concurrent polecats** require server mode: `bd init --server` + `dolt sql-server` running. For solo testing, embedded `bd init` is fine.
- **Claude auth** must be done before starting agents: `claude auth login` or set `ANTHROPIC_API_KEY`. Gas Town doesn't hold API keys — it shells out to Claude Code.
- **`gt` vs `gc`** — these are alternative orchestrators, not layers. Use `gc` for fresh setups. Don't mix them against the same town directory.

---

## Connecting the game to a live gastown instance

The game ships a standalone simulation today. The bridge is next.

### Architecture

```
Browser (Phaser game)
    ↕  WebSocket  (live state push)
    ↕  REST       (commands)
Node.js bridge  (server/)
    ↕  child_process.exec
gt / bd / wl CLIs
    ↕  Dolt SQL + git worktrees
Real gastown workspace
```

### What the bridge reads

| Game entity | Real command |
|---|---|
| Polecats | `gc status` / `bd list --assigned` |
| Beads | `bd list --status open` |
| Refinery queue | `gc refinery status` |
| Events / log | tail `.events.jsonl` per agent |
| Completed work | `bd list --status completed` |

### What the game sends

| Game action | Real command |
|---|---|
| Spawn polecat | `gc sling <bead-id> <rig>` |
| Create bead | `bd create "task title"` |
| Form convoy | `bd convoy create <label>` |
| Nudge stuck agent | `gt nudge <agent>` |

The simulation layer stays in the browser as a predictive interpolation layer — units keep walking smoothly between polls.

---

## Project structure

```
gascraft/
  src/
    main.js              # Phaser game bootstrap, scene wiring
    sim.js               # Simulation state + tick logic (no Phaser dependency)
    scenes/
      MainScene.js       # Isometric renderer — tiles, buildings, units
      UIScene.js         # HUD overlay — counters, event log, buttons
  index.html
  package.json
  vite.config.js
```
