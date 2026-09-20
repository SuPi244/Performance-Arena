import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"content-type":"application/json"}});
const norm=(s:string)=>s.trim().toLowerCase();
const defs=[
["daily_avg_accepted_time","Average Accepted Time","number","speed",true],
["daily_avg_acknowledged_time","Average Acknowledged Time","number","speed",true],
["daily_avg_collection_time","Average Collection Time","number","speed",true],
["daily_avg_ready_for_pickup_time","Average Ready for Pickup Time","number","speed",true],
["daily_avg_start_collection_time","Average Start Collection Time","number","speed",true],
["daily_total_production_time","Total Production Time","number","speed",true],
["daily_picking_app_task_count","Picking App Task Count","count","volume",false],
["daily_items_picked_via_scanner_ratio","Items Picked Via Scanner Ratio","percent","quality",false],
["daily_replacement_items_picked_count","Total Replacement Items Picked Count","count","quality",true],
["daily_items_picked_count","Total Items Picked Count","count","volume",false],
["daily_item_count_total","Item Count Total","count","volume",false],
["daily_undelivered_items_ratio","Undelivered Items %","percent","quality",true],
["daily_substitutions_ratio","Substitutions %","percent","quality",true],
] as const;
function num(x:string){x=x.trim();if(!x||x==="∅"||x==="—")return null;const n=Number(x.replace(/,/g,"").replace("%",""));return Number.isFinite(n)?n:null}
function parse(text:string){
 const date=(text.match(/(?:Generated|Date)[^\n]*?(\d{4})[-/.](\d{2})[-/.](\d{2})/i)||text.match(/\b(202\d)[-/.](\d{2})[-/.](\d{2})\b/));
 const period=date?`${date[1]}-${date[2]}-${date[3]}`:null;
 const rows:any[]=[];
 for(const line of text.split("\n")){
  const p=line.split("|").map(x=>x.trim()).filter((x,i,a)=>!(i===a.length-1&&x===""));
  if(p.length<14)continue;
  let start=0;if(/^\d+$/.test(p[0]))start=1;
  const alias=p[start]; if(!alias||/completed by/i.test(alias))continue;
  const vals=p.slice(start+1,start+14); if(vals.length!==13)continue;
  rows.push({alias,values:Object.fromEntries(defs.map((d,i)=>[d[0],num(vals[i])]))});
 }
 return {period,rows};
}
function finite(v:any){const n=Number(v);return Number.isFinite(n)?n:null}
function weighted(rows:any[],metric:string,weightMetric:string){
 let num=0,den=0;const vals:number[]=[];
 for(const r of rows){
  const v=finite(r.values?.[metric]);if(v===null)continue;
  vals.push(v);
  const w=finite(r.values?.[weightMetric]);
  if(w!==null&&w>0){num+=v*w;den+=w}
 }
 if(den>0)return num/den;
 return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
}
function sumMetric(rows:any[],metric:string){
 let total=0,any=false;
 for(const r of rows){const v=finite(r.values?.[metric]);if(v!==null){total+=v;any=true}}
 return any?total:null;
}
function mergePersonRows(rows:any[],person_id:string){
 const source_identities=[...new Set(rows.map((r:any)=>r.alias).filter(Boolean))];
 const values:any={};
 const orderWeight="daily_picking_app_task_count",itemWeight="daily_item_count_total",pickedWeight="daily_items_picked_count";
 for(const d of defs){
  const id=d[0];
  if(["daily_picking_app_task_count","daily_replacement_items_picked_count","daily_items_picked_count","daily_item_count_total"].includes(id)){
   values[id]=sumMetric(rows,id);
  }else if(["daily_items_picked_via_scanner_ratio"].includes(id)){
   values[id]=weighted(rows,id,pickedWeight)??weighted(rows,id,itemWeight);
  }else if(["daily_undelivered_items_ratio","daily_substitutions_ratio"].includes(id)){
   values[id]=weighted(rows,id,itemWeight);
  }else{
   values[id]=weighted(rows,id,orderWeight);
  }
 }
 return {person_id,source_identity:source_identities.join(" + "),source_identities,values,merged_alias_count:source_identities.length};
}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("authorization")||""; if(!auth)return J({error:"Unauthorized"},401);
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await userClient.auth.getUser(); if(!user)return J({error:"Unauthorized"},401);
  const db=createClient(url,service);
  const {data:adm}=await db.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle(); if(!adm)return J({error:"Forbidden"},403);
  const body=await req.json(), import_id=body.import_id, mode=body.mode||"preview", text=body.extracted_text||"";
  if(!import_id||!text)return J({error:"Missing import_id or extracted_text"},400);
  const {data:imp,error:ie}=await db.from("imports").select("id,filename,report_type").eq("id",import_id).single(); if(ie)return J({error:ie.message},400);
  const p=parse(text); if(!p.rows.length)return J({error:"No Daily Picking rows parsed"},422);
  const compact=(s:any)=>norm(String(s||"")).replace(/[^a-z0-9]+/g,"");
  const isTechnicalIdentity=(s:any)=>{const x=compact(s);return x==="woltmark"||x.startsWith("woltmarketholesovice")};
  const technicalRows=p.rows.filter((r:any)=>isTechnicalIdentity(r.alias));
  const candidateRows=p.rows.filter((r:any)=>!isTechnicalIdentity(r.alias));
  const {data:persistentIgnored,error:ignoreErr}=await db.from("ignored_identities").select("normalized_value").eq("source_type","daily_picking");
  if(ignoreErr)return J({error:ignoreErr.message},500);
  const ignoredSet=new Set((persistentIgnored||[]).map((x:any)=>norm(x.normalized_value)));
  const burnerRows=candidateRows.filter((r:any)=>ignoredSet.has(norm(r.alias)));
  const ignored=[...technicalRows,...burnerRows];
  const humanRows=candidateRows.filter((r:any)=>!ignoredSet.has(norm(r.alias)));
  const names=humanRows.map((r:any)=>norm(r.alias));
  const aliasLookup=names.length?await db.from("person_aliases").select("person_id,normalized_value,confirmed").in("normalized_value",names):{data:[],error:null};
  const aliases=aliasLookup.data,ae=aliasLookup.error;if(ae)return J({error:ae.message},500);
  const amap=new Map((aliases||[]).filter((a:any)=>a.confirmed!==false).map((a:any)=>[a.normalized_value,a.person_id]));
  const mapped=humanRows.map((r:any)=>({alias:r.alias,person_id:amap.get(norm(r.alias))||null,values:r.values}));
  const unresolved=[...new Set(mapped.filter((x:any)=>!x.person_id).map((x:any)=>x.alias))];
  const grouped=new Map<string,any[]>();
  for(const r of mapped.filter((x:any)=>x.person_id)){
   if(!grouped.has(r.person_id))grouped.set(r.person_id,[]);
   grouped.get(r.person_id)!.push(r);
  }
  const mergedPeople=[...grouped.entries()].map(([pid,rows])=>mergePersonRows(rows,pid));
  const unresolvedPeople=mapped.filter((x:any)=>!x.person_id).map((r:any)=>({source_identity:r.alias,person_id:null,values:r.values,source_identities:[r.alias],merged_alias_count:1}));
  const people=[...mergedPeople,...unresolvedPeople];
  if(mode==="preview")return J({
   ok:true,preview:true,parser_stage:"daily_picking_parsed_v3",
   import_id,filename:imp.filename,period_start:p.period,period_end:p.period,
   parsed_row_count:p.rows.length,people_count:people.length,matched_count:mergedPeople.length,
   merged_identity_count:mergedPeople.filter((x:any)=>x.merged_alias_count>1).length,
   merged_identities:mergedPeople.filter((x:any)=>x.merged_alias_count>1).map((x:any)=>x.source_identities),
   metric_count:defs.length,observation_count:mergedPeople.length*defs.length,unresolved,
   ignored_identities:ignored.map((r:any)=>r.alias),people
  });
  if(unresolved.length)return J({error:"Unresolved identities",detail:unresolved.join(", "),unresolved},409);
  await db.from("metric_definitions").upsert(defs.map(d=>({metric_id:d[0],label:d[1],unit:d[2],category:d[3],lower_is_better:d[4],default_granularity:"day"})),{onConflict:"metric_id"});
  const obs:any[]=[];
  for(const r of mergedPeople){const pid=r.person_id;for(const d of defs){const v=r.values[d[0]];if(v===null||v===undefined)continue;obs.push({
   person_id:pid,metric_id:d[0],value:v,period_start:p.period,period_end:p.period,granularity:"day",source_type:"daily_picking",import_id,
   source_record_key:`mo|daily_picking|${pid}|${d[0]}|${p.period}|${p.period}|day`,
   metadata:{source_identity:r.source_identity,source_identities:r.source_identities,merged_login_rows:r.merged_alias_count,unit:d[2]}
  })}}
  const {data:w,error:we}=await db.from("metric_observations").upsert(obs,{onConflict:"source_record_key"}).select("id"); if(we)return J({error:we.message},500);
  await db.from("imports").update({status:"imported",period_start:p.period,period_end:p.period,parser_version:"daily-picking-v5"}).eq("id",import_id);
  return J({ok:true,preview:false,parser_stage:"daily_picking_committed_v3",attempted_count:obs.length,inserted_count:w?.length??0,merge_guard:"canonical-v152"});
 }catch(e){return J({error:String(e?.message||e)},500)}
});
