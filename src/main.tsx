import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App.js';
import './index.css';
import './system/status.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element is missing');
ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
