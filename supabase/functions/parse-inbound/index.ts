import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"content-type":"application/json"}});
const norm=(s:string)=>String(s||"").trim().toLowerCase();
const metric=(bucket:string)=>`inbound_${bucket.toLowerCase()}_units`;

const emailHints=[
 ["tereza.chylova@wolt.c","tereza.chylova@wolt.com"],
 ["jakub.vostradovsky@","jakub.vostradovsky@wolt.com"],
 ["martin.potoniec@wolt","martin.potoniec@wolt.com"],
 ["ondrej.chovanec@wol","ondrej.chovanec@wolt.com"],
];

const canonical=(s:string)=>{
 const n=norm(s).replace("…","");
 for(const [prefix,full] of emailHints)if(n.startsWith(prefix))return full;
 return n;
};

function csvCells(line:string){
 const out:string[]=[];let value="",quoted=false;
 for(let i=0;i<line.length;i++){
  const ch=line[i];
  if(ch==='"'){
   if(quoted&&line[i+1]==='"'){value+='"';i++}else quoted=!quoted;
  }else if(ch===','&&!quoted){out.push(value.trim());value=""}
  else value+=ch;
 }
 out.push(value.trim());return out;
}

function parseCsv(text:string,filename:string){
 const lines=String(text||"").replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim()),rows:any[]=[];
 const parsed=lines.map(csvCells),headerIndex=parsed.findIndex(c=>c.some(x=>/^Received Date$/i.test(x)));
 if(headerIndex<0)return rows;
 const header=parsed[headerIndex],dateCols=header.map((x,i)=>({date:x,index:i})).filter(x=>/^202\d-\d{2}-\d{2}$/.test(x.date));
 const hay=(filename+" "+lines.slice(0,2).join(" ")).toLowerCase();
 const bucket=/freez/.test(hay)?"freez":/\bicy\b/.test(hay)?"icy":"normal";
 for(const cells of parsed.slice(headerIndex+2)){
  if(!/^\d+$/.test(cells[0]||""))continue;
  const id=cells[1]||"",identity=String(cells[2]||"").replace(/\s+/g,"");if(!identity)continue;
  for(const x of dateCols){
   const raw=String(cells[x.index]||"").trim();if(!raw||raw==="∅")continue;
   const value=Number(raw.replace(/\s/g,"").replace(/,/g,""));
   if(Number.isFinite(value))rows.push({alias:identity,user_id:id,date:x.date,bucket,value});
  }
 }
 return rows;
}

