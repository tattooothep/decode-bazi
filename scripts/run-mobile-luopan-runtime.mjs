import { spawn } from "node:child_process";

const port=3377;
const base=`http://127.0.0.1:${port}`;
let output="";

function run(command,args,env={}) {
  return new Promise((resolve,reject) => {
    const child=spawn(command,args,{env:{...process.env,...env},stdio:"inherit"});
    child.once("error",reject);
    child.once("exit",(code)=>code===0?resolve():reject(new Error(`${command} exited ${code}`)));
  });
}

const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",String(port)],{
  env:{...process.env,HOURKEY_INTERNAL_APP_URL:base},stdio:["ignore","pipe","pipe"],
});
for (const stream of [server.stdout,server.stderr]) stream?.on("data",(chunk)=>{output=(output+String(chunk)).slice(-8000);});

try {
  let ready=false;
  for(let attempt=0;attempt<80;attempt++) {
    if(server.exitCode!=null) throw new Error(`integration server exited ${server.exitCode}\n${output}`);
    try { const response=await fetch(`${base}/api/health`); if(response.ok){ready=true;break;} } catch {}
    await new Promise((resolve)=>setTimeout(resolve,250));
  }
  if(!ready) throw new Error(`integration server did not become ready\n${output}`);
  await run(process.execPath,["scripts/test-mobile-direction-luopan-p0.mjs"],{BASE_URL:base});
  await run(process.execPath,["scripts/test-mobile-luopan-workflow-parity.mjs"],{BASE_URL:base});
} finally {
  if(server.exitCode==null) server.kill("SIGTERM");
  await new Promise((resolve)=>{if(server.exitCode!=null)return resolve();server.once("exit",resolve);setTimeout(()=>{server.kill("SIGKILL");resolve();},3000);});
}
