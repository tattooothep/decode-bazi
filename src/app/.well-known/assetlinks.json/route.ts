import {NextResponse} from "next/server";

export const dynamic="force-dynamic";
export function GET() {
  const fingerprints=String(process.env.ANDROID_APP_LINK_SHA256||"").split(",").map((value)=>value.trim().toUpperCase()).filter((value)=>/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
  if(!fingerprints.length) return NextResponse.json({error:"app_link_not_configured"},{status:503});
  return NextResponse.json([{relation:["delegate_permission/common.handle_all_urls"],target:{namespace:"android_app",package_name:"io.hourkey.app",sha256_cert_fingerprints:fingerprints}}],{headers:{"Cache-Control":"no-store, max-age=0"}});
}
