import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import electronPath from "electron";
test("500 列遊戲標籤局部更新、鍵盤、封面與三項 UX 整合", {timeout:60000}, async()=>{
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(electronPath,[fileURLToPath(new URL("../test-support/reader-ux-workflows.cjs",import.meta.url))],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="";
    child.stdout.on("data",chunk=>stdout+=chunk); child.stderr.on("data",chunk=>stderr+=chunk);
    child.on("error",reject); child.on("exit",code=>{
      if(code!==0)return reject(Error(`Electron 整合測試失敗（${code}）\n${stderr}`));
      try{resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1)));}catch(error){reject(error);}
    });
  });
  assert.equal(result.preservedRows,500);
  for(const key of ["coversPreserved","focusPreserved","keyboard","sentinel","animeSearch","mediaScroll"])assert.equal(result[key],true,key);
  for(const value of Object.values(result.timingsMs))assert.ok(Number.isFinite(value)&&value>=0);
});
