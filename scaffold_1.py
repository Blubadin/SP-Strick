import os

base_dir = "c:/Users/Sport-Science-R3909/Documents/Sp strick"

files = {
    "src/index.css": """
:root {
  --bg-primary: #0B0D10;
  --bg-secondary: #12151A;
  --surface: #181C22;
  --surface-hover: #20252D;
  --text-primary: #F5F5F7;
  --text-secondary: #9CA3AF;
  --border: rgba(255,255,255,0.10);
  --accent: #2997FF;
  --success: #34C759;
  --danger: #FF3B30;
  
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, "Helvetica Neue", Arial, sans-serif;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-family);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow: hidden; /* Prevent scrolling during live scout */
  user-select: none; /* Prevent accidental text selection */
}

a {
  color: var(--accent);
  text-decoration: none;
}

button {
  font-family: inherit;
  cursor: pointer;
  border: none;
  background: none;
  color: inherit;
}
""",

    "src/main.tsx": """
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import './index.css'
import './i18n'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
""",
    
    "src/app/App.tsx": """
import React, { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useControllerStore } from '../core/controller/ControllerStore';
import { startGamepadPolling, stopGamepadPolling } from '../core/controller/GamepadPoller';
import { listenForGamepadConnections } from '../core/controller/GamepadDetector';

export default function App() {
  useEffect(() => {
    listenForGamepadConnections();
    startGamepadPolling();
    return () => {
      stopGamepadPolling();
    };
  }, []);

  return (
    <RouterProvider router={router} />
  );
}
""",
    "src/app/router.tsx": """
import { createBrowserRouter } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import SetupPage from '../pages/SetupPage';
import ControllerPage from '../pages/ControllerPage';
import ScoutPage from '../pages/ScoutPage';
import ReviewPage from '../pages/ReviewPage';
import SettingsPage from '../pages/SettingsPage';

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/setup', element: <SetupPage /> },
  { path: '/controller', element: <ControllerPage /> },
  { path: '/scout', element: <ScoutPage /> },
  { path: '/review', element: <ReviewPage /> },
  { path: '/settings', element: <SettingsPage /> },
]);
"""
}

for path, content in files.items():
    full_path = os.path.join(base_dir, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
