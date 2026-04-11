import Phaser from 'phaser';
import { spawnPolecat, createConvoy, POLECAT_STATES } from '../sim.js';

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  init(data) {
    this.simState = data.simState;
  }

  create() {
    try {
      this._create();
    } catch (err) {
      console.error('[UIScene] create() threw:', err);
      // Draw a visible error indicator so we know UIScene ran
      const g = this.add.graphics();
      g.fillStyle(0xff0000, 0.8);
      g.fillRect(0, 0, 300, 30);
      this.add.text(4, 4, 'UIScene error: ' + err.message, {
        fontSize: '11px', fontFamily: 'Courier New', color: '#ffffff',
      });
    }
  }

  _create() {
    // Transparent overlay — renders above MainScene
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.scene.bringToTop();

    const W = this.cameras.main.width;
    const H = this.cameras.main.height;
    console.log('[UIScene] canvas size:', W, H);

    // ── Top HUD bar ─────────────────────────────────────────────────
    this.hudBg = this.add.graphics();
    this.hudBg.fillStyle(0x000000, 0.75);
    this.hudBg.fillRect(0, 0, W, 44);
    this.hudBg.lineStyle(1, 0x336633, 0.8);
    this.hudBg.strokeRect(0, 0, W, 44);

    // Title
    this.add.text(12, 10, 'GASCRAFT', {
      fontSize: '18px', fontFamily: 'Courier New',
      color: '#55ff55', fontStyle: 'bold',
    });

    // HUD counters — percentage-based x so items don't collide on narrow windows
    this.txtResources  = this.add.text(Math.round(W * 0.13), 8, '', hudStyle());
    this.txtPolecats   = this.add.text(Math.round(W * 0.27), 8, '', hudStyle());
    this.txtTokens     = this.add.text(Math.round(W * 0.43), 8, '', hudStyle());
    this.txtBeads      = this.add.text(Math.round(W * 0.67), 8, '', hudStyle());
    // tick + live stacked at far right
    this.txtLive       = this.add.text(W - 72,  8,  '', { fontSize: '11px', fontFamily: 'Courier New', color: '#ff4444' });
    this.txtTick       = this.add.text(W - 72,  27, '', { fontSize: '10px', fontFamily: 'Courier New', color: '#335533' });

    // ── Bottom panel ─────────────────────────────────────────────────
    const panelH = 140;
    const panelY = H - panelH;

    this.panelBg = this.add.graphics();
    this.panelBg.fillStyle(0x000000, 0.8);
    this.panelBg.fillRect(0, panelY, W, panelH);
    this.panelBg.lineStyle(1, 0x336633, 0.6);
    this.panelBg.strokeRect(0, panelY, W, panelH);

    // Event log (right side)
    this.logLines = [];
    const logX = W - 380;
    for (let i = 0; i < 6; i++) {
      this.logLines.push(this.add.text(logX, panelY + 8 + i * 18, '', {
        fontSize: '11px', fontFamily: 'Courier New', color: '#446644',
      }));
    }
    this.add.text(logX, panelY - 16, '// event log', {
      fontSize: '10px', fontFamily: 'Courier New', color: '#224422',
    });

    // Polecat roster (center)
    this.rosterText = this.add.text(20, panelY + 8, '', {
      fontSize: '11px', fontFamily: 'Courier New', color: '#55aa55',
      lineSpacing: 4,
    });

    // ── Toast notification ───────────────────────────────────────────
    this.toast = this.add.text(W / 2, H - 60, '', {
      fontSize: '12px', fontFamily: 'Courier New', color: '#ff4444',
      backgroundColor: '#1a0000', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 1).setAlpha(0).setDepth(100);

    // ── Command buttons ──────────────────────────────────────────────
    // Spawn polecat button
    this.btnSpawn = makeButton(this, 20, H - 44, 'SPAWN POLECAT  [50 tokens]', () => {
      this.showToast('not implemented yet — bridge to live gastown required');
      this.simState.events.push({ tick: this.simState.tick, msg: 'SPAWN POLECAT: not implemented — gastown bridge required' });
    });

    // Create convoy button
    this.btnConvoy = makeButton(this, 240, H - 44, 'FORM CONVOY', () => {
      this.showToast('not implemented yet — bridge to live gastown required');
      this.simState.events.push({ tick: this.simState.tick, msg: 'FORM CONVOY: not implemented — gastown bridge required' });
    });

    // ── Legend bar (drawn below the feed panel, above bottom panel) ──
    this.drawLegend(W, panelY);

    // ── Wasteland live feed panel ────────────────────────────────────
    const feedW = 380;
    const feedLines = 14;
    const feedLineH = 15;
    const feedPad = 8;
    const feedInnerH = feedLines * feedLineH + feedPad * 2;
    const feedX = W - feedW - 10;
    const feedY = panelY - feedInnerH - 28;

    const feedBg = this.add.graphics();
    feedBg.fillStyle(0x000000, 0.82);
    feedBg.fillRect(feedX, feedY, feedW, feedInnerH);
    feedBg.lineStyle(1, 0x224422, 1);
    feedBg.strokeRect(feedX, feedY, feedW, feedInnerH);
    // Accent line on top
    feedBg.lineStyle(1, 0x33ff66, 0.5);
    feedBg.strokeRect(feedX, feedY, feedW, feedInnerH);

    this.add.text(feedX + feedPad, feedY - 16, '// wasteland feed', {
      fontSize: '10px', fontFamily: 'Courier New', color: '#336633',
    });

    // Store feed layout params for updateFeed
    this._feedX = feedX;
    this._feedY = feedY;
    this._feedPad = feedPad;
    this._feedLineH = feedLineH;
    // Max chars that fit in the panel without wrapping (no wordWrap — truncate instead)
    this._feedMaxChars = Math.floor((feedW - feedPad * 2) / 7);

    this.feedLines = [];
    for (let i = 0; i < feedLines; i++) {
      this.feedLines.push(this.add.text(
        feedX + feedPad,
        feedY + feedPad + i * feedLineH,
        '',
        { fontSize: '11px', fontFamily: 'Courier New', color: '#336633' }
      ));
    }

    // Track how many feed entries we've shown so we only animate new ones
    this._feedShown = 0;

  }

  showToast(msg) {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(`⚠ ${msg}`);
    this.toast.setAlpha(1);
    this.tweens.add({
      targets: this.toast,
      alpha: 0,
      delay: 2000,
      duration: 600,
      ease: 'Cubic.easeIn',
    });
  }

  drawLegend(W, _panelY) {
    // Two-row legend so all items fit on narrow windows.
    // Row 1: buildings + units  |  Row 2: bead types
    const BAR_H = 44;
    const barY  = 46;

    const ROW1 = [
      { icon: 'rig',      label: 'rig',      color: '#55ff55' },
      { icon: 'refinery', label: 'refinery', color: '#ff9900' },
      { icon: 'outpost',  label: 'outpost',  color: '#8888ff' },
      null,
      { icon: 'mayor',    label: 'mayor',    color: '#ffd700' },
      { icon: 'polecat',  label: 'polecat',  color: '#ff6600' },
      { icon: 'carrying', label: 'carrying', color: '#ffaa00' },
      { icon: 'stuck',    label: 'stuck',    color: '#ff2222' },
      { icon: 'deacon',   label: 'deacon',   color: '#4488ff' },
    ];

    const ROW2 = [
      { icon: 'feature',  label: 'feature',  color: '#00ffaa' },
      { icon: 'bug',      label: 'bug',      color: '#ff5555' },
      { icon: 'docs',     label: 'docs',     color: '#ffdd44' },
      { icon: 'design',   label: 'design',   color: '#cc44ff' },
      { icon: 'claimed',  label: 'claimed',  color: '#888888' },
    ];

    // Courier New 11px ≈ 7px per char
    const CHAR_W = 7;
    const ICON_W = 12;
    const GAP    = 4;
    const SEP    = 10;
    const DIV_W  = 16;

    function rowWidth(items) {
      return items.reduce((s, it) =>
        s + (it ? ICON_W + GAP + it.label.length * CHAR_W + SEP : DIV_W), 0) - SEP;
    }

    const bg = this.add.graphics().setDepth(50);
    bg.fillStyle(0x000000, 0.82);
    bg.fillRect(0, barY, W, BAR_H);
    bg.lineStyle(1, 0x1a2e1a, 1);
    bg.strokeRect(0, barY, W, BAR_H);

    const g   = this.add.graphics().setDepth(51);
    const cy1 = barY + 12;   // row 1 center y
    const cy2 = barY + 32;   // row 2 center y

    const drawRow = (items, cy) => {
      let x = Math.round((W - rowWidth(items)) / 2);
      for (const item of items) {
        if (!item) {
          g.lineStyle(1, 0x2a3a2a, 0.8);
          g.lineBetween(x + DIV_W / 2, barY + 4, x + DIV_W / 2, barY + BAR_H - 4);
          x += DIV_W;
          continue;
        }
        drawLegendIcon(g, item.icon, x + ICON_W / 2, cy, item.color);
        this.add.text(x + ICON_W + GAP, cy - 7, item.label, {
          fontSize: '11px', fontFamily: 'Courier New', color: item.color,
        }).setDepth(52);
        x += ICON_W + GAP + item.label.length * CHAR_W + SEP;
      }
    };

    drawRow(ROW1, cy1);
    drawRow(ROW2, cy2);
  }

  update() {
    const s = this.simState;
    const W = this.cameras.main.width;

    // HUD values
    this.txtResources.setText(`⬡ MERGED  ${s.resources}`);
    const active = s.polecats.filter(p => p.state !== POLECAT_STATES.IDLE).length;
    this.txtPolecats.setText(`◆ POLECATS  ${active}/${s.polecats.length}`);
    const tokenBar = tokenBarStr(s.apiTokens, 1000);
    this.txtTokens.setText(`⚡ TOKENS  ${tokenBar} ${s.apiTokens}`);
    const realBeads = s.beads.filter(b => !b.id.startsWith('bd-'));
    const activeBeads = realBeads.filter(b => !b.depleted).length;
    this.txtBeads.setText(`◈ BEADS  ${activeBeads}/${realBeads.length}`);
    this.txtTick.setText(`tick ${s.tick}`);

    if (s.liveData) {
      const age = s.lastFetch ? Math.floor((Date.now() - s.lastFetch) / 1000) : '?';
      this.txtLive.setText(`● LIVE ${age}s`).setColor('#44ff88');
    } else {
      this.txtLive.setText('○ SIM').setColor('#446644');
    }

    // Event log
    const recent = s.events.slice(-6);
    for (let i = 0; i < 6; i++) {
      const ev = recent[i];
      if (ev) {
        const age = s.tick - ev.tick;
        const alpha = Math.max(0.2, 1 - age / 300);
        this.logLines[i].setText(`> ${ev.msg}`).setAlpha(alpha);
      } else {
        this.logLines[i].setText('').setAlpha(0);
      }
    }

    // Polecat roster
    const lines = s.polecats.slice(0, 8).map(pc => {
      const stateLabel = pc.state.replace(/_/g, ' ').padEnd(24);
      const carry = pc.carrying > 0 ? `carry:${pc.carrying}` : '         ';
      const label = pc.label ? `[${pc.label}]` : '';
      return `${pc.id.padEnd(10)} ${stateLabel} ${carry} ${label}`;
    });
    if (s.polecats.length > 8) lines.push(`  ... +${s.polecats.length - 8} more`);
    this.rosterText.setText(lines.join('\n'));

    // Disable spawn button if not enough tokens
    this.btnSpawn.setAlpha(s.apiTokens >= 50 ? 1 : 0.4);

    // ── Wasteland feed ───────────────────────────────────────────────
    this.updateFeed(s);
  }

  updateFeed(s) {
    const apiFeed = s.feed ?? [];

    // Merge notable sim events between polls so the feed stays alive.
    // s.events uses ticks; approximate ts from current tick distance.
    const NOTABLE = /merged|depleted|stuck|discovered|spawned|convoy|nudged/i;
    const MS_PER_TICK = 16;
    const simFeed = (s.events ?? []).slice(-60)
      .filter(e => NOTABLE.test(e.msg))
      .map(e => ({
        type: 'sim',
        msg: e.msg,
        ts: Date.now() - (s.tick - e.tick) * MS_PER_TICK,
      }));

    // Merge and sort oldest→newest, take last n
    const combined = [...apiFeed, ...simFeed].sort((a, b) => a.ts - b.ts);

    const lines = this.feedLines;
    const n = lines.length;
    const visible = combined.slice(-n);
    const maxChars = this._feedMaxChars ?? 52;

    for (let i = 0; i < n; i++) {
      const entry = visible[i];
      if (!entry) { lines[i].setText('').setAlpha(0); continue; }

      const age = (Date.now() - entry.ts) / 1000;
      const isNew = age < 2;
      const alpha = Math.max(0.15, 1 - age / 120);
      const text = formatFeedLine(entry, maxChars);

      lines[i].setText(text);
      lines[i].setColor(feedColor(entry.type));
      lines[i].setAlpha(isNew ? 1 : alpha);

      if (isNew && entry.ts !== lines[i]._lastTs) {
        lines[i]._lastTs = entry.ts;
        this.tweens.add({
          targets: lines[i],
          alpha: { from: 1, to: alpha },
          duration: 1800,
          ease: 'Cubic.easeOut',
        });
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function hudStyle() {
  return { fontSize: '13px', fontFamily: 'Courier New', color: '#88ffaa' };
}

function tokenBarStr(val, max) {
  const filled = Math.round((val / max) * 4);
  return '[' + '█'.repeat(filled) + '░'.repeat(4 - filled) + ']';
}

function drawLegendIcon(g, type, cx, cy, hexColor) {
  const col = Phaser.Display.Color.HexStringToColor(hexColor).color;
  const dark = Phaser.Display.Color.HexStringToColor(hexColor);
  dark.darken(60);
  const darkCol = dark.color;

  switch (type) {
    case 'rig':
    case 'refinery': {
      // Mini isometric box
      const w = 7, h = 4, raised = 7;
      // left face
      g.fillStyle(darkCol, 1);
      g.fillPoints([
        { x: cx - w, y: cy + h },
        { x: cx - w, y: cy + h - raised },
        { x: cx,     y: cy + h * 2 - raised },
        { x: cx,     y: cy + h * 2 },
      ], true);
      // right face
      g.fillStyle(darkCol, 0.7);
      g.fillPoints([
        { x: cx,     y: cy + h * 2 },
        { x: cx,     y: cy + h * 2 - raised },
        { x: cx + w, y: cy + h - raised },
        { x: cx + w, y: cy + h },
      ], true);
      // top face
      g.fillStyle(col, 1);
      g.fillPoints([
        { x: cx,     y: cy - raised },
        { x: cx + w, y: cy + h - raised },
        { x: cx,     y: cy + h * 2 - raised },
        { x: cx - w, y: cy + h - raised },
      ], true);
      break;
    }
    case 'outpost': {
      // Mini beacon: small box + dot on top
      const w = 5, h = 3, raised = 5;
      g.fillStyle(darkCol, 1);
      g.fillRect(cx - w, cy + h - raised, w, raised);
      g.fillStyle(col, 1);
      g.fillPoints([
        { x: cx,     y: cy - raised - 1 },
        { x: cx + w, y: cy + h - raised - 1 },
        { x: cx,     y: cy + h * 2 - raised - 1 },
        { x: cx - w, y: cy + h - raised - 1 },
      ], true);
      g.fillStyle(col, 0.9);
      g.fillCircle(cx, cy - raised - 4, 2);
      break;
    }
    case 'mayor': {
      const s = 6;
      g.fillStyle(col, 0.25);
      g.fillCircle(cx, cy, s * 2);
      g.fillStyle(col, 1);
      g.fillPoints([
        { x: cx,     y: cy - s },
        { x: cx + s, y: cy },
        { x: cx,     y: cy + s },
        { x: cx - s, y: cy },
      ], true);
      // crown
      g.fillStyle(0xffffff, 0.8);
      g.fillTriangle(cx - 3, cy - s, cx, cy - s - 4, cx + 3, cy - s);
      break;
    }
    case 'polecat':
    case 'carrying':
    case 'stuck': {
      const s = 5;
      g.fillStyle(col, 1);
      g.fillPoints([
        { x: cx,     y: cy - s },
        { x: cx + s, y: cy },
        { x: cx,     y: cy + s },
        { x: cx - s, y: cy },
      ], true);
      if (type === 'carrying') {
        g.fillStyle(0x00ffaa, 0.9);
        g.fillCircle(cx, cy - s - 2, 2);
      }
      if (type === 'stuck') {
        g.fillStyle(0xff0000, 0.9);
        g.fillRect(cx - 3, cy - s - 6, 6, 4);
      }
      break;
    }
    case 'deacon': {
      const s = 6;
      g.lineStyle(1, col, 0.4);
      g.strokeCircle(cx, cy, s + 2);
      g.fillStyle(col, 1);
      g.fillTriangle(cx, cy - s, cx + s, cy + s * 0.6, cx - s, cy + s * 0.6);
      break;
    }
    default: {
      // Bead / crystal diamond
      const s = 6;
      g.fillStyle(col, 0.25);
      g.fillCircle(cx, cy, s + 2);
      g.fillStyle(col, 0.9);
      g.fillPoints([
        { x: cx,         y: cy - s },
        { x: cx + s / 2, y: cy },
        { x: cx,         y: cy + s * 0.6 },
        { x: cx - s / 2, y: cy },
      ], true);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(cx, cy - s * 0.2, s * 0.22);
      break;
    }
  }
}

function feedColor(type) {
  switch (type) {
    case 'bug':     return '#ff5555';
    case 'docs':    return '#ffdd44';
    case 'design':  return '#cc66ff';
    case 'claimed': return '#aaaaaa';
    case 'done':    return '#44aaff';
    case 'rig':     return '#8888ff';
    case 'sim':     return '#336655'; // sim events — dimmer green
    default:        return '#44ff88'; // feature / unknown
  }
}

function formatFeedLine(entry, maxChars = 52) {
  const time = new Date(entry.ts).toTimeString().slice(0, 8);
  const line = `${time}  ${entry.msg}`;
  return line.length > maxChars ? line.slice(0, maxChars - 1) + '…' : line;
}

function makeButton(scene, x, y, label, onClick) {
  const padding = 10;
  const text = scene.add.text(0, 0, label, {
    fontSize: '12px', fontFamily: 'Courier New', color: '#55ff55',
  });
  const w = text.width + padding * 2;
  const h = text.height + 8;

  const bg = scene.add.graphics();
  bg.fillStyle(0x0a1a0a, 0.9);
  bg.fillRect(x, y, w, h);
  bg.lineStyle(1, 0x336633, 0.8);
  bg.strokeRect(x, y, w, h);

  text.setPosition(x + padding, y + 4);

  const zone = scene.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive();
  zone.on('pointerover', () => {
    bg.clear();
    bg.fillStyle(0x1a3a1a, 0.9);
    bg.fillRect(x, y, w, h);
    bg.lineStyle(1, 0x55ff55, 0.9);
    bg.strokeRect(x, y, w, h);
  });
  zone.on('pointerout', () => {
    bg.clear();
    bg.fillStyle(0x0a1a0a, 0.9);
    bg.fillRect(x, y, w, h);
    bg.lineStyle(1, 0x336633, 0.8);
    bg.strokeRect(x, y, w, h);
  });
  zone.on('pointerdown', onClick);

  return text;
}
