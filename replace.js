import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/bg-slate-50/g, 'bg-bg');
content = content.replace(/text-slate-900/g, 'text-text');
content = content.replace(/bg-white\/60/g, 'bg-panel');
content = content.replace(/border-slate-200/g, 'border-border');
content = content.replace(/bg-white/g, 'bg-btn-bg');
content = content.replace(/text-slate-700/g, 'text-btn-text');
content = content.replace(/border-slate-800/g, 'border-btn-border');
content = content.replace(/bg-slate-900/g, 'bg-primary');
content = content.replace(/hover:bg-slate-800/g, 'hover:bg-primary-hover');
content = content.replace(/text-blue-600/g, 'text-accent');
content = content.replace(/bg-blue-600/g, 'bg-accent');
content = content.replace(/text-slate-800/g, 'text-text');

fs.writeFileSync('src/App.tsx', content);
