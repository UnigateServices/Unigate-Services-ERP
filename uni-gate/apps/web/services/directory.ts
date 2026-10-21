export function passwordIssue(password: string) {
  if (password.length < 8) return 'short' as const;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'weak' as const;
  return null;
}

export function codeIssue(code: string) {
  return /^[a-z0-9-]{2,32}$/.test(code) ? null : 'invalid';
}

export function roleKeyIssue(key: string) {
  return /^[A-Z][A-Z0-9_]{1,40}$/.test(key) ? null : 'invalid';
}
