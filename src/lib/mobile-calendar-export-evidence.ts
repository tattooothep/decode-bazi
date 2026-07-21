export class MobileCalendarEvidenceError extends Error{constructor(public code:string,public status:number){super(code);}}
const record=(value:unknown)=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
export async function rebuildMobileCalendarExportEvidence({bearer,inputs,origin}:{bearer:string;inputs:unknown;origin:string}){
  const root=record(inputs),request=record(root?.calendar_request);
  const year=Number(request?.year),month=Number(request?.month),selected=Number(request?.selected);
  const profileId=typeof request?.profile_id==="string"?request.profile_id:"";
  if(!Number.isInteger(year)||year<1900||year>2200||!Number.isInteger(month)||month<1||month>12)throw new MobileCalendarEvidenceError("invalid_calendar_request",400);
  const url=new URL("/api/mobile/v1/calendar",origin);url.searchParams.set("year",String(year));url.searchParams.set("month",String(month));if(profileId)url.searchParams.set("profileId",profileId);
  const response=await fetch(url,{cache:"no-store",headers:{Authorization:`Bearer ${bearer}`,Accept:"application/json"}});const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new MobileCalendarEvidenceError(typeof data.error==="string"?data.error:"calendar_evidence_failed",response.status);
  const monthData=record(data),days=Array.isArray(monthData?.days)?monthData.days:[];if(!monthData||!days.length)throw new MobileCalendarEvidenceError("calendar_evidence_empty",422);
  const entitlement=record(monthData.entitlement),allowed=new Set(Array.isArray(entitlement?.allowed_intents)?entitlement.allowed_intents.filter((value):value is string=>typeof value==="string"):[]);
  const requestedIntent=typeof request?.intent==="string"&&allowed.has(request.intent)?request.intent:null;
  const selectedDay=Number.isInteger(selected)&&days.some((day)=>Number(record(day)?.day)===selected)?selected:null;
  return {calendar:{month:monthData,selected:selectedDay,mode:monthData.profile?"personal":"tongshu",intent:requestedIntent}};
}
