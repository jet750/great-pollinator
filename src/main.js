// src/main.js — standalone entry point for pollinator.jaxontravis.com
// Mounts the game canvas into #game-container and starts the engine.

import PollinatorGame from './game/main.js';

// Wait for DOM to be ready
window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container');
  if (!container) {
    console.error('[Pollinator] #game-container not found in DOM');
    return;
  }

  // Create canvas sized to fill the container
  const canvas = document.createElement('canvas');
  canvas.style.width  = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none'; // prevent browser scroll/zoom over canvas
  container.appendChild(canvas);

  // Instantiate and start the game engine
  const game = new PollinatorGame(canvas);
  game.start();

  // Clean up on page unload
  window.addEventListener('unload', () => game.destroy());
});
