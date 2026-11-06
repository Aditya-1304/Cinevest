import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
// Only persistence transport and Arc are replaced; release selection and ledger writes run unchanged.
const stub=body=>`data:text/javascript,${encodeURIComponent(body)}`;
const stubs={
 '@/lib/db':stub('export const createDatabase=()=>globalThis.__viewDb;'),
 '@/lib/media/arc':stub('export const readCampaignMedia=async()=>globalThis.__media;'),
 './arc':stub('export const readViewingChain=async()=>globalThis.__chain; export const signViewingReceipt=async()=>"0x"; export const submitViewingReceipt=async()=>{};'),
};
registerHooks({resolve(s,c,next){if(stubs[s] && (s!=='./arc'||c.parentURL?.includes('/viewing/')))return {url:stubs[s],shortCircuit:true};return next(s==='next/server'?'next/server.js':s,c);}});
const schema=await import('@/lib/db/schema');
const {playbackIdHash}=await import('@/lib/media/release');
process.env.SESSION_SECRET='v'.repeat(40);
process.env.APP_URL='http://localhost:3000';
const service=await import('./service.ts');
const {GET: mediaRoute}=await import('../../app/api/viewing/media/[chainId]/[campaign]/[session]/[...path]/route.ts');
const {setSessionCookie}=await import('@/lib/auth/session');
const pg=new PGlite();const db=drizzle(pg,{schema});globalThis.__viewDb=db;
await migrate(db,{migrationsFolder:fileURLToPath(new URL('../../drizzle',import.meta.url))});
const campaign='0x'+'ab'.repeat(20),wallet='0x'+'cd'.repeat(20),pb='viewingTestPlayback';
const key={arcChainId:'5042002',campaign,wallet};
globalThis.__media={released:true,paid:false,onchainHash:playbackIdHash(pb),watchPrice:20_000_000n};
globalThis.__chain={metered:true,balance:5_000_000n,charged:0n,sequence:0,exitAt:null,fullAccess:false};
const [upload]=await db.insert(schema.mediaUploads).values({arcChainId:key.arcChainId,campaignAddress:campaign,attemptKey:'view-test',ownerWallet:wallet,status:'ready',playbackId:pb,durationSeconds:7200}).returning();
await db.insert(schema.campaignMediaRelease).values({arcChainId:key.arcChainId,campaignAddress:campaign,mediaUploadId:upload.id,playbackIdHash:playbackIdHash(pb)});
const denied=(status,code)=>e=>e.status===status&&e.code===code;
test('takeover, copied session, HTTP funding/ahead errors, expiry and closing receipt',async()=>{
 const first=await service.startSession(key),second=await service.startSession(key);
 await assert.rejects(service.authorizeDelivery(key,first.sessionId),denied(409,'session_replaced'));
 await assert.rejects(service.authorizeDelivery({...key,wallet:'0x'+'ef'.repeat(20)},second.sessionId),denied(409,'session_expired'));
 await service.authorizeDelivery(key,second.sessionId,{start:0,end:60});
 await assert.rejects(service.authorizeDelivery(key,second.sessionId,{start:60,end:65}),denied(503,'ahead_of_playback'));
 await service.heartbeat(key,second.sessionId,{positionSeconds:60,played:[[0,60]]});
 await Promise.all([service.authorizeDelivery(key,second.sessionId,{start:60,end:65}),service.authorizeDelivery(key,second.sessionId,{start:65,end:70})]);
 assert.equal((await service.readAccount(key)).reserved[0][1],14);
 await db.update(schema.viewingAccounts).set({onchainBalance:'1'});
 await assert.rejects(service.authorizeDelivery(key,second.sessionId,{start:70,end:75}),denied(503,'insufficient_balance'));
 await db.update(schema.viewingAccounts).set({leaseUntil:new Date(0)});
 await assert.rejects(service.authorizeDelivery(key,second.sessionId),denied(409,'session_expired'));
 const close=await service.closeSession(key,second.sessionId,{positionSeconds:60,played:[]});assert.equal(close.receipt.cumulativeCharge,'166667');
 await assert.rejects(service.startSession(key),denied(409,'closing'));
});
test('exit pending refuses session; never-played deposit receives zero-charge refund receipt',async()=>{
 globalThis.__chain.exitAt=new Date();await assert.rejects(service.startSession(key),denied(409,'exit_pending'));globalThis.__chain.exitAt=null;
 await db.delete(schema.viewingAccounts);
 const grant=await service.closeSession(key,undefined,{positionSeconds:0,played:[]});assert.equal(grant.receipt.cumulativeCharge,'0');assert.equal(grant.receipt.finalForWithdrawal,true);
});
test('copied gateway URL is refused for another authenticated wallet',async()=>{
 await db.delete(schema.viewingAccounts);
 const session=await service.startSession(key);
 let cookie='';await setSessionCookie({cookies:{set:(name,value)=>{cookie=`${name}=${value}`;}}},'0x'+'ef'.repeat(20));
 const response=await mediaRoute(new Request('http://localhost:3001/api/viewing/media/x',{headers:{cookie}}),{params:Promise.resolve({chainId:key.arcChainId,campaign,session:session.sessionId,path:['master.m3u8']})});
 assert.equal(response.status,409);assert.equal((await response.json()).error,'session_expired');
});
test.after(()=>pg.close());
