const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const core = require('../dist/download-core.js');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fixture() { const chunks = [Uint8Array.from([1,2,3]),Uint8Array.from([4,5])]; return { chunks, manifest: { filename:'case-training-demo-source.zip',size:5,sha256:hash(Buffer.from([1,2,3,4,5])),parts:chunks.map((b,i)=>({url:`downloads/source-0${i+1}.part`,size:b.length,sha256:hash(b)})) } }; }
test('accepts a complete same-origin package manifest',()=>assert.equal(core.validateManifest(fixture().manifest).size,5));
test('rejects external download URLs and traversal',()=>{for(const url of ['https://other.test/file','../secret','downloads/../secret','/downloads/source-01.part']) { const {manifest}=fixture();manifest.parts[0].url=url;assert.throws(()=>core.validateManifest(manifest),/下载清单/); }});
test('rejects mismatched total sizes and invalid checksums',()=>{const {manifest}=fixture();manifest.size=6;assert.throws(()=>core.validateManifest(manifest),/下载清单/);manifest.size=5;manifest.sha256='no';assert.throws(()=>core.validateManifest(manifest),/下载清单/);});
test('rejects repeated part URLs and unsafe filenames',()=>{const {manifest}=fixture();manifest.parts[1].url=manifest.parts[0].url;assert.throws(()=>core.validateManifest(manifest),/下载清单/);manifest.parts[1].url='downloads/source-02.part';manifest.filename='../code.zip';assert.throws(()=>core.validateManifest(manifest),/下载清单/);});
test('assembles and verifies the full package bytes',async()=>{const {chunks,manifest}=fixture();assert.deepEqual(Array.from(await core.assemble(chunks,manifest)),[1,2,3,4,5]);});
test('rejects corrupt parts even when byte lengths match',async()=>{const {chunks,manifest}=fixture();chunks[0][0]=9;await assert.rejects(core.assemble(chunks,manifest));});
test('rejects truncation and reversed part ordering',async()=>{const {chunks,manifest}=fixture();await assert.rejects(core.assemble([chunks[0]],manifest));await assert.rejects(core.assemble(chunks.slice().reverse(),manifest));});
