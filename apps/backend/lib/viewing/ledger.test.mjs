import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reserve, report, release, finalCharge, heldCharge, size, GRACE_BLOCKS } from './ledger.ts';
const fresh = (funded = 20_000_000n) => ({ totalBlocks: 1440, price: 20_000_000n, funded, watched: [], reserved: [], unreported: [] });
const deliver = (ledger, range) => { const result = reserve(ledger, range); assert.equal(result.ok, true); return result.ledger; };
test('$20 / 120 minutes: 18 minutes costs $3 and leaves $2 from a $5 deposit', () => {
 let l = fresh(5_000_000n);
 for (let i=0;i<216;i+=6) l=report(deliver(l,[i,i+6]),[[i,i+6]]);
 assert.equal(finalCharge(l),3_000_000n); assert.equal(l.funded-finalCharge(l),2_000_000n);
});
test('all blocks cost exactly price; replay and ABR delivery are idempotent', () => {
 let l=fresh(); for(let i=0;i<1440;i+=6) l=report(deliver(l,[i,i+6]),[[i,i+6]]);
 assert.equal(finalCharge(l),l.price); assert.equal(reserve(l,[0,6]).changed,false);
 l=fresh(); l=deliver(l,[0,6]); assert.equal(reserve(l,[0,6]).changed,false); assert.equal(heldCharge(l),83_334n);
});
test('pause finalizes nothing; seeks do not bill skipped content; reports cannot invent delivery', () => {
 let l=deliver(fresh(),[0,6]); assert.equal(finalCharge(report(l,[])),0n);
 l=deliver(l,[100,106]); l=report(l,[[100,106],[200,300]]);
 assert.equal(size(l.watched),6); assert.equal(size(l.unreported),6);
});
test('silent attacker pays every delivered block beyond grace', () => {
 let l=fresh(); for(let i=0;i<120;i+=6) l=release(deliver(l,[i,i+6]));
 assert.equal(size(l.unreported),GRACE_BLOCKS); assert.equal(size(l.watched),60);
 assert.equal(finalCharge(l),833_334n);
 l=report(l,[[60,120]]); assert.equal(size(l.unreported),0); assert.equal(size(l.watched),120);
});
test('funding and ahead denials remain distinct', () => {
 assert.deepEqual(reserve(fresh(1n),[0,1]),{ok:false,reason:'funds'});
 assert.deepEqual(reserve(deliver(fresh(),[0,12]),[12,13]),{ok:false,reason:'ahead'});
});
