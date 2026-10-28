import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const instanceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const instanceProject = basename(instanceRoot);
const eventName = process.argv[2] || '';
let stdin = '';
try { stdin = readFileSync(0, 'utf8'); } catch {}
let input = {};
try { if (stdin.trim()) input = JSON.parse(stdin); } catch {}
const hookName = input.hook_event_name || eventName;
let scriptsDir = '';
scriptsDir = join(instanceRoot, 'core-space', 'scripts');
function run(args, input) {
  if (!scriptsDir) return;
  const opts = { cwd: instanceRoot, stdio: ['pipe','pipe','inherit'] };
  if (input != null) opts.input = input;
  try { execFileSync('node', [join(scriptsDir, args[0]), ...args.slice(1)], opts); }
  catch (e) {
    const at = new Date().toISOString();
    const msg = String(e && e.message || e);
    console.error(`aipa session hook: ${hookName} failed; see state/session-hook-errors.log`);
    try { mkdirSync(join(instanceRoot, 'state'), { recursive: true }); appendFileSync(join(instanceRoot, 'state', 'session-hook-errors.log'), `${at} ${hookName} ${msg}\n`, 'utf8'); } catch {}
    // Shared error sink; keep the errorLine format from core-space/scripts/lib/error-sink.mjs.
    // Inline this fallback so failure logging survives broken scripts; a failed static import would disable the hook itself.
    try {
      mkdirSync(join(instanceRoot, 'state'), { recursive: true });
      appendFileSync(join(instanceRoot, 'state', 'errors.log'), `${JSON.stringify({ ts: at, scope: 'hook', message: `${hookName}: ${msg}` })}\n`, 'utf8');
    } catch {}
  }
}
let sid = '';
try { sid = readFileSync(join(instanceRoot, 'state', 'current-sid'), 'utf8').trim(); } catch {}
function add(type, data) {
  const args = ['aipa-event.mjs', 'add', '--root', instanceRoot, '--type', type, '--project', instanceProject, '--tool', 'claude-code', '--writer', 'hook'];
  if (input.session_id) args.push('--host-session-id', String(input.session_id));
  else if (sid) args.push('--sid', sid);
  const identity = input.message_id || input.uuid || input.tool_use_id;
  if (identity) args.push('--event-id', `${type}:${identity}`);
  run(args, data);
}
switch (hookName) {
  case 'SessionStart': {
    const args=['aipa-session.mjs','resume','--root',instanceRoot,'--project',instanceProject,'--tool','claude-code','--input-writer','hook'];
    if(input.session_id) args.push('--host-session-id',String(input.session_id));
    else if(input.source==='startup') args.push('--new');
    run(args);
    break;
  }
  case 'UserPromptSubmit': add('user_message', input.prompt || ''); break;
  case 'PreToolUse': add('tool_call', [input.tool_name, JSON.stringify(input.tool_input || {})].filter(Boolean).join(' ')); break;
  case 'PostToolUse': add('tool_result', [input.tool_name, JSON.stringify(input.tool_response || {})].filter(Boolean).join(' ')); break;
  case 'Stop':
    if(input.last_assistant_message) add('assistant_message',String(input.last_assistant_message));
    run(['aipa-distill.mjs', 'confirm', '--auto', '--root', instanceRoot]);
    break;
  case 'SessionEnd': add('session_end',input.reason||''); break;
  case 'PreCompact': /* Daily event files need no compaction */ break;
}
process.exit(0);
