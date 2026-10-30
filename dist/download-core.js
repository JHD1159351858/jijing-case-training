(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SourceDownload = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  function validateManifest(m) {
    const invalid = () => { throw new Error('下载清单不完整，请刷新后重试。'); };
    if (!m || !/^[a-zA-Z0-9_-]+\.zip$/.test(m.filename) || !Number.isSafeInteger(m.size) || m.size <= 0 || m.size > 512*1024*1024 || !/^[a-f0-9]{64}$/.test(m.sha256) || !Array.isArray(m.parts) || !m.parts.length || m.parts.length > 100) invalid();
    let size=0; const urls=new Set();
    for (const p of m.parts) {
      if (!p || !/^downloads\/source-\d+\.part$/.test(p.url) || urls.has(p.url) || !Number.isSafeInteger(p.size) || p.size <= 0 || p.size > 16*1024*1024 || !/^[a-f0-9]{64}$/.test(p.sha256)) invalid();
      urls.add(p.url);size+=p.size;
    }
    if (size!==m.size) invalid();
    return m;
  }
  async function sha256(bytes) {
    const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function assemble(chunks,m) {
    validateManifest(m);
    if(chunks.length!==m.parts.length)throw new Error('下载不完整，请重试。');
    const output=new Uint8Array(m.size);let offset=0;
    for(let i=0;i<chunks.length;i++){
      const bytes=chunks[i] instanceof Uint8Array?chunks[i]:new Uint8Array(chunks[i]);
      if(bytes.byteLength!==m.parts[i].size || await sha256(bytes)!==m.parts[i].sha256)throw new Error('文件校验未通过，请确认已登录后重试。');
      output.set(bytes,offset);offset+=bytes.length;
    }
    if(await sha256(output)!==m.sha256)throw new Error('完整文件校验未通过，请重新下载。');
    return output;
  }
  return {validateManifest,sha256,assemble};
});
