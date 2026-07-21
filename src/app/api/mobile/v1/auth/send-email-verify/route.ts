import {NextResponse} from "next/server";
import {createToken} from "@/lib/auth-tokens";
import {isEmailReady,sendVerifyEmail} from "@/lib/email-service";
import {getMobileSession} from "@/lib/mobile-auth";
import {q1} from "@/lib/db";
import {clientIp,rateLimit} from "@/lib/rate-limit";

export async function POST(req:Request) {
  const session=await getMobileSession(req);
  if(!session) return NextResponse.json({ok:false,error:"not_logged_in"},{status:401});
  if(!isEmailReady()) return NextResponse.json({ok:false,error:"email_unavailable"},{status:503});
  const limited=await rateLimit(`mobile-emailverify:${session.userId}:${clientIp(req)}`,3,10*60_000);
  if(!limited.ok) return NextResponse.json({ok:false,error:"rate_limited"},{status:429});
  const user=await q1<{email:string;name:string|null;email_verified:boolean}>(`SELECT email,name,email_verified FROM users WHERE id=$1`,[session.userId]);
  if(!user) return NextResponse.json({ok:false,error:"account_unavailable"},{status:404});
  if(user.email_verified) return NextResponse.json({ok:true,already_verified:true});
  const token=await createToken(session.userId,"email_verify",24*60);
  const appUrl=process.env.APP_URL||"https://hourkey.io";
  const sent=await sendVerifyEmail({to:user.email,name:user.name||undefined,link:`${appUrl}/verify-email/${token}`});
  if(sent.error) return NextResponse.json({ok:false,error:"email_send_failed"},{status:502});
  return NextResponse.json({ok:true});
}
