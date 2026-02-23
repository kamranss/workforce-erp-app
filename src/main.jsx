import './styles/app.css';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

if (typeof document !== 'undefined') {
  document.body.dataset.auth = 'anon';
  document.body.dataset.role = 'anon';
}

const root = createRoot(document.getElementById('root'));
root.render(
  // Disable StrictMode during migration: legacy boot relies on a single mount.
  <App />
);
