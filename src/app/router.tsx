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
