import Phaser from 'phaser';
import { tick, POLECAT_STATES } from '../sim.js';

// ── Isometric projection constants ─────────────────────────────────
const TW = 64;  // tile width  (full diamond width)
const TH = 32;  // tile height (full diamond height)
const ORIGIN_X = 0;
const ORIGIN_Y = 200;

// Grid coords → screen coords (top corner of tile)
function iso(gx, gy) {
  return {
    x: (gx - gy) * (TW / 2) + ORIGIN_X,
    y: (gx + gy) * (TH / 2) + ORIGIN_Y,
  };
}

// ── Palette ─────────────────────────────────────────────────────────
const C = {
  // Ground
  groundTop:   0x1e1a12,
  groundLeft:  0x161209,
  groundRight: 0x0f0d07,
  groundEdge:  0x2a2518,

  // Rig (command center)
  rigTop:      0x2d4a2d,
  rigLeft:     0x1a2d1a,
  rigRight:    0x0f1f0f,
  rigRoof:     0x3d6b3d,
  rigAccent:   0x5aff5a,

  // Refinery
  refTop:      0x4a2d0a,
  refLeft:     0x2d1a05,
  refRight:    0x1f1205,
  refRoof:     0x7a4a10,
  refAccent:   0xff9900,

  // Bead / resource crystal
  beadGlow:    0x00ffaa,
  beadCore:    0x00cc88,
  beadDark:    0x005544,

  // Units
  polecatBody: 0xff6600,
  polecatCarry:0xffaa00,
  polecatStuck:0xff0000,
  mayorBody:   0xffd700,
  deaconBody:  0x4488ff,

  // UI
  uiBg:        0x0a0a0a,
  uiText:      0x88ffaa,
  uiDim:       0x446644,

  // Tile highlight
  highlight:   0x334422,

  // Outpost (wasteland rig)
  outpostTop:   0x1a1a2d,
  outpostLeft:  0x0f0f1a,
  outpostRight: 0x08080f,
  outpostRoof:  0x2d2d4a,
  outpostAccent:0x8888ff,

  // Bead type variants
  beadFeature: 0x00ffaa,  // cyan-green
  beadBug:     0xff4444,  // red
  beadDocs:    0xffdd00,  // yellow
  beadDesign:  0xcc44ff,  // purple
  beadClaimed: 0x888888,  // grey — already claimed
};

