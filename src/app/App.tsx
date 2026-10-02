import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { startGamepadPolling, stopGamepadPolling } from '../core/controller/GamepadPoller';
import { listenForGamepadConnections } from '../core/controller/GamepadDetector';

export default function App() {
  useEffect(() => {
    const cleanupDetector = listenForGamepadConnections();
    startGamepadPolling();

    return () => {
      cleanupDetector();
      stopGamepadPolling();
    };
  }, []);

  return <RouterProvider router={router} />;
}
