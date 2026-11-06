import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './styles.css';
import { App } from './App';
import { restoreTheme } from './chrome';

restoreTheme();
const root = document.getElementById('root');
if (!root) throw new Error('The page has no #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
