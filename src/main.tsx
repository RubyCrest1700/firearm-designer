import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ui';
import './styles.css';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

// The error screen (ErrorBoundary) draws nothing while the page works, so the pre-built home page still matches.
// The home page arrives pre-built (scripts/prerender-home.tsx). React takes over that page as it is, so what's on
// screen stays put. Where this visitor's page differs from it (a saved builds count, say), React quietly redraws
// the page instead; that's the only error hydrating reports. Other addresses hide it (ROUTE_SCRIPT) and draw afresh.
if (root.querySelector('[data-prebuilt]') && !document.documentElement.classList.contains('app-route')) hydrateRoot(root, app, { onRecoverableError: () => {} });
else createRoot(root).render(app);
