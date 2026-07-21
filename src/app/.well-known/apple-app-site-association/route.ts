import {NextResponse} from "next/server";

export const dynamic="force-dynamic";
export function GET() {
  const teamId=String(process.env.APPLE_TEAM_ID||"").trim();
  if(!/^[A-Z0-9]{10}$/.test(teamId)) return NextResponse.json({error:"app_link_not_configured"},{status:503});
  return NextResponse.json({applinks:{apps:[],details:[{appID:`${teamId}.io.hourkey.app`,components:[{"/":"/reset-password/*"},{"/":"/verify-email/*"}]}]}},{headers:{"Cache-Control":"no-store, max-age=0"}});
}