export class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }

  init(data) {
    this.simState = data.simState;
  }

  create() {
    this.cameras.main.setBackgroundColor(0x0a0a0a);

    // Container offset so map is centered
    const mapCenterX = this.scale.width / 2;
    this.mapOffsetX = mapCenterX;
    this.mapOffsetY = 80;

    // World container (panned/zoomed)
    this.world = this.add.container(this.mapOffsetX, this.mapOffsetY);

    // Layers (render order: ground → buildings → units → effects)
    this.layerGround    = this.add.container(0, 0);
    this.layerBuildings = this.add.container(0, 0);
    this.layerUnits     = this.add.container(0, 0);
    this.layerEffects   = this.add.container(0, 0);
    this.world.add([this.layerGround, this.layerBuildings, this.layerUnits, this.layerEffects]);

    // Draw static ground once
    this.groundGraphics = this.add.graphics();
    this.layerGround.add(this.groundGraphics);
    this.drawGround();

    // Building graphics (mostly static, redrawn only on state change)
    this.buildingGraphics = this.add.graphics();
    this.layerBuildings.add(this.buildingGraphics);
    this.drawBuildings();

    // Bead graphics (redrawn each frame for animation)
    this.beadGraphics = this.add.graphics();
    this.layerUnits.add(this.beadGraphics);

    // Unit graphics
    this.unitGraphics = this.add.graphics();
    this.layerUnits.add(this.unitGraphics);

    // Camera pan with mouse drag
    this.input.on('pointermove', (ptr) => {
      if (ptr.isDown && ptr.button === 0) {
        this.world.x += ptr.velocity.x * 0.5;
        this.world.y += ptr.velocity.y * 0.5;
      }
    });

    // Zoom with wheel
    this.input.on('wheel', (ptr, objs, dx, dy) => {
      const zoom = this.world.scaleX - dy * 0.001;
      const clamped = Phaser.Math.Clamp(zoom, 0.4, 2.0);
      this.world.setScale(clamped);
    });

    // ── Tooltip — rendered in screen space, above world container ──
    this.tooltip = new Tooltip(this);
  }

  // Convert grid position to layer-local screen position
  gToS(gx, gy) {
    const p = iso(gx, gy);
    return { x: p.x + ORIGIN_X, y: p.y - ORIGIN_Y };
  }

  drawGround() {
    const g = this.groundGraphics;
    g.clear();
    const MAP_W = 24;
    const MAP_H = 24;

    for (let gx = 0; gx < MAP_W; gx++) {
      for (let gy = 0; gy < MAP_H; gy++) {
        this.drawTile(g, gx, gy, C.groundTop, C.groundLeft, C.groundRight);
      }
    }
  }

  drawTile(g, gx, gy, topColor, leftColor, rightColor, raised = 0) {
    const { x, y } = this.gToS(gx, gy);
    const hw = TW / 2;
    const hh = TH / 2;

    if (raised > 0) {
      // Left face
      g.fillStyle(leftColor, 1);
      g.fillPoints([
        { x: x,      y: y + hh },
        { x: x,      y: y + hh + raised },
        { x: x + hw, y: y + TH + raised },
        { x: x + hw, y: y + TH },
      ], true);
      // Right face
      g.fillStyle(rightColor, 1);
      g.fillPoints([
        { x: x + hw, y: y + TH },
        { x: x + hw, y: y + TH + raised },
        { x: x + TW, y: y + hh + raised },
        { x: x + TW, y: y + hh },
      ], true);
    }

    // Top face (diamond)
    g.fillStyle(topColor, 1);
    g.fillPoints([
      { x: x + hw, y: y },
      { x: x + TW, y: y + hh },
      { x: x + hw, y: y + TH },
      { x: x,      y: y + hh },
    ], true);

    // Thin edge line
    g.lineStyle(1, C.groundEdge, 0.3);
    g.strokePoints([
      { x: x + hw, y: y },
      { x: x + TW, y: y + hh },
      { x: x + hw, y: y + TH },
      { x: x,      y: y + hh },
    ], true);
  }

  drawBuildings() {
    const g = this.buildingGraphics;
    g.clear();

    for (const b of this.simState.buildings) {
      if (b.type === 'rig') this.drawRig(g, b);
      else if (b.type === 'refinery') this.drawRefinery(g, b);
      else if (b.type === 'outpost') this.drawOutpost(g, b);
    }
  }

  drawRig(g, b) {
    const { gx, gy, width, height } = b;
    // Draw footprint tiles darker
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        this.drawTile(g, gx + dx, gy + dy, C.rigTop, C.rigLeft, C.rigRight);
      }
    }

    // Main building block — raised box, drawn in iso depth order
    // Render from back (far corner) to front
    const bldH = 40; // pixel height of walls
    const px = gx + Math.floor(width / 2);
    const py = gy + Math.floor(height / 2);

    // Draw a multi-tile raised structure by drawing each column back-to-front
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        this.drawRaisedBox(g, gx + dx, gy + dy, bldH + (dx + dy) * 4,
          C.rigRoof, C.rigLeft, C.rigRight);
      }
    }

    // Antenna / marker on top center
    const top = this.gToS(gx + 1, gy + 1);
    const topX = top.x + TW / 2;
    const topY = top.y - bldH - 20;
    g.fillStyle(C.rigAccent, 0.9);
    g.fillRect(topX - 1, topY, 2, 18);
    g.fillCircle(topX, topY, 3);
  }

  drawRefinery(g, b) {
    const { gx, gy, width, height } = b;
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        this.drawTile(g, gx + dx, gy + dy, C.refTop, C.refLeft, C.refRight);
      }
    }
    const bldH = 30;
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        this.drawRaisedBox(g, gx + dx, gy + dy, bldH,
          C.refRoof, C.refLeft, C.refRight);
      }
    }
    // Chimney
    const base = this.gToS(gx, gy);
    g.fillStyle(C.refAccent, 0.8);
    g.fillRect(base.x + TW / 2 - 2, base.y - bldH - 20, 4, 20);
    // Glow dot at chimney top
    g.fillStyle(0xff4400, 0.9);
    g.fillCircle(base.x + TW / 2, base.y - bldH - 20, 4);
  }

  drawOutpost(g, b) {
    const { gx, gy } = b;
    this.drawTile(g, gx, gy, C.outpostTop, C.outpostLeft, C.outpostRight);
    const bldH = 18;
    this.drawRaisedBox(g, gx, gy, bldH, C.outpostRoof, C.outpostLeft, C.outpostRight);
    // Small beacon on top
    const top = this.gToS(gx, gy);
    const cx = top.x + TW / 2;
    const cy = top.y - bldH - 6;
    g.fillStyle(C.outpostAccent, 0.7);
    g.fillRect(cx - 1, cy - 8, 2, 8);
    g.fillStyle(C.outpostAccent, 0.9);
    g.fillCircle(cx, cy - 8, 2);
  }

  drawRaisedBox(g, gx, gy, raised, topColor, leftColor, rightColor) {
    const { x, y } = this.gToS(gx, gy);
    const hw = TW / 2;
    const hh = TH / 2;

    // Left face
    g.fillStyle(leftColor, 1);
    g.fillPoints([
      { x: x,      y: y + hh },
      { x: x,      y: y + hh - raised },
      { x: x + hw, y: y + TH - raised },
      { x: x + hw, y: y + TH },
    ], true);

    // Right face
    g.fillStyle(rightColor, 1);
    g.fillPoints([
      { x: x + hw, y: y + TH },
      { x: x + hw, y: y + TH - raised },
      { x: x + TW, y: y + hh - raised },
      { x: x + TW, y: y + hh },
    ], true);

    // Top face
    g.fillStyle(topColor, 1);
    g.fillPoints([
      { x: x + hw, y: y - raised },
      { x: x + TW, y: y + hh - raised },
      { x: x + hw, y: y + TH - raised },
      { x: x,      y: y + hh - raised },
    ], true);

    // Edge lines
    g.lineStyle(1, 0x000000, 0.4);
    g.strokePoints([
      { x: x + hw, y: y - raised },
      { x: x + TW, y: y + hh - raised },
      { x: x + hw, y: y + TH - raised },
      { x: x,      y: y + hh - raised },
    ], true);
  }

  update(time, delta) {
    // Advance simulation
    tick(this.simState);

    // Redraw dynamic layers
    this.drawBeads(time);
    this.drawUnits(time);

    // Hover tooltips
    this.updateTooltip();
  }

  // Convert screen pointer position → grid coords (float)
  ptrToGrid() {
    const ptr = this.input.activePointer;
    const wx = (ptr.x - this.world.x) / this.world.scaleX;
    const wy = (ptr.y - this.world.y) / this.world.scaleY;
    // Undo gToS: gToS adds ORIGIN_X and subtracts ORIGIN_Y
    const sx = wx - ORIGIN_X;
    const sy = wy + ORIGIN_Y;
    // Inverse iso projection
    const gx = (sx / (TW / 2) + sy / (TH / 2)) / 2;
    const gy = (sy / (TH / 2) - sx / (TW / 2)) / 2;
    return { gx, gy };
  }

  // Convert a grid position to final screen coords (for tooltip anchor)
  gridToScreen(gx, gy) {
    const local = this.gToS(gx, gy);
    return {
      x: local.x * this.world.scaleX + this.world.x,
      y: local.y * this.world.scaleY + this.world.y,
    };
  }

  updateTooltip() {
    const { gx, gy } = this.ptrToGrid();
    const s = this.simState;
    const hit = findHover(gx, gy, s);

    if (hit) {
      const screen = this.gridToScreen(hit.gx, hit.gy);
      // Offset upward so bubble sits above the entity
      this.tooltip.show(screen.x, screen.y - 30 * this.world.scaleY, hit.lines, hit.color);
    } else {
      this.tooltip.hide();
    }
  }

  drawBeads(time) {
    const g = this.beadGraphics;
    g.clear();

    const pulse = 0.7 + 0.3 * Math.sin(time * 0.003);

    for (const b of this.simState.beads) {
      if (b.depleted) continue;
      const { x, y } = this.gToS(b.gx, b.gy);
      const cx = x + TW / 2;
      const cy = y + TH / 2;
      const size = 6 + (b.remaining / 100) * 8;

      // Color by bead type (real wasteland data) or claimed state
      let glowColor = C.beadGlow;
      if (b.isClaimed)         glowColor = C.beadClaimed;
      else if (b.beadType === 'bug')    glowColor = C.beadBug;
      else if (b.beadType === 'docs')   glowColor = C.beadDocs;
      else if (b.beadType === 'design') glowColor = C.beadDesign;

      // Glow
      g.fillStyle(glowColor, pulse * 0.2);
      g.fillCircle(cx, cy, size * 2);

      // Crystal body — small diamond
      g.fillStyle(glowColor, pulse * 0.9);
      g.fillPoints([
        { x: cx,          y: cy - size },
        { x: cx + size/2, y: cy },
        { x: cx,          y: cy + size * 0.6 },
        { x: cx - size/2, y: cy },
      ], true);

      // Inner bright core
      g.fillStyle(b.isClaimed ? 0x444444 : 0xffffff, pulse * 0.6);
      g.fillCircle(cx, cy - size * 0.2, size * 0.25);

      // Label if large
      if (b.remaining > 20) {
        // Tiny white dot indicator
        g.fillStyle(C.beadDark, 0.8);
        g.fillRect(cx - 8, cy + size + 2, 16, 4);
        g.fillStyle(C.beadGlow, 0.9);
        const fill = (b.remaining / 100) * 16;
        g.fillRect(cx - 8, cy + size + 2, fill, 4);
      }
    }
  }

  drawUnits(time) {
    const g = this.unitGraphics;
    g.clear();

    const bob = Math.sin(time * 0.005) * 2;

    // Draw polecats
    for (const pc of this.simState.polecats) {
      const { x, y } = this.gToS(pc.gx, pc.gy);
      const cx = x + TW / 2;
      const cy = y + TH / 2 + bob;

      let color = C.polecatBody;
      if (pc.state === POLECAT_STATES.STUCK) color = C.polecatStuck;
      else if (pc.carrying > 0) color = C.polecatCarry;

      // Shadow
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(cx, cy + 6, 14, 6);

      // Body diamond
      const s = 7;
      g.fillStyle(color, 0.9);
      g.fillPoints([
        { x: cx,     y: cy - s },
        { x: cx + s, y: cy },
        { x: cx,     y: cy + s },
        { x: cx - s, y: cy },
      ], true);

      // Carried resource indicator
      if (pc.carrying > 0) {
        g.fillStyle(C.beadGlow, 0.8);
        g.fillCircle(cx, cy - s - 3, 3);
      }

      // Stuck indicator
      if (pc.state === POLECAT_STATES.STUCK) {
        const blink = Math.sin(time * 0.02) > 0;
        if (blink) {
          g.fillStyle(0xff0000, 0.9);
          g.fillRect(cx - 4, cy - s - 10, 8, 6);
          g.lineStyle(1, 0xff0000, 0.9);
          g.strokeRect(cx - 4, cy - s - 10, 8, 6);
        }
      }

      // Convoy label pill
      if (pc.label) {
        g.fillStyle(0x222244, 0.8);
        g.fillRoundedRect(cx - 16, cy - s - 22, 32, 10, 3);
        g.lineStyle(1, 0x4444aa, 0.6);
        g.strokeRoundedRect(cx - 16, cy - s - 22, 32, 10, 3);
      }
    }

    // Mayor — gold, larger, always at rig
    const mayor = this.simState.mayor;
    if (mayor) {
      const { x, y } = this.gToS(mayor.gx, mayor.gy);
      const cx = x + TW / 2;
      const cy = y + TH / 2 + bob * 0.5;
      const s = 10;

      // Aura
      const aura = 0.1 + 0.1 * Math.sin(time * 0.004);
      g.fillStyle(C.mayorBody, aura);
      g.fillCircle(cx, cy, s * 2.5);

      // Shadow
      g.fillStyle(0x000000, 0.4);
      g.fillEllipse(cx, cy + 8, 18, 7);

      // Body
      g.fillStyle(C.mayorBody, 1);
      g.fillPoints([
        { x: cx,     y: cy - s },
        { x: cx + s, y: cy },
        { x: cx,     y: cy + s },
        { x: cx - s, y: cy },
      ], true);

      // Crown
      g.fillStyle(0xffffff, 0.8);
      g.fillTriangle(cx - 4, cy - s, cx, cy - s - 5, cx + 4, cy - s);
    }

    // Deacon — blue, roving monitor
    const deacon = this.simState.deacon;
    if (deacon) {
      const { x, y } = this.gToS(deacon.gx, deacon.gy);
      const cx = x + TW / 2;
      const cy = y + TH / 2 + bob * 1.5;
      const s = 6;

      // Sweep circle
      const sweep = (time * 0.001) % (Math.PI * 2);
      g.lineStyle(1, C.deaconBody, 0.3);
      g.strokeCircle(cx, cy, 20);
      g.lineStyle(1, C.deaconBody, 0.6);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(sweep) * 20, cy + Math.sin(sweep) * 12);
      g.strokePath();

      // Shadow
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(cx, cy + 5, 12, 5);

      // Body (triangle = different shape from polecats)
      g.fillStyle(C.deaconBody, 0.9);
      g.fillTriangle(cx, cy - s, cx + s, cy + s * 0.6, cx - s, cy + s * 0.6);
    }
  }
}

