import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
const keys=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
Object.assign(process.env,{MUX_SIGNING_KEY_ID:'test',MUX_SIGNING_PRIVATE_KEY:Buffer.from(keys.privateKey).toString('base64')});
const {masterPlaylist,loadRendition,upstreamUrl}=await import('./hls.ts');
let body='';
globalThis.fetch=async()=>new Response(body);
test('gateway rewrites master, maps and segments without exposing upstream credentials',async()=>{
 body='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nhttps://stream.mux.com/r.m3u8?token=secret';
 const master=await masterPlaylist('sealed'); assert.doesNotMatch(master,/mux\.com|token=|secret/);
 body='#EXTM3U\n#EXT-X-MAP:URI="https://stream.mux.com/init.mp4?token=secret"\n#EXTINF:6,\nhttps://stream.mux.com/s.m4s?token=secret\n#EXT-X-ENDLIST';
 const rendition=await loadRendition('sealed',0); assert.doesNotMatch(rendition.text,/mux\.com|token=|secret/); assert.equal(rendition.segments[0].end,6);
});
test('unknown URI tags and non-Mux hosts fail closed',async()=>{
 body='#EXTM3U\n#EXT-X-UNKNOWN:URI="https://stream.mux.com/leak"';
 await assert.rejects(masterPlaylist('unknown'),/Unsupported/);
 for(const url of ['https://evil.example/a','https://mux.com.evil.example/a','http://stream.mux.com/a']) assert.throws(()=>upstreamUrl(url,'https://stream.mux.com'),/host/);
});
test('missing segment duration fails closed',async()=>{
 body='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nr.m3u8'; await masterPlaylist('missing-duration');
 body='#EXTM3U\ns.ts'; await assert.rejects(loadRendition('missing-duration',0),/duration/);
});
test('unknown URI syntax and secondary MAP URI cannot bypass sealing',async()=>{
 body='#EXTM3U\n#EXT-X-UNKNOWN:URI=https://stream.mux.com/leak';
 await assert.rejects(masterPlaylist('unknown-unquoted'),/Unsupported/);
 body='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nr.m3u8';await masterPlaylist('extra-map-uri');
 body='#EXTM3U\n#EXT-X-MAP:URI="init.mp4",OTHER-URI="https://stream.mux.com/leak"';
 await assert.rejects(loadRendition('extra-map-uri',0),/Unsupported/);
});
