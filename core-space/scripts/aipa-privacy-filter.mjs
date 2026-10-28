// privacy filter
import { loadPrivacyPolicy, privacyDecision } from './lib/privacy-policy.mjs';
function arg(name){ const i=process.argv.indexOf('--'+name); return i>=0 ? process.argv[i+1] : ''; }
const root=arg('root')||'.';
const text=arg('text')||'';
const tags=(arg('tags')||'').split(',').map(s=>s.trim()).filter(Boolean);
try { console.log(privacyDecision(loadPrivacyPolicy(root), text, tags)); }
catch (error) { console.error(`Privacy decision failed: ${error.message}`); process.exitCode = 1; }
