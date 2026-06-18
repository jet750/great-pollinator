import { useEffect, useRef } from 'react';
import PollinatorGame from './game/main.js';
import styles from './PollinatorPage.module.css';

// Full-screen canvas host for The Great Pollinator. Renders outside RootLayout
// (no Nav / Footer). The game engine owns all rendering and input; this
// component only mounts the canvas and manages the engine lifecycle.
export default function PollinatorPage() {
  const canvasRef = useRef(null);

  useEffect(() => {
    document.title = 'The Great Pollinator — Jaxon Travis';
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const game = new PollinatorGame(canvas);
    game.start();

    return () => {
      game.destroy();
    };
  }, []);

  return (
    <div className={styles.wrapper}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
