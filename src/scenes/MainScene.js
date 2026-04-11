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

    // Emit event bus for UI scene
    this.events.on('update', () => {});
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

      // Glow
      g.fillStyle(C.beadGlow, pulse * 0.2);
      g.fillCircle(cx, cy, size * 2);

      // Crystal body — small diamond
      g.fillStyle(C.beadGlow, pulse * 0.9);
      g.fillPoints([
        { x: cx,          y: cy - size },
        { x: cx + size/2, y: cy },
        { x: cx,          y: cy + size * 0.6 },
        { x: cx - size/2, y: cy },
      ], true);

      // Inner bright core
      g.fillStyle(0xffffff, pulse * 0.6);
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
