export function detectToolFromEnv(env = {}) {
  const candidates = [];
  if (String(env.CLAUDECODE) === '1') candidates.push('claude-code');
  if (env.CODEX_SESSION_ID || env.CODEX_THREAD_ID || String(env.CODEX_CI) === '1') {
    candidates.push('codex');
  }
  if (env.CODEBUDDY_PROJECT_DIR || env.CODEBUDDY_SESSION_ID) candidates.push('workbuddy');
  const unique = [...new Set(candidates)];
  if (unique.length === 1) {
    return { status: 'ok', tool: unique[0], method: 'env', candidates: unique };
  }
  if (unique.length > 1) {
    return { status: 'ambiguous', candidates: unique };
  }
  return { status: 'unknown', candidates: [] };
}

export function detectTool() {
  return detectToolFromEnv(process.env);
}
