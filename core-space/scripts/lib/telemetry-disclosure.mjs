// Canonical consent disclosure shared with initialization and channel tools. Diagnostics are structured and redacted; memory, profile, project names and original content are excluded. Consent can be withdrawn; stable never reports proactively.
export const UPLOAD_SCOPE = "version, channel, anonymous device ID, and error timestamps, script names, kinds, counts, and redacted message snippets";

export const TELEMETRY_DISCLOSURE = [
  `(Structured diagnostics only: ${UPLOAD_SCOPE}; excludes memory, profile, project names and original content.)`,
  "(Manual reports are published to Origin GitHub Issues and may be read by others. Review aipa-report --dry-run before sending.)",
  "(Disable anytime with aipa-channel --telemetry off; stable never reports proactively.)",
];
