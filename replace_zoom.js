import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/border border-border overflow-hidden z-10 cursor-default/g, 'border-2 border-btn-border overflow-hidden z-10 cursor-default');

fs.writeFileSync('src/App.tsx', content);
