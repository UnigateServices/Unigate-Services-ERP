import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { releaseAllowance, rewoundUnitCost, targetAllowance, unitWriteDown } from './inventory-nrv';

const D = (value: number) => new Prisma.Decimal(value);

assert.equal(unitWriteDown(D(100), D(80)).toString(), '20');
assert.equal(unitWriteDown(D(80), D(100)).toString(), '0');
assert.equal(targetAllowance(D(10), D(100), D(80)).toString(), '200');
assert.equal(targetAllowance(D(0), D(100), D(80)).toString(), '0');
assert.equal(releaseAllowance(D(200), D(10), D(4), D(400)).toString(), '80');
assert.equal(releaseAllowance(D(200), D(10), D(4), D(50)).toString(), '50');
assert.equal(releaseAllowance(D(0), D(10), D(4), D(400)).toString(), '0');
assert.equal(rewoundUnitCost(D(20), D(150), D(10), D(1000))!.toString(), '200');
assert.equal(rewoundUnitCost(D(10), D(100), D(10), D(1000)), null);
assert.equal(rewoundUnitCost(D(10), null, D(4), D(400)), null);

console.log('inventory-nrv ok');
