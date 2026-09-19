
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const J = (x:any,s=200) => new Response(JSON.stringify(x),{status:s,headers:{...cors,"content-type":"application/json"}});
const norm = (v:any) => String(v==null?"":v).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ");
const dateOnly = (v:any) => String(v||"").slice(0,10);
const EXPECTED_VOTES = 29;
const MONTHS:any = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,leden:1,unor:2,brezen:3,duben:4,kveten:5,cerven:6,cervenec:7,srpen:8,zari:9,rijen:10,listopad:11,prosinec:12};

function monthStart(y:number,m:number){ return String(y)+"-"+String(m).padStart(2,"0")+"-01"; }
function monthEnd(start:string){
  const p=start.split("-").map(Number);
  return new Date(Date.UTC(p[0],p[1],0)).toISOString().slice(0,10);
}
function parseStamp(raw:string){
  const m=String(raw||"").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if(!m)return null;
  const mo=Number(m[1]),d=Number(m[2]),y=Number(m[3]),h=Number(m[4]),mi=Number(m[5]),s=Number(m[6]);
  return {raw:m[0],year:y,month:mo,day:d,hour:h,minute:mi,second:s,date:String(y)+"-"+String(mo).padStart(2,"0")+"-"+String(d).padStart(2,"0")};
}
function pragueIso(st:any){
  const wanted=Date.UTC(st.year,st.month-1,st.day,st.hour,st.minute,st.second);
  let utc=wanted;
  const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
  for(let i=0;i<2;i++){
    const p:any={};
    for(const x of fmt.formatToParts(new Date(utc)))p[x.type]=x.value;
    const seen=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));
    utc += wanted-seen;
  }
  return new Date(utc).toISOString();
}
function targetMonth(filename:string,stamp:any){
  const n=norm(filename);
  for(const k of Object.keys(MONTHS)){
    if(n.indexOf(k)>=0)return monthStart(stamp.year,Number(MONTHS[k]));
  }
  return monthStart(stamp.year,stamp.month);
}
function responseKey(month:string,email:string,stamp:string){
  return ["team_rating",month,norm(email),String(stamp).replace(/\s+/g," ")].join("|");
}
function findEmail(s:string){
  const m=String(s||"").match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+/i);
  return m?m[0].replace(/[|,;]+$/,"").trim():null;
}
function resolveEmail(email:string|null,aliases:any[]){
  if(!email)return null;
  const e=norm(email);
  const hits=aliases.filter((a:any)=>{
    const v=norm(a.normalized_value||a.alias_value);
    return v===e || (e.length>=8 && (v.startsWith(e)||e.startsWith(v)));
  });
  const ids=[...new Set(hits.map((x:any)=>x.person_id))];
  return ids.length===1?ids[0]:null;
}
function nameOccurrences(text:string,people:any[]){
  const s=norm(text),hits:any[]=[];
  for(const p of people){
    const needle=norm(p.full_name);
    if(!needle||needle.length<4)continue;
    let at=0;
    while(true){
      const i=s.indexOf(needle,at);
      if(i<0)break;
      hits.push({at:i,person_id:p.id,name:p.full_name});
      at=i+Math.max(1,needle.length);
    }
  }
  hits.sort((a,b)=>a.at-b.at||String(b.name).length-String(a.name).length);
  const out:any[]=[];
  let last=-1;
  for(const h of hits){
    if(h.at===last)continue;
    out.push(h);last=h.at;
  }
  return out;
}
function parseForm(text:string,filename:string,people:any[],emailAliases:any[]){
  const clean=String(text||"").replace(/\u00a0/g," ");
  const re=/(\d{1,2}\/\d{1,2}\/\d{4})\s*[|,]?\s*(\d{1,2}:\d{2}:\d{2})/g;
  const stamps=[...clean.matchAll(re)];
  if(!stamps.length)return {month:null,responses:[],conflicts:["Nebyl nalezen žádný Timestamp."],warnings:[]};
  const first=parseStamp(stamps[0][0]);
  if(!first)return {month:null,responses:[],conflicts:["Timestamp nejde přečíst."],warnings:[]};
  const month=targetMonth(filename,first),end=monthEnd(month);
  const responses:any[]=[],conflicts:string[]=[],warnings:string[]=[];
  for(let i=0;i<stamps.length;i++){
    const start=stamps[i].index||0;
    const stop=i+1<stamps.length?(stamps[i+1].index||clean.length):clean.length;
    const chunk=clean.slice(start,stop);
    const st=parseStamp(stamps[i][0]);if(!st)continue;
    const email=findEmail(chunk);
    const respondent=resolveEmail(email,emailAliases);
    const names=nameOccurrences(chunk,people);
    const selfVotes=respondent?names.filter((x:any)=>String(x.person_id)===String(respondent)).length:0;
    const within=st.date>=month&&st.date<=end;
    let reason:any=null;
    if(!respondent)reason="unresolved_respondent";
    else if(!within)reason="outside_form_month";
    else if(selfVotes>0)reason="self_vote";
    if(names.length!==EXPECTED_VOTES)conflicts.push((email||st.raw)+": rozpoznáno "+names.length+"/"+EXPECTED_VOTES+" nominací");
    if(reason==="self_vote")warnings.push((email||st.raw)+": self-vote → odpověď diskvalifikována");
    if(reason==="outside_form_month")warnings.push((email||st.raw)+": odpověď po konci měsíce → nezapočítána");
    const key=responseKey(month,String(respondent||email||"unknown"),st.raw);
    responses.push({
      response_key:key,response_month:month,submitted_at:pragueIso(st),
      submitted_local:st.date+"T"+String(st.hour).padStart(2,"0")+":"+String(st.minute).padStart(2,"0")+":"+String(st.second).padStart(2,"0"),
      respondent_email:email,respondent_person_id:respondent,is_valid:reason===null,
      disqualified_reason:reason,raw_vote_count:names.length,self_vote_count:selfVotes,
      votes:names.map((x:any,j:number)=>({question_index:j+1,nominee_person_id:x.person_id,nominee_raw:x.name}))
    });
  }
  return {month,responses,conflicts,warnings};
}
function selectLatest(responses:any[]){
  const m=new Map<string,any>();
  for(const r of responses){
    if(!r.respondent_person_id)continue;
    if(r.disqualified_reason==="outside_form_month")continue;
    const k=String(r.respondent_person_id),old=m.get(k);
    if(!old||String(r.submitted_at)>String(old.submitted_at))m.set(k,r);
  }
  return [...m.values()];
}
function buildMetrics(month:string,people:any[],responses:any[],votes:any[]){
  const selected=selectLatest(responses);
  const valid=selected.filter((r:any)=>r.is_valid===true);
  const validIds=new Set(valid.map((r:any)=>String(r.id||r.response_key)));
  const counts=new Map<string,number>();
  for(const v of votes){
    const rid=String(v.response_id||v.response_key||"");
    if(!validIds.has(rid)||!v.nominee_person_id)continue;
    const k=String(v.nominee_person_id);
    counts.set(k,(counts.get(k)||0)+1);
  }
  let top=0;for(const x of counts.values())if(x>top)top=x;
  const one=top>0?top*0.8:null,half=one==null?null:one/2;
  const filled=new Set(valid.map((r:any)=>String(r.respondent_person_id)));
  const rows:any[]=[];
  for(const p of people){
    const pid=String(p.id),votesCount=counts.get(pid)||0,forms=filled.has(pid)?1:0;
    const rating=top<=0?0:(votesCount>=Number(one)?1:(votesCount>=Number(half)?0.5:0));
    const score=forms+rating;
    const meta={top_votes:top,one_point_target:one,half_point_target:half,forms_rule:"valid in-month response; self-vote disqualifies response"};
    const vals:any={
      team_rating_vote_count:votesCount,
      team_rating_forms_filled_points:forms,
      team_rating_points:rating,
      team_rating_people_score:score
    };
    rows.push({person_id:p.id,source_identity:p.display_name||p.full_name,values:vals,metadata:meta});
  }
  return {people:rows,top_votes:top,one_point_target:one,half_point_target:half,selected_responses:selected.length,valid_responses:valid.length};
}
async function loadRefs(db:any){
  const r=await Promise.all([
    db.from("people").select("id,person_key,display_name,full_name,active"),
    db.from("person_aliases").select("person_id,alias_type,alias_value,normalized_value,confirmed").eq("confirmed",true)
  ]);
  if(r[0].error)throw r[0].error;if(r[1].error)throw r[1].error;
  const people=r[0].data||[],aliases=(r[1].data||[]).filter((a:any)=>a.alias_type==="email");
  return {people,aliases};
}
async function mergedState(db:any,parsed:any,people:any[]){
  const rr=await db.from("team_rating_responses").select("id,response_key,response_month,submitted_at,respondent_person_id,is_valid,disqualified_reason,metadata").eq("response_month",parsed.month);
  if(rr.error)throw rr.error;
  const existing=rr.data||[],ids=existing.map((x:any)=>x.id);
  const vv=ids.length?await db.from("team_rating_votes").select("response_id,nominee_person_id,nominee_raw,question_index,is_valid").in("response_id",ids):{data:[],error:null};
  if(vv.error)throw vv.error;
  const incomingKeys=new Set(parsed.responses.map((x:any)=>x.response_key));
  const responseByKey=new Map<string,any>();
  for(const r of existing)responseByKey.set(r.response_key,{...r});
  for(const r of parsed.responses)responseByKey.set(r.response_key,{...r,id:r.response_key});
  const idToKey=new Map(existing.map((r:any)=>[String(r.id),r.response_key]));
  const votes:any[]=[];
  for(const v of vv.data||[]){
    const key=idToKey.get(String(v.response_id));
    if(!key||incomingKeys.has(key))continue;
    votes.push({...v,response_key:key});
  }
  for(const r of parsed.responses)for(const v of r.votes)votes.push({...v,response_id:r.response_key,response_key:r.response_key,is_valid:r.is_valid});
  return buildMetrics(parsed.month,people,[...responseByKey.values()],votes);
}
async function requireAdmin(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth)throw new Error("Unauthorized");
  const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const ur=await uc.auth.getUser();if(!ur.data.user)throw new Error("Unauthorized");
  const db=createClient(url,service);
  const ar=await db.from("admin_users").select("user_id").eq("user_id",ur.data.user.id).maybeSingle();
  if(!ar.data)throw new Error("Forbidden");
  return db;
}

Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const db=await requireAdmin(req);
    const b=await req.json().catch(()=>({}));
    const importId=String(b.import_id||""),mode=String(b.mode||"preview"),text=String(b.extracted_text||"");
    if(!importId||!text)return J({error:"Missing import_id or extracted_text"},400);
    const ir=await db.from("imports").select("id,filename,report_type,status").eq("id",importId).single();
    if(ir.error||!ir.data)return J({error:ir.error?ir.error.message:"Import not found"},400);
    const refs=await loadRefs(db);
    const parsed=parseForm(text,ir.data.filename,refs.people,refs.aliases);
    if(!parsed.month||!parsed.responses.length)return J({error:"No Team Rating responses parsed",conflicts:parsed.conflicts},422);
    const unresolved=parsed.responses.filter((r:any)=>!r.respondent_person_id).map((r:any)=>r.respondent_email||r.response_key);
    const conflicts=[...parsed.conflicts,...unresolved.map((x:any)=>"Nerozpoznaný respondent: "+x)];
    const state=await mergedState(db,parsed,refs.people);
    const peoplePreview=state.people.map((p:any)=>({...p,person_id:p.person_id}));
    const summaries=parsed.responses.map((r:any)=>({
      response_key:r.response_key,submitted_at:r.submitted_at,respondent_email:r.respondent_email,respondent_person_id:r.respondent_person_id,
      respondent_name:(refs.people.find((p:any)=>p.id===r.respondent_person_id)||{}).display_name||null,
      valid:r.is_valid,disqualified_reason:r.disqualified_reason,vote_count:r.raw_vote_count,self_vote_count:r.self_vote_count,
      votes_by_person:Object.entries(r.votes.reduce((a:any,v:any)=>{a[v.nominee_raw]=(a[v.nominee_raw]||0)+1;return a;},{}))
    }));
    const preview={
      ok:true,preview:true,parser_stage:"team-rating-v1",import_id:importId,filename:ir.data.filename,
      period_start:parsed.month,period_end:monthEnd(parsed.month),question_count:EXPECTED_VOTES,response_count:parsed.responses.length,
      valid_response_count:parsed.responses.filter((r:any)=>r.is_valid).length,
      disqualified_count:parsed.responses.filter((r:any)=>!r.is_valid).length,
      unresolved,conflicts,warnings:parsed.warnings,responses:summaries,people:peoplePreview,
      metric_count:4,observation_count:peoplePreview.length*4,
      scoring:{top_votes:state.top_votes,one_point_target:state.one_point_target,half_point_target:state.half_point_target,forms_filled_points:1}
    };
    if(mode==="preview")return J(preview);
    if(mode!=="commit")return J({error:"Unsupported mode"},400);
    if(conflicts.length)return J({error:"Commit blokován kvůli konfliktům parsování/identity",conflicts},409);

    for(const r of parsed.responses){
      const payload={
        response_key:r.response_key,response_month:r.response_month,submitted_at:r.submitted_at,respondent_email:r.respondent_email,
        respondent_person_id:r.respondent_person_id,import_id:importId,is_valid:r.is_valid,disqualified_reason:r.disqualified_reason,
        raw_vote_count:r.raw_vote_count,metadata:{submitted_local:r.submitted_local,self_vote_count:r.self_vote_count,within_month:r.disqualified_reason!=="outside_form_month",parser:"team-rating-v1"}
      };
      const up=await db.from("team_rating_responses").upsert(payload,{onConflict:"response_key"}).select("id").single();
      if(up.error)throw up.error;
      const responseId=up.data.id;
      const del=await db.from("team_rating_votes").delete().eq("response_id",responseId);if(del.error)throw del.error;
      if(r.votes.length){
        const voteRows=r.votes.map((v:any)=>({response_id:responseId,response_month:r.response_month,respondent_person_id:r.respondent_person_id,nominee_person_id:v.nominee_person_id,nominee_raw:v.nominee_raw,question_index:v.question_index,import_id:importId,is_valid:r.is_valid}));
        const vi=await db.from("team_rating_votes").insert(voteRows);if(vi.error)throw vi.error;
      }
    }

    const mr=await db.from("team_rating_responses").select("id,response_key,response_month,submitted_at,respondent_person_id,is_valid,disqualified_reason,metadata").eq("response_month",parsed.month);
    if(mr.error)throw mr.error;
    const mids=(mr.data||[]).map((x:any)=>x.id);
    const mv=mids.length?await db.from("team_rating_votes").select("response_id,nominee_person_id,nominee_raw,question_index,is_valid").in("response_id",mids):{data:[],error:null};
    if(mv.error)throw mv.error;
    const aggregate=buildMetrics(parsed.month,refs.people,mr.data||[],mv.data||[]);
    const defs=[
      {metric_id:"team_rating_vote_count",label:"Team Rating Votes",unit:"count",category:"people",lower_is_better:false,default_granularity:"month"},
      {metric_id:"team_rating_forms_filled_points",label:"Forms Filled Points",unit:"points",category:"people",lower_is_better:false,default_granularity:"month"},
      {metric_id:"team_rating_points",label:"Team Rating Points",unit:"points",category:"people",lower_is_better:false,default_granularity:"month"},
      {metric_id:"team_rating_people_score",label:"People Score",unit:"points",category:"people",lower_is_better:false,default_granularity:"month"}
    ];
    const md=await db.from("metric_definitions").upsert(defs,{onConflict:"metric_id"});if(md.error)throw md.error;
    const end=monthEnd(parsed.month),obs:any[]=[];
    for(const p of aggregate.people){
      for(const pair of Object.entries(p.values)){
        obs.push({person_id:p.person_id,metric_id:pair[0],value:pair[1],period_start:parsed.month,period_end:end,granularity:"month",source_type:"team_rating",import_id:importId,
          source_record_key:["mo","team_rating",p.person_id,pair[0],parsed.month,end,"month"].join("|"),
          metadata:{top_votes:aggregate.top_votes,one_point_target:aggregate.one_point_target,half_point_target:aggregate.half_point_target}
        });
      }
    }
    const ow=await db.from("metric_observations").upsert(obs,{onConflict:"source_record_key"}).select("id");if(ow.error)throw ow.error;
    const iu=await db.from("imports").update({status:"imported",period_start:parsed.month,period_end:end,parser_version:"team-rating-v1",record_count:parsed.responses.length,warning_count:parsed.responses.filter((r:any)=>!r.is_valid).length,metadata:{team_rating:true,question_count:EXPECTED_VOTES,valid_responses:parsed.responses.filter((r:any)=>r.is_valid).length,disqualified:parsed.responses.filter((r:any)=>!r.is_valid).length}}).eq("id",importId);
    if(iu.error)throw iu.error;
    return J({...preview,preview:false,committed:true,inserted_count:ow.data?ow.data.length:0,scoring:{top_votes:aggregate.top_votes,one_point_target:aggregate.one_point_target,half_point_target:aggregate.half_point_target,forms_filled_points:1}});
  }catch(e:any){
    const m=String(e&&e.message?e.message:e),s=m==="Unauthorized"?401:m==="Forbidden"?403:500;
    return J({error:m},s);
  }
});
