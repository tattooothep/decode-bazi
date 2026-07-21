import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getMobileSession } from "@/lib/mobile-auth";
import { getProductAccess } from "@/lib/product-entitlement";
import { findMountain24 } from "@/lib/luopan/mountains";
import { focusedRingIndexes, yaoLinePosition } from "@/lib/luopan/focused-rings";

export const dynamic="force-dynamic";
export const runtime="nodejs";

let cache:Promise<{xkdg:any;fenjin:any;yao:any}>|null=null;
function data() {
  if (!cache) cache=Promise.all([
    readFile(path.join(process.cwd(),"data/luopan-private/xkdg-64-gua.json"),"utf8"),
    readFile(path.join(process.cwd(),"data/luopan-private/fenjin120.json"),"utf8"),
    readFile(path.join(process.cwd(),"data/luopan-private/yao384.json"),"utf8"),
  ]).then(([xkdg,fenjin,yao])=>({xkdg:JSON.parse(xkdg),fenjin:JSON.parse(fenjin),yao:JSON.parse(yao)}));
  return cache;
}

function publicHex(row:any) { return row ? {id:row.id,name:row.name,thaiName:row.thaiName,homeUse:row.homeUse,homeAdvice:row.homeAdvice,baseHouseScore:row.baseHouseScore,tone:row.tone,xkdg:row.xkdg,thaiName_en:row.thaiName_en,thaiName_zh:row.thaiName_zh,homeUse_en:row.homeUse_en,homeUse_zh:row.homeUse_zh,homeAdvice_en:row.homeAdvice_en,homeAdvice_zh:row.homeAdvice_zh} : null; }
function publicFenjin(row:any) { return row ? {index:row.index,deg_start:row.deg_start,deg_end:row.deg_end,mountain:row.mountain,ganzhi:row.ganzhi,nayin:row.nayin,status:row.status,usable:row.usable,score:row.score,interp_th:row.interp_th,interp_en:row.interp_en,interp_zh:row.interp_zh} : null; }
function publicYao(row:any) { return row ? {id:row.id,gua:row.gua,hex_num:row.hex_num,pos:row.pos,line_type:row.line_type,yao_ci:row.yao_ci,jixiong:row.jixiong,score:row.score,th:row.th,general:row.general,home:row.home,th_en:row.th_en,th_zh:row.th_zh,general_en:row.general_en,general_zh:row.general_zh,home_en:row.home_en,home_zh:row.home_zh} : null; }

export async function GET(req:Request) {
  const session=await getMobileSession(req);
  if (!session) return NextResponse.json({ok:false,error:"not_logged_in"},{status:401});
  const access=await getProductAccess(session.userId);
  if (!access) return NextResponse.json({ok:false,error:"account_unavailable"},{status:403});
  const degree=Number(new URL(req.url).searchParams.get("degree"));
  if (!Number.isFinite(degree)) return NextResponse.json({ok:false,error:"bad_degree"},{status:400});
  const indexes=focusedRingIndexes(degree),mountain=findMountain24(indexes.degree);
  if (access.luopan_mode==="core") return NextResponse.json({ok:true,degree:indexes.degree,mountain,entitlement:{plan:access.plan,mode:access.luopan_mode},sections:{hex64:"locked",fenjin120:"locked",yao384:"locked"}},{headers:{"Cache-Control":"private, max-age=300"}});
  const source=await data();
  const hex=publicHex((source.xkdg.hexagrams||[]).find((row:any)=>Number(row.id)===indexes.hexNumber));
  const master=access.luopan_mode==="full";
  const yaoRow=master?(source.yao.lines||[]).find((row:any)=>row.gua===indexes.hexName&&yaoLinePosition(row.pos)===indexes.yaoPosition):null;
  return NextResponse.json({ok:true,degree:indexes.degree,mountain,hex64:hex,fenjin120:master?publicFenjin(source.fenjin.fenjin?.[indexes.fenjinIndex]):undefined,yao384:master?publicYao(yaoRow):undefined,entitlement:{plan:access.plan,mode:access.luopan_mode},sections:{hex64:"open",fenjin120:master?"open":"locked",yao384:master?"open":"locked"}},{headers:{"Cache-Control":"private, max-age=300"}});
}
