import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchChineseCandidate, resolveChineseName, requireChineseNames, anilistAliases } from '../.cursor/skills/find-anime/lib/chinese-names.js';
import { enrichWithCN } from '../.cursor/skills/find-anime/lib/bangumi.js';
import { JsonJournal } from '../../packages/core/json-journal.js';

const item = {mal_id:999999,title:'Test II',title_japanese:'テスト II',aired:{from:'2019-01-07T00:00:00Z'},type:'TV',episodes:13};
const subject = {id:1,type:2,name:'テスト Ⅱ',name_cn:'测试 第二季',date:'2019-01-07',platform:'TV',eps:13};
test('同名不同版本以日期、類型與集數排除；羅馬數字可正規化',()=>{
 assert.equal(matchChineseCandidate(item,[{...subject,id:2,date:'2017-01-07'},subject]).id,1);
 assert.equal(matchChineseCandidate(item,[{...subject,platform:'剧场版'}]),null);
 assert.equal(matchChineseCandidate(item,[{...subject,eps:12}]),null);
 assert.equal(matchChineseCandidate(item,[subject,{...subject,id:3}]),null);
 assert.equal(matchChineseCandidate({...item,aired:{}},[subject]),null);
});
test('AniList 編號驗證後才採用別名；錯誤候選詳情不妨礙正確配對',async()=>{
 const result=await resolveChineseName(item,async()=>[{id:99,name_cn:'其他'},{id:1,name_cn:'測試'}],{
  get:async url=>{if(url.endsWith('/99'))throw Error('404');return {data:subject};},wait:async()=>{},fallback:async()=>{throw Error('不需備援');},
 });
 assert.equal(result.title,'測試 第二季');
 await assert.rejects(()=>anilistAliases(item,{post:async()=>({data:{data:{Media:{idMal:1}}}})}),/編號不符/);
});
test('主搜尋無結果會使用經 MAL 編號查得的備援別名',async()=>{
 const queries=[];
 const result=await resolveChineseName(item,async query=>{queries.push(query);return query==='新別名'?[{id:1,name_cn:'測試'}]:[];},{fallback:async()=>['新別名'],get:async()=>({data:{...subject,name:'新別名'}}),wait:async()=>{}});
 assert.equal(result.method,'anilist-alias-bangumi');assert.ok(queries.includes('新別名'));
});
test('同日文名不同 MAL 編號不共用快取，未配對項目每次重新查詢',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anime-names-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const cache=new JsonJournal(path.join(dir,'names.json'));let requests=0;
 const resolveName=async()=>{requests++;return {title:'測試 第二季',method:'mock'};};
 await enrichWithCN([item],null,{cache,resolveName,now:()=>1000,wait:async()=>{}});
 await enrichWithCN([item],null,{cache,resolveName,now:()=>2000,wait:async()=>{}});
 await enrichWithCN([{...item,mal_id:999998}],null,{cache,resolveName,now:()=>2000,wait:async()=>{}});
 assert.equal(requests,2);
 for(let i=0;i<2;i++)await enrichWithCN([{...item,mal_id:999997}],null,{cache,resolveName:async()=>{requests++;return {title:null,reason:'timeout'};},wait:async()=>{}});
 assert.equal(requests,4);assert.equal(cache.data['mal:999997'],undefined);
});
test('未補中文會停止該批並保留待補原因，其他批的待補紀錄不會遺失',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'anime-pending-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 assert.throws(()=>requireChineseNames([{...item,title_cn:null,chineseNameStatus:'pending',chineseNameReason:'timeout'}],{directory}),/本批未寫入/);
 assert.throws(()=>requireChineseNames([{...item,mal_id:999998,title_cn:null}],{directory}));
 requireChineseNames([{...item,title_cn:'已確認中文',chineseNameStatus:'resolved'}],{directory});
 const records=JSON.parse(fs.readFileSync(path.join(directory,'pending.json'))).items;
 assert.deepEqual(records.map(r=>r.malId),[999998]);
});
