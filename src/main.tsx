import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import RequireApiKey from './components/RequireApiKey.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RequireApiKey>
      <App />
    </RequireApiKey>
  </StrictMode>,
);
