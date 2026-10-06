/** Same rule the foundation forms already use: 8 characters, one letter, one digit. */
export function passwordIssue(password: string): 'short' | 'weak' | null {
  if (password.length < 8) return 'short';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'weak';
  return null;
}
