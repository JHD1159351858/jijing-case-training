(function () {
  'use strict';
  const button=document.getElementById('download-source'),label=document.getElementById('button-label'),status=document.getElementById('download-status'),bar=document.getElementById('download-progress');
  let manifest=null,busy=false;
  function message(text,type=''){status.textContent=text;status.className='status '+type;}
  async function readManifest(){
    const response=await fetch('downloads/manifest.json',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw new Error('暂时无法读取文件，请刷新或确认已登录。');
    const data=SourceDownload.validateManifest(await response.json());
    document.getElementById('package-size').textContent=(data.size/1024/1024).toFixed(1);
    document.getElementById('package-version').textContent=data.version||'当前版本';
    manifest=data;button.disabled=false;label.textContent='下载完整项目源码';message('文件已就绪 · 含全部教学素材');
  }
  async function download(){
    if(busy)return;busy=true;button.disabled=true;label.textContent='正在准备文件…';bar.style.width='0%';
    try{
      if(!manifest)await readManifest();button.disabled=true;
      const chunks=[];let loaded=0;
      for(const part of manifest.parts){
        const response=await fetch(part.url,{credentials:'same-origin',cache:'no-store'});
        if(!response.ok)throw new Error('文件获取失败，请确认登录状态后重试。');
        if(response.body){const reader=response.body.getReader();const pieces=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>part.size){await reader.cancel();throw new Error('文件信息不符，请刷新后重试。');}pieces.push(value);bar.style.width=Math.min(95,(loaded+size)/manifest.size*95)+'%';message(`正在获取完整源码 ${Math.min(100,Math.floor((loaded+size)/manifest.size*100))}% · 请保持页面打开`);}const bytes=new Uint8Array(size);let offset=0;for(const piece of pieces){bytes.set(piece,offset);offset+=piece.length;}chunks.push(bytes);loaded+=size;}
        else{const bytes=new Uint8Array(await response.arrayBuffer());chunks.push(bytes);loaded+=bytes.length;}
      }
      message('正在检查文件完整性…');label.textContent='正在校验文件…';
      const output=await SourceDownload.assemble(chunks,manifest),blob=new Blob([output],{type:'application/zip'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
      anchor.href=url;anchor.download=manifest.filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      bar.style.width='100%';message('文件校验通过，已开始保存。请在浏览器下载列表中查看。','success');label.textContent='再次下载源码包';
    }catch(error){message(error instanceof Error?error.message:'下载失败，请重试。','error');label.textContent='重新下载';}
    finally{busy=false;button.disabled=false;}
  }
  button.onclick=download;readManifest().catch(()=>{message('暂时无法读取文件，请确认已登录后重试。','error');label.textContent='重试下载';button.disabled=false;});
})();
