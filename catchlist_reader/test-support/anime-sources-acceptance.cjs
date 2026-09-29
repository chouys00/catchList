// 使用真實報告與来源檔的副本，背景驗證所有新動畫；不修改使用中的程式或資料。
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(process.env.CATCHLIST_TEST_READER_ROOT||path.join(__dirname,'..'));
const data=process.env.CATCHLIST_ACCEPTANCE_DATA_DIR;
if(!data)throw Error('需指定驗收資料夾');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'anime-source-acceptance-'));
app.setPath('userData',path.join(temp,'profile'));
const timeout=setTimeout(()=>{console.error('來源驗收逾時');app.exit(1)},60000);
app.whenReady().then(async()=>{
  const {sourceEntries}=await import(pathToFileURL(path.join(root,'src/library.js')).href);
  const {AnimeMediaService}=await import(pathToFileURL(path.join(root,'src/anime-media.js')).href);
  const {readAnimeSources,animeSourceKey}=await import(pathToFileURL(require.resolve('@catchlist/core/anime-sources.js',{paths:[root]})).href);
  const records=readAnimeSources(data).records;
  const entries=sourceEntries(data,'anime').entries.filter(e=>records[animeSourceKey(e)]);
  assert.equal(entries.length,67);
  let networkCalls=0;
  const service=new AnimeMediaService(path.join(temp,'cache.json'),{fetchImpl:async()=>{networkCalls++;throw Error('來源齊全不應重查')}});
  let covers=0,trailers=0,review=0;
  for(const e of entries){const media=await service.resolve({...e,sourceRecord:records[animeSourceKey(e)]});if(media.coverUrl)covers++;if(media.trailerUrl)trailers++;if(media.status==='unmatched')review++;}
  assert.deepEqual({covers,trailers,review,networkCalls},{covers:64,trailers:59,review:3,networkCalls:0});
  ipcMain.handle('library:load',()=>({dataDir:temp,appVersion:'來源驗收',libraries:[{media:'games',entries:[],sections:[],exists:true},{media:'anime',entries,sections:[],exists:true}],hiddenEntries:[]}));
  ipcMain.handle('anime:resolve-media',(_,id)=>{const e=entries.find(e=>e.id===id);return service.resolve({...e,sourceRecord:records[animeSourceKey(e)]})});
  const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{backgroundThrottling:false,preload:path.join(root,'src/preload.cjs'),contextIsolation:true,sandbox:true}});
  const js=code=>win.webContents.executeJavaScript(code,true);
  await win.loadFile(path.join(root,'src/renderer/index.html'));
  await js("document.querySelector('[data-media=anime]').click()");
  for(let n=0;n<100;n++){if(await js("document.querySelectorAll('.anime-cover img').length >= 4"))break;await new Promise(r=>setTimeout(r,100));}
  await js("Promise.all([...document.querySelectorAll('.anime-cover img')].map(img=>img.decode()))");
  win.setContentSize(1440,1000);await new Promise(r=>setTimeout(r,400));
  assert.ok(await js("document.querySelectorAll('.anime-cover img').length >= 4"));
  const output=process.env.CATCHLIST_QA_DIR;
  if(output){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'sources-desktop.png'),(await win.webContents.capturePage()).toPNG());}
  assert.equal(networkCalls,0);
  clearTimeout(timeout);console.log(JSON.stringify({entries:entries.length,covers,trailers,review,metadataNetworkRequests:networkCalls}));win.destroy();app.quit();
}).catch(e=>{console.error(e);clearTimeout(timeout);app.exit(1)});