// ── Hit detection ─────────────────────────────────────────────────
// Returns { gx, gy, lines[], color } for the topmost entity under the cursor,
// or null if nothing is close enough.

function gridDist(gx, gy, ex, ey) {
  return Math.sqrt((gx - ex) ** 2 + (gy - ey) ** 2);
}

function findHover(gx, gy, s) {
  const UNIT_R  = 0.7;  // grid-unit radius for units
  const BEAD_R  = 0.6;
  const BLDG_R  = 1.4;

  // Polecats (highest priority — smallest, hardest to click)
  for (const pc of s.polecats) {
    if (gridDist(gx, gy, pc.gx, pc.gy) < UNIT_R) {
      const carry = pc.carrying > 0 ? `carrying ${pc.carrying}` : 'empty';
      const state = pc.state.replace(/_/g, ' ');
      const lines = [
        pc.id,
        state,
        carry,
        pc.label ? `convoy: ${pc.label}` : null,
      ].filter(Boolean);
      return { gx: pc.gx, gy: pc.gy, lines, color: pc.carrying > 0 ? '#ffaa00' : '#ff6600' };
    }
  }

  // Mayor
  if (s.mayor && gridDist(gx, gy, s.mayor.gx, s.mayor.gy) < UNIT_R) {
    return {
      gx: s.mayor.gx, gy: s.mayor.gy,
      lines: ['MAYOR', 'commanding', 'coordinates all polecats'],
      color: '#ffd700',
    };
  }

  // Deacon
  if (s.deacon && gridDist(gx, gy, s.deacon.gx, s.deacon.gy) < UNIT_R) {
    return {
      gx: s.deacon.gx, gy: s.deacon.gy,
      lines: ['DEACON', 'patrolling', 'detects & nudges stuck polecats'],
      color: '#4488ff',
    };
  }

  // Beads
  for (const b of s.beads) {
    if (b.depleted) continue;
    if (gridDist(gx, gy, b.gx, b.gy) < BEAD_R) {
      const lines = [
        b.label ? truncate(b.label, 34) : b.id,
        b.project ? `project: ${b.project}` : null,
        b.beadType ? `type: ${b.beadType}` : null,
        b.isClaimed ? `claimed by: ${b.claimedBy}` : `posted by: ${b.postedBy ?? '?'}`,
        `effort: ${b.value}  remaining: ${b.remaining}`,
      ].filter(Boolean);
      const color = { bug: '#ff5555', docs: '#ffdd44', design: '#cc66ff' }[b.beadType] ?? '#44ffaa';
      return { gx: b.gx, gy: b.gy, lines, color };
    }
  }

  // Buildings
  for (const b of s.buildings) {
    const cx = b.gx + (b.width ?? 1) / 2;
    const cy = b.gy + (b.height ?? 1) / 2;
    if (gridDist(gx, gy, cx, cy) < BLDG_R) {
      if (b.type === 'rig') {
        return {
          gx: cx, gy: cy,
          lines: ['RIG', 'command center', 'spawns polecats'],
          color: '#55ff55',
        };
      }
      if (b.type === 'refinery') {
        return {
          gx: cx, gy: cy,
          lines: ['REFINERY', 'merge queue', 'processes completed work'],
          color: '#ff9900',
        };
      }
      if (b.type === 'outpost') {
        const seen = b.lastSeen ? relativeTime(b.lastSeen) : 'unknown';
        return {
          gx: cx, gy: cy,
          lines: [
            b.label || b.handle,
            `@${b.handle}`,
            `last seen: ${seen}`,
            b.trustLevel ? `trust: ${b.trustLevel}` : null,
          ].filter(Boolean),
          color: '#8888ff',
        };
      }
    }
  }

  return null;
}

