import Phaser from 'phaser';
import { createSim } from './sim.js';

// Create simulation state first — shared between scenes
const simState = createSim();

// ── Inline scene classes with simState captured in closure ──────────

import { MainScene as MainSceneBase } from './scenes/MainScene.js';
import { UIScene as UISceneBase } from './scenes/UIScene.js';

class MainScene extends MainSceneBase {
  init() { super.init({ simState }); }
}

class UIScene extends UISceneBase {
  init() { super.init({ simState }); }
}

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#0a0a0a',
  scene: [MainScene, UIScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
};

const game = new Phaser.Game(config);

// Expose for browser console debugging
window.gascraft = { game, simState };
