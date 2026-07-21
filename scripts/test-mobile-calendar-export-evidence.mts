import assert from "node:assert/strict";
import http from "node:http";
import nextEnv from "@next/env";
const {loadEnvConfig}=nextEnv;loadEnvConfig(process.cwd(),false,console);
const days=[{day:11,date:"2026-07-11",stem:"甲",branch:"子",day_officer:"建",yi:["開市"],ji:[],verdict:{score:82},universal_verdict:{score:78}}];
const server=http.createServer((req,res)=>{if(req.headers.authorization!=="Bearer fixture"){res.writeHead(401,{"content-type":"application/json"});res.end('{"error":"not_logged_in"}');return;}res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({ok:true,year:2026,month:7,days,year_pillar:"丙午",month_pillar:"乙未",entitlement:{allowed_intents:["start_work"],pdf:true}}));});
await new Promise<void>((resolve)=>server.listen(0,"127.0.0.1",resolve));
try{const address=server.address();assert(address&&typeof address==="object");const origin=`http://127.0.0.1:${address.port}`;const {rebuildMobileCalendarExportEvidence,MobileCalendarEvidenceError}=await import("../src/lib/mobile-calendar-export-evidence.ts");const {calendarHandler}=await import("../src/lib/export/calendar.ts");
 const rebuilt=await rebuildMobileCalendarExportEvidence({bearer:"fixture",origin,inputs:{calendar_request:{year:2026,month:7,selected:11,intent:"locked_intent",mode:"personal",profile_id:"profile-1"}}});const calendar=(rebuilt as {calendar:Record<string,unknown>}).calendar;assert.deepEqual((calendar.month as Record<string,unknown>).days,days);assert.equal(calendar.selected,11);assert.equal(calendar.intent,null);assert.equal(calendar.mode,"tongshu","server downgrades personal mode when rebuilt evidence has no profile");
 const resolved=await calendarHandler.resolveInputs(rebuilt,{userId:"00000000-0000-0000-0000-000000000001",email:"fixture@example.test",orgId:null,sv:0} as never);assert(!("error" in resolved),"rebuilt mobile payload must satisfy Calendar export handler");
 await assert.rejects(()=>rebuildMobileCalendarExportEvidence({bearer:"fixture",origin,inputs:{calendar_request:{year:2026,month:13}}}),(error)=>error instanceof MobileCalendarEvidenceError&&error.status===400);
 console.log("mobile Calendar export evidence checks passed: 7/7");
}finally{server.close();}
