import assert from 'node:assert/strict';
import { Currency, Prisma } from '@prisma/client';
import { revaluePosition } from './fx-journal';

const D = (value: number | string) => new Prisma.Decimal(value);

const long = revaluePosition(Currency.USD, D(320000), D(20), D(20000));
assert.equal(long?.closing.toFixed(2), '16.00');
assert.equal(long?.gain.toFixed(2), '-4.00');

const flat = revaluePosition(Currency.USD, D(0), D(-1), D(20000));
assert.equal(flat, null);

const short = revaluePosition(Currency.USD, D(-15000), D(-1), D(20000));
assert.equal(short?.closing.toFixed(2), '-0.75');
assert.equal(short?.gain.toFixed(2), '0.25');

console.log('fx revaluation checks passed');
