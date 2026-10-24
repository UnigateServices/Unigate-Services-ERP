import { execFileSync } from 'child_process';
import path from 'path';

/**
 * The finance app's own checks (Reference/erp-finance, run with `npx tsx <file>`), moved with
 * the code they cover. They are plain scripts that throw on a failed assertion, so each runs as
 * its own process, exactly as in the original. F3d brings the cash-flow and reconciliation checks.
 */
const CHECKS = ['ledger/fx-journal.check.ts', 'ledger/inventory-nrv.check.ts', 'advances/custody-book.check.ts'];

describe('original finance checks', () => {
  jest.setTimeout(120000);

  it.each(CHECKS)('%s passes', (file) => {
    const output = execFileSync('npx', ['tsx', path.join(__dirname, file)], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(output).toMatch(/ok|passed/);
  });
});
