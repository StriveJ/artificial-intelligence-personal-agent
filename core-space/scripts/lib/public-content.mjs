// public content
const SECRET = /\b(?:export\s+)?(?:(?:const|let|var)\s+)?["']?(?:password|passwd|secret|api[_-]?key|access[_-]?token)["']?\s*[:=]\s*(["'])([^"'\r\n]{8,})\1/gi;
const PLACEHOLDER = /^(YOUR_[A-Z_]+|<[^>]+>|env:[A-Z_][A-Z0-9_]*|CHANGE_ME|PLACEHOLDER)$/;
export function publicContentViolations(text) {
  const source = String(text), violations = [];
  if ([...source.matchAll(SECRET)].some(m => !PLACEHOLDER.test(m[2]))) violations.push("hardcoded secret");
  if (/-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(source)) violations.push("private key");
  if (/\beval\s*\(/.test(source)) violations.push("dangerous eval code");
  return violations;
}
