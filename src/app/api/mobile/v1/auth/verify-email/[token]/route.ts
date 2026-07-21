import {NextResponse} from "next/server";
import {consumeToken} from "@/lib/auth-tokens";
import {q1} from "@/lib/db";

export async function POST(_req:Request,ctx:{params:Promise<{token:string}>}) {
  const {token}=await ctx.params;
  const consumed=await consumeToken(String(token||""),"email_verify");
  if(!consumed) return NextResponse.json({ok:false,error:"invalid_or_expired_token"},{status:400});
  await q1(`UPDATE users SET email_verified=true WHERE id=$1 AND deleted_at IS NULL`,[consumed.userId]);
  return NextResponse.json({ok:true,email_verified:true},{headers:{"Cache-Control":"no-store, max-age=0"}});
}
