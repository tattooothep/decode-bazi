import crypto from "node:crypto";
import {pool} from "@/lib/db";

export type AuthDeliveryPayload={channel:"email"|"sms";destination:string;link:string;name?:string};
const secret=String(process.env.AUTH_SECRET||"");
function key(){if(secret.length<16)throw new Error("AUTH_SECRET is required");return crypto.createHash("sha256").update(secret).digest();}
export function encryptAuthDelivery(payload:AuthDeliveryPayload){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key(),iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(payload),"utf8"),cipher.final()]);return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;}
export function decryptAuthDelivery(value:string):AuthDeliveryPayload{const [ivRaw,tagRaw,dataRaw]=value.split(".");if(!ivRaw||!tagRaw||!dataRaw)throw new Error("invalid auth delivery payload");const decipher=crypto.createDecipheriv("aes-256-gcm",key(),Buffer.from(ivRaw,"base64url"));decipher.setAuthTag(Buffer.from(tagRaw,"base64url"));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(dataRaw,"base64url")),decipher.final()]).toString("utf8")) as AuthDeliveryPayload;}

export async function enqueuePasswordResetDelivery(input:{userId:string;name?:string|null;channel:"email"|"sms";destination:string;appUrl:string}){
  const rawToken=crypto.randomBytes(32).toString("hex"),digest=crypto.createHash("sha256").update(rawToken).digest("hex");
  const link=`${input.appUrl}/reset-password/${rawToken}`;
  const encrypted=encryptAuthDelivery({channel:input.channel,destination:input.destination,link,name:input.name||undefined});
  const client=await pool.connect();
  try {await client.query("BEGIN");await client.query(`INSERT INTO auth_tokens(token,user_id,kind,expires_at,used) VALUES($1,$2,'password_reset',now()+interval '60 minutes',false)`,[digest,input.userId]);await client.query(`INSERT INTO auth_delivery_outbox(user_id,kind,payload_ciphertext,status,available_at) VALUES($1,'password_reset',$2,'waiting',now())`,[input.userId,encrypted]);await client.query("COMMIT");}
  catch(error){await client.query("ROLLBACK").catch(()=>null);throw error;}finally{client.release();}
}
