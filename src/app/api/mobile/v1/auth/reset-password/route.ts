import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {hashPassword,signSession} from "@/lib/auth";
import {pool} from "@/lib/db";
import {clientIp,rateLimit} from "@/lib/rate-limit";

export async function POST(req:Request) {
  const limited=await rateLimit(`mobile-reset:${clientIp(req)}`,10,60*60_000);
  if(!limited.ok) return NextResponse.json({ok:false,error:"rate_limited"},{status:429});
  const body=await req.json().catch(()=>({}));
  const token=String(body.token||"");
  const password=String(body.password||"");
  if(!token||password.length<8||password.length>72) return NextResponse.json({ok:false,error:"invalid_token_or_password"},{status:400});
  const digest=crypto.createHash("sha256").update(token).digest("hex"),hash=await hashPassword(password);
  const client=await pool.connect();let user:{id:string;email:string;current_org_id:string|null;session_version:number}|null=null;
  try {
    await client.query("BEGIN");
    const consumed=(await client.query<{user_id:string}>(`UPDATE auth_tokens SET used=true WHERE token=$1 AND kind='password_reset' AND used=false AND expires_at>now() RETURNING user_id`,[digest])).rows[0];
    if(!consumed){await client.query("ROLLBACK");return NextResponse.json({ok:false,error:"invalid_or_expired_token"},{status:400});}
    user=(await client.query(`UPDATE users SET password_hash=$2,session_version=COALESCE(session_version,0)+1,last_active_at=now() WHERE id=$1 AND deleted_at IS NULL AND is_active=true RETURNING id,email,current_org_id,session_version`,[consumed.user_id,hash])).rows[0]||null;
    if(!user){await client.query("ROLLBACK");return NextResponse.json({ok:false,error:"account_unavailable"},{status:403});}
    await client.query(`UPDATE auth_tokens SET used=true WHERE user_id=$1 AND kind='password_reset' AND used=false`,[user.id]);
    await client.query("COMMIT");
  } catch(error) {await client.query("ROLLBACK").catch(()=>null);throw error;} finally {client.release();}
  const sv=Number(user.session_version)||0;
  const accessToken=await signSession({userId:user.id,email:user.email,orgId:user.current_org_id,sv});
  return NextResponse.json({ok:true,access_token:accessToken,token_type:"Bearer"},{headers:{"Cache-Control":"no-store, max-age=0"}});
}
