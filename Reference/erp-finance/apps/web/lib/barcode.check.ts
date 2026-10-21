import assert from 'node:assert/strict';
import { addScannedLine, findScannedProduct } from './barcode';

const products = [
  { id: 'a', sku: 'SKU-1', barcode: '123456', status: 'ACTIVE', salePrice: '10' },
  { id: 'b', sku: 'SKU-2', barcode: '', status: 'ACTIVE', salePrice: '4' },
  { id: 'c', sku: 'OLD', barcode: '999', status: 'INACTIVE', salePrice: '1' },
];

assert.equal(findScannedProduct(products, ' 123 456 ')?.id, 'a');
assert.equal(findScannedProduct(products, 'sku-2')?.id, 'b');
assert.equal(findScannedProduct(products, '999'), null);
assert.equal(findScannedProduct(products, ''), null);

const blank = () => ({ key: 'new', productId: '', quantity: '1', unitPrice: '', discount: '' });
const first = addScannedLine([blank()], 'a', '10', blank());
assert.equal(first.length, 1);
assert.equal(first[0].productId, 'a');
assert.equal(first[0].unitPrice, '10');
const second = addScannedLine(first, 'a', '10', blank());
assert.equal(second[0].quantity, '2');
const third = addScannedLine(second, 'b', '4', blank());
assert.equal(third.length, 2);
assert.equal(third[1].productId, 'b');

console.log('barcode scan checks passed');