function truncate(str, len) {
  return str && str.length > len ? str.slice(0, len - 1) + '…' : str;
}

function relativeTime(isoStr) {
  const ms = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Tooltip ───────────────────────────────────────────────────────
// Drawn in screen space (not inside the world container) so it doesn't
// scale or pan with the map.

class Tooltip {
  constructor(scene) {
    this.scene = scene;
    this.bg   = scene.add.graphics().setDepth(100);
    this.text = scene.add.text(0, 0, '', {
      fontSize: '12px',
      fontFamily: 'Courier New',
      color: '#ffffff',
      lineSpacing: 5,
      padding: { x: 0, y: 0 },
    }).setDepth(101);
    this.visible = false;
    this.hide();
  }

  show(x, y, lines, accentColor = '#44ff88') {
    const PAD  = 10;
    const PTR  = 7;   // pointer triangle height
    const text = lines.join('\n');

    // Color the first line as the accent/title
    this.text.setText(text);
    this.text.setColor(accentColor);  // whole text for simplicity — first line pops

    const tw = this.text.width  + PAD * 2;
    const th = this.text.height + PAD * 2;

    // Keep bubble on screen
    const W = this.scene.scale.width;
    let bx = x - tw / 2;
    if (bx < 4)       bx = 4;
    if (bx + tw > W - 4) bx = W - tw - 4;
    const by = y - th - PTR;

    this.bg.clear();
    // Shadow
    this.bg.fillStyle(0x000000, 0.4);
    this.bg.fillRoundedRect(bx + 3, by + 3, tw, th + PTR, 5);
    // Background
    this.bg.fillStyle(0x0a0f0a, 0.93);
    this.bg.fillRoundedRect(bx, by, tw, th, 5);
    // Border
    this.bg.lineStyle(1, Phaser.Display.Color.HexStringToColor(accentColor).color, 0.8);
    this.bg.strokeRoundedRect(bx, by, tw, th, 5);
    // Pointer triangle
    this.bg.fillStyle(0x0a0f0a, 0.93);
    this.bg.fillTriangle(
      x - PTR, by + th,
      x + PTR, by + th,
      x,       by + th + PTR,
    );
    this.bg.lineStyle(1, Phaser.Display.Color.HexStringToColor(accentColor).color, 0.8);
    this.bg.strokeTriangle(
      x - PTR, by + th,
      x + PTR, by + th,
      x,       by + th + PTR,
    );

    this.text.setPosition(bx + PAD, by + PAD);
    this.bg.setVisible(true);
    this.text.setVisible(true);
    this.visible = true;
  }

  hide() {
    this.bg.clear();
    this.bg.setVisible(false);
    this.text.setVisible(false);
    this.visible = false;
  }
}