function parse(text:string,filename=""){
 if(/(?:^|,)Received Date,/im.test(text)&&/,User ID,/i.test(text))return parseCsv(text,filename);
 const rows:any[]=[]; let bucket="normal", dates:string[]=[];
 for(const raw of text.split("\n")){
  const line=raw.trim(); if(!line)continue;
  if(/^Inbound by GA\/per day \(ICY\)/i.test(line)){bucket="icy";dates=[];continue}
  if(/^Inbound by GA\/per day \(FREEZ\)/i.test(line)){bucket="freez";dates=[];continue}
  if(/^Inbound by GA\/per day$/i.test(line)){bucket="normal";dates=[];continue}
  if(/^Received Date \|/.test(line)){
   dates=line.split("|").map(x=>x.trim()).filter(x=>/^202\d-\d{2}-\d{2}$/.test(x));
   continue;
  }
  if(!dates.length || /^Totals \|/i.test(line) || !/^\d+\s*\|/.test(line))continue;

  const p=line.split("|").map(x=>x.trim());
  const totalIdx=p.length-1, valueStart=totalIdx-dates.length;
  if(valueStart<3)continue;

  const id=p[1]||"", identity=p.slice(2,valueStart).join("").replace(/\s+/g,"");
  const vals=p.slice(valueStart,totalIdx);
  if(!identity)continue;

  vals.forEach((v,i)=>{
   if(v==="∅"||v===""||!dates[i])return;
   const n=Number(v.replace(/\s/g,"").replace(/,/g,""));
   if(Number.isFinite(n))rows.push({alias:identity,user_id:id,date:dates[i],bucket,value:n});
  });
 }
 return rows;
}

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("authorization")||"";if(!auth)return J({error:"Unauthorized"},401);
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}}}),{data:{user}}=await uc.auth.getUser();
  if(!user)return J({error:"Unauthorized"},401);

  const db=createClient(url,service);
  const {data:adm}=await db.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(!adm)return J({error:"Forbidden"},403);

  const b=await req.json(),id=b.import_id,mode=b.mode||"preview",text=b.extracted_text||"";
  if(!id||!text)return J({error:"Missing import_id or extracted_text"},400);

  const {data:imp,error:impErr}=await db.from("imports").select("filename").eq("id",id).single();
  if(impErr)return J({error:impErr.message},400);
  const rows=parse(text,imp?.filename||"");
  if(!rows.length)return J({error:"No inbound rows parsed"},422);

  const {data:persistentIgnored,error:ignoreErr}=await db.from("ignored_identities").select("normalized_value").eq("source_type","inbound");
  if(ignoreErr)return J({error:ignoreErr.message},500);
  const ignoredSet=new Set((persistentIgnored||[]).map((x:any)=>norm(x.normalized_value)));
  const ignoredRows=rows.filter((r:any)=>{
    const isUnknown=canonical(r.alias)==="unknow_userid";
    return isUnknown?ignoredSet.has(norm(r.user_id)):ignoredSet.has(norm(r.alias))||ignoredSet.has(canonical(r.alias));
  });
  const activeRows=rows.filter((r:any)=>!ignoredRows.includes(r));
  const knownRows=activeRows.filter(r=>canonical(r.alias)!=="unknow_userid");
  const emailNames=[...new Set(knownRows.map(r=>canonical(r.alias)))];
  const unknownRows=activeRows.filter(r=>canonical(r.alias)==="unknow_userid");
  const unknownIds=[...new Set(unknownRows.map(r=>norm(r.user_id)).filter(Boolean))];

  const [{data:emailAliases,error:emailErr},{data:idAliases,error:idErr}]=await Promise.all([
   emailNames.length
    ? db.from("person_aliases").select("person_id,normalized_value,confirmed,alias_type").in("normalized_value",emailNames)
    : Promise.resolve({data:[],error:null}),
   unknownIds.length
    ? db.from("person_aliases").select("person_id,normalized_value,confirmed,alias_type").eq("alias_type","wolt_user_id").in("normalized_value",unknownIds)
    : Promise.resolve({data:[],error:null})
  ]);
  if(emailErr)return J({error:emailErr.message},500);
  if(idErr)return J({error:idErr.message},500);

  const emailMap=new Map((emailAliases||[]).filter((x:any)=>x.confirmed!==false).map((x:any)=>[x.normalized_value,x.person_id]));
  const idMap=new Map((idAliases||[]).filter((x:any)=>x.confirmed!==false).map((x:any)=>[x.normalized_value,x.person_id]));

  const unresolvedKnown=[...new Set(
   knownRows.filter(r=>!emailMap.has(canonical(r.alias))).map(r=>r.alias)
  )];

  const summary=activeRows.map(r=>{
   const isUnknown=canonical(r.alias)==="unknow_userid";
   const person_id=isUnknown ? (idMap.get(norm(r.user_id))||null) : (emailMap.get(canonical(r.alias))||null);
   return {...r,person_id,metric_id:metric(r.bucket)};
  });

  const unresolvedUnknownIds=[...new Set(
   summary.filter(r=>canonical(r.alias)==="unknow_userid"&&!r.person_id).map(r=>r.user_id).filter(Boolean)
  )];
  const resolvedUnknownIds=[...new Set(
   summary.filter(r=>canonical(r.alias)==="unknow_userid"&&r.person_id).map(r=>r.user_id).filter(Boolean)
  )];

  const dates=activeRows.map(r=>r.date).sort();
  if(mode==="preview")return J({
   ok:true,preview:true,parser_stage:"inbound_parsed_v7",
   period_start:dates[0],period_end:dates.at(-1),
   row_count:activeRows.length,
   parsed_row_count:rows.length,
   ignored_identities:[...new Set(ignoredRows.map((r:any)=>canonical(r.alias)==="unknow_userid"?r.user_id:r.alias))],
   matched_rows:summary.filter(r=>r.person_id).length,
   unresolved:unresolvedKnown,
   unknown_user_rows:unknownRows.length,
   unknown_user_ids:unknownIds,
   unresolved_unknown_user_ids:unresolvedUnknownIds,
   resolved_unknown_user_ids:resolvedUnknownIds,
   rows:summary
  });

  if(unresolvedKnown.length)return J({
   error:"Unresolved known identities",
   detail:unresolvedKnown.join(", "),
   unresolved:unresolvedKnown
  },409);

  const defs=[["normal","Inbound Units"],["icy","Inbound ICY Units"],["freez","Inbound FREEZ Units"]]
   .map(([k,label])=>({
    metric_id:metric(k),label,unit:"count",category:"volume",
    lower_is_better:false,default_granularity:"day"
   }));

  const {error:de}=await db.from("metric_definitions").upsert(defs,{onConflict:"metric_id"});
  if(de)return J({error:de.message},500);

  const matched=summary.filter(r=>r.person_id);
  const obs=matched.map(r=>{
   const isUnknown=canonical(r.alias)==="unknow_userid";
   const sourceIdentity=isUnknown?`wolt:${norm(r.user_id)}`:canonical(r.alias);
   return {
    person_id:r.person_id,
    metric_id:r.metric_id,
    value:r.value,
    period_start:r.date,
    period_end:r.date,
    granularity:"day",
    source_type:"inbound",
    import_id:id,
    source_record_key:`mo|inbound|${r.person_id}|${r.metric_id}|${r.date}|${r.date}|day`,
    metadata:{
     source_identity:r.alias,
     wolt_user_id:r.user_id,
     bucket:r.bucket,
     identity_resolution:isUnknown?"wolt_user_id_alias":"known_identity"
    }
   };
  });

  const {data:w,error:we}=await db.from("metric_observations")
   .upsert(obs,{onConflict:"source_record_key"}).select("id");
  if(we)return J({error:we.message},500);

  // Persist every still-unknown Wolt ID as one durable reconciliation record per import.
  // Store the complete observed day/bucket activity in metadata so month-end matching
  // can compare it against Quinyx and other monthly GA sources.
  for(const uid of unresolvedUnknownIds){
   const activity=summary
    .filter(r=>canonical(r.alias)==="unknow_userid"&&norm(r.user_id)===norm(uid))
    .map(r=>({date:r.date,bucket:r.bucket,value:r.value}))
    .sort((a,b)=>a.date.localeCompare(b.date)||a.bucket.localeCompare(b.bucket));

   const totals:any={normal:0,icy:0,freez:0};
   for(const a of activity)totals[a.bucket]=(totals[a.bucket]||0)+a.value;

   const activeDays=[...new Set(activity.map(a=>a.date))].sort();

   const {data:existing}=await db.from("unresolved_identities")
    .select("id")
    .eq("import_id",id)
    .eq("source_type","inbound")
    .eq("alias_type","wolt_user_id")
    .eq("alias_value",uid)
    .maybeSingle();

   const payload={
    alias_type:"wolt_user_id",
    alias_value:uid,
    source_type:"inbound",
    import_id:id,
    status:"unresolved",
    metadata:{
     period_start:dates[0],
     period_end:dates.at(-1),
     active_days:activeDays,
     activity,
     bucket_totals:totals,
     parser_version:"inbound-v7"
    }
   };

   if(existing?.id){
    await db.from("unresolved_identities").update(payload).eq("id",existing.id);
   }else{
    await db.from("unresolved_identities").insert(payload);
   }
  }

  await db.from("imports").update({
   status:"imported",
   period_start:dates[0],
   period_end:dates.at(-1),
   parser_version:"inbound-v7"
  }).eq("id",id);

  return J({
   ok:true,
   inserted_count:w?.length??0,
   attempted_count:obs.length,
   reconciliation_written:unresolvedUnknownIds.length,
   unresolved_unknown_user_ids:unresolvedUnknownIds,
   resolved_unknown_user_ids:resolvedUnknownIds,
   merge_guard:"canonical-v152"
  });
 }catch(e){
  return J({error:String((e as any)?.message||e)},500)
 }
});
