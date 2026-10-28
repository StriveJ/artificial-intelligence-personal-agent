// privacy
import { loadPrivacyPolicy, privacyDecision } from './lib/privacy-policy.mjs';
const arg = name => { const i = process.argv.indexOf('--' + name); return i < 0 ? '' : process.argv[i + 1] || ''; };
try { console.log(privacyDecision(loadPrivacyPolicy(arg('root') || '.'), arg('text'))); }
catch (error) { console.error(`Privacy decision failed: ${error.message}`); process.exitCode = 1; }
