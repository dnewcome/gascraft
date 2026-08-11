import Phaser from 'phaser';
import { createSim } from './sim.js';
import { startPolling } from './datasources/github.js';
import { applyWasteland } from './datasources/mapper.js';
import { MainScene as MainSceneBase } from './scenes/MainScene.js';
import { UIScene as UISceneBase } from './scenes/UIScene.js';

const simState = createSim();

// Start pulling live wasteland data immediately.
// applyWasteland merges it into simState in-place — the game loop picks it up
// on the next tick with no special wiring needed.
// 60s rather than 30s: unauthenticated GitHub search allows 10 req/min per IP
// and each poll spends 3.
const stopPolling = startPolling((data) => {
  applyWasteland(simState, data);
  simState.lastFetch = data.ts;
}, 60_000);

window.addEventListener('beforeunload', stopPolling);

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

window.gascraft = { game, simState, stopPolling };
