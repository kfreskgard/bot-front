import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './tokens.css';
import './base.css';
import './ui/ui.css';
import './ui/table.css';
import './pages/positions/positions.css';
import './shell/shell.css';
import './login.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
