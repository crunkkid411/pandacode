import { createRoot } from 'react-dom/client';
import './hub.css';
import { App } from './app';

createRoot(document.getElementById('hub-root')!).render(<App />);
