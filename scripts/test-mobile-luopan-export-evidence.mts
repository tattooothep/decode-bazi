import assert from "node:assert/strict";
import { MobileLuopanEvidenceError, rebuildMobileLuopanExportEvidence } from "../src/lib/mobile-luopan-export-evidence";

const profileId="11111111-1111-4111-8111-111111111111";
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
const analysis={
  ok:true,formula_version:"server-v1",verdict_scope:"verified_core_only",
  measurement:{pass:true,headingDeg:15,boundaryDistanceDeg:7.5,uncertaintyDeg:1,nearBoundary:false},
  core:{period:9,school:"shen_13",facing:{name:"癸"},sitting:{name:"丁"},marker:"server_recomputed",pin_warnings:[
    {plate:"earth",mountain:"卯",hits:[{code:"LONG_SHA_HIT",severity:"warning",pass:false}]},
    {plate:"human",mountain:"辰",hits:[{code:"LONG_SHA_HIT",severity:"critical",pass:false}]},
  ]},
  excluded_unverified_layers:["unverified"],
};
let analysisRequest:Record<string,any>|null=null;
const fetcher=(async (input:RequestInfo|URL,init?:RequestInit) => {
  const url=String(input);
  if(url.includes("/luopan/analysis")) {
    analysisRequest=JSON.parse(String(init?.body || "{}"));
    return json(analysis);
  }
  if(url.includes("/luopan/rings")) return json({ok:true,degree:15,hex64:{id:3,name:"屯"},sections:{hex64:"open",fenjin120:"locked",yao384:"locked"}});
  if(url.includes("/houses/123")) return json({ok:true,house:{id:"123",name:"Owned house"}});
  if(url.includes("/luopan/snapshot")) return json({ok:true,layers:{flying_stars:{period:9}},warnings:[{code:"WU_HUANG"}],recommendations:[],entitlement:{plan:"premium"}});
  if(url.includes(`/profiles/${profileId}`)) return json({ok:true,profile:{id:profileId,name:"Owned profile"}});
  return json({error:"unexpected"},500);
}) as typeof fetch;

const rebuilt=await rebuildMobileLuopanExportEvidence({
  bearer:"test",fetcher,origin:"https://internal.test",
  inputs:{luopan:{version:"luopan_evidence_v2",house:{id:123,profileId,name:"Forged",facingDegree:15,period:9},summary:{topGood:[{degree:99}]},pins:[{type:"door",degree:90},{type:"tall_form",degree:105}],sciences:JSON.stringify({core:{marker:"forged"}})}},
});
const evidence=rebuilt.luopan as Record<string,any>;
assert.equal(evidence.house.name,"Owned house");
assert.equal(evidence.house.ownerName,"Owned profile");
assert.deepEqual(evidence.summary.topGood,[]);
assert.equal(evidence.pins[0].mountain,"卯");
assert.equal(evidence.pins[1].plate,"human");
assert.equal(evidence.pins[1].mountain,"辰");
assert.equal(analysisRequest?.pins?.[1]?.featureCategory,"tall_form");
const sciences=JSON.parse(evidence.sciences);
assert.equal(sciences.core.marker,"server_recomputed");
assert.equal(sciences.focused_rings.hex64.name,"屯");
assert.equal(sciences.house_snapshot.layers.flying_stars.period,9);

const basicAnalysis={...analysis,core:{...analysis.core,pin_warnings:Array.from({length:3},(_,index)=>({plate:"earth",mountain:String(index),hits:[]}))}};
const basicFetcher=(async (input:RequestInfo|URL) => {
  const url=String(input);
  if(url.includes("/luopan/analysis")) return json(basicAnalysis);
  if(url.includes("/luopan/rings")) return json({ok:true,sections:{hex64:"locked",fenjin120:"locked",yao384:"locked"}});
  return json({error:"unexpected"},500);
}) as typeof fetch;
const basicRebuilt=await rebuildMobileLuopanExportEvidence({
  bearer:"test",fetcher:basicFetcher,origin:"https://internal.test",
  inputs:{luopan:{version:"luopan_evidence_v2",house:{facingDegree:15,period:9},pins:Array.from({length:100},(_,index)=>({type:"door",degree:index}))}},
});
assert.equal((basicRebuilt.luopan as Record<string,any>).pins.length,3);
assert.equal((basicRebuilt.luopan as Record<string,any>).completeness.pinCount,3);

const denied=(async (input:RequestInfo|URL,init?:RequestInit) => String(input).includes("/houses/123") ? json({error:"not found"},404) : fetcher(input,init)) as typeof fetch;
await assert.rejects(
  rebuildMobileLuopanExportEvidence({bearer:"test",fetcher:denied,origin:"https://internal.test",inputs:{luopan:{version:"luopan_evidence_v2",house:{id:123,facingDegree:15,period:9},pins:[]}}}),
  (cause:unknown)=>cause instanceof MobileLuopanEvidenceError&&cause.code==="house_not_owned",
);
console.log("mobile Luo Pan export evidence passed: 13/13");
