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
    // Transparent overlay — renders above MainScene
    this.cameras.main.setBackgroundColor(0x00000000);
    this.scene.bringToTop();

    const W = this.scale.width;
    const H = this.scale.height;

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

    // HUD counters
    this.txtResources  = this.add.text(160, 8, '', hudStyle());
    this.txtPolecats   = this.add.text(340, 8, '', hudStyle());
    this.txtTokens     = this.add.text(520, 8, '', hudStyle());
    this.txtBeads      = this.add.text(680, 8, '', hudStyle());
    this.txtTick       = this.add.text(W - 120, 8, '', { ...hudStyle(), color: '#446644' });

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

    // ── Command buttons ──────────────────────────────────────────────
    const btnY = panelY + panelH + 8;
    // Spawn polecat button
    this.btnSpawn = makeButton(this, 20, H - 44, 'SPAWN POLECAT  [50 tokens]', () => {
      spawnPolecat(this.simState);
    });

    // Create convoy button
    this.btnConvoy = makeButton(this, 240, H - 44, 'FORM CONVOY', () => {
      createConvoy(this.simState);
    });

    // ── Polecat state legend ─────────────────────────────────────────
    const legX = W - 180;
    const legY = H - 40;
    this.add.text(legX, legY, '■ idle  ■ working  ■ carrying  ■ stuck', {
      fontSize: '9px', fontFamily: 'Courier New',
      color: '#225522',
    }).setAlpha(0.7);

  }

  update() {
    const s = this.simState;
    const W = this.scale.width;

    // HUD values
    this.txtResources.setText(`⬡ MERGED  ${s.resources}`);
    const active = s.polecats.filter(p => p.state !== POLECAT_STATES.IDLE).length;
    this.txtPolecats.setText(`◆ POLECATS  ${active}/${s.polecats.length}`);
    const tokenBar = tokenBarStr(s.apiTokens, 1000);
    this.txtTokens.setText(`⚡ TOKENS  ${tokenBar} ${s.apiTokens}`);
    const activeBeads = s.beads.filter(b => !b.depleted).length;
    this.txtBeads.setText(`◈ BEADS  ${activeBeads}/${s.beads.length}`);
    this.txtTick.setText(`tick ${s.tick}`);

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
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function hudStyle() {
  return { fontSize: '13px', fontFamily: 'Courier New', color: '#88ffaa' };
}

function tokenBarStr(val, max) {
  const filled = Math.round((val / max) * 10);
  return '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + ']';
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
