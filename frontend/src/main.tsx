import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import * as Sentry from '@sentry/react';

// Initialize Sentry for error tracking
Sentry.init({
  dsn: "https://d0c8efbe50e7b8bf39783f98889de0fb@o450700000000000.ingest.sentry.io/450700000000000",
  integrations: [
    new Sentry.BrowserTracing(),
  ],
  tracesSampleRate: 1.0,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
