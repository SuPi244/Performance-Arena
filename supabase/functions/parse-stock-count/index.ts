import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"
};
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});

const norm=(s:string)=>String(s||"").trim().toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/\s+/g," ");

function addDays(date:string,n:number){
  const d=new Date(date+"T12:00:00Z");
  d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
}

function parse(text:string){
  const clean=String(text||"").replace(/\u00a0/g," ").replace(/[|]/g," ");
  const wm=clean.match(/Created At Week\s+(\d{4}-\d{2}-\d{2})/i);
  if(!wm) return {period_start:null,period_end:null,source_rows:[],rows:[]};

  const period_start=wm[1],period_end=addDays(period_start,6);
  const source_rows:any[]=[];

  for(const raw of clean.split(/\r?\n/)){
    const line=raw.replace(/\s+/g," ").trim();
    if(!line || /^Totals\b/i.test(line)) continue;
    const m=line.match(/(?:^|\s)(?:\d+\s+)?STOCK_COUNT\s+(\S+)\s+([\d,]+)\s*$/i);
    if(!m) continue;
    const alias=m[1].trim();
    const value=Number(m[2].replace(/,/g,""));
    if(!Number.isFinite(value)) continue;
    source_rows.push({alias,value});
  }

  const agg=new Map<string,{alias:string,value:number,source_rows:number}>();
  for(const r of source_rows){
    const k=norm(r.alias);
    const x=agg.get(k)||{alias:r.alias,value:0,source_rows:0};
    x.value+=r.value;x.source_rows++;
    agg.set(k,x);
  }

  return {period_start,period_end,source_rows,rows:[...agg.values()]};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const auth=req.headers.get("authorization")||"";
    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user}}=await userClient.auth.getUser();
    if(!user) return J({error:"Unauthorized"},401);

    const db=createClient(url,service);
    const {data:adm}=await db.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
    if(!adm) return J({error:"Forbidden"},403);

    const b=await req.json();
    const import_id=b.import_id,mode=b.mode||"preview",text=b.extracted_text||"";
    if(!import_id||!text) return J({error:"Missing import_id or extracted_text"},400);

    const {data:imp,error:ie}=await db.from("imports")
      .select("id,filename,report_type,status").eq("id",import_id).single();
    if(ie||!imp) return J({error:ie?.message||"Import not found"},400);

    const p=parse(text);
    if(!p.period_start||!p.rows.length) return J({error:"No Stock Count rows parsed"},422);

    const compact=(s:any)=>norm(String(s||"")).replace(/[^a-z0-9]+/g,"");
    const isTechnicalIdentity=(s:any)=>{const x=compact(s);return x==="woltmark"||x.startsWith("woltmarketholesovice")};
    const technicalRows=p.rows.filter((r:any)=>isTechnicalIdentity(r.alias));
    const candidateRows=p.rows.filter((r:any)=>!isTechnicalIdentity(r.alias));
    const {data:persistentIgnored,error:ignoreErr}=await db.from("ignored_identities").select("normalized_value").eq("source_type","stock_count");
    if(ignoreErr)return J({error:ignoreErr.message},500);
    const ignoredSet=new Set((persistentIgnored||[]).map((x:any)=>norm(x.normalized_value)));
    const burnerRows=candidateRows.filter((r:any)=>ignoredSet.has(norm(r.alias)));
    const ignored=[...technicalRows,...burnerRows];
    const humanRows=candidateRows.filter((r:any)=>!ignoredSet.has(norm(r.alias)));
    const aliases=humanRows.map((r:any)=>norm(r.alias));
    const aliasLookup=aliases.length?await db.from("person_aliases")
      .select("person_id,normalized_value,confirmed").in("normalized_value",aliases):{data:[],error:null};
    const pa=aliasLookup.data,ae=aliasLookup.error;
    if(ae) return J({error:ae.message},500);

    const amap=new Map((pa||[])
      .filter((a:any)=>a.confirmed!==false)
      .map((a:any)=>[a.normalized_value,a.person_id]));

    const rows=humanRows.map((r:any)=>({
      source_identity:r.alias,
      person_id:amap.get(norm(r.alias))||null,
      value:r.value,
      source_rows:r.source_rows
    }));
    const unresolved=rows.filter((r:any)=>!r.person_id).map((r:any)=>r.source_identity);
    const matched=rows.filter((r:any)=>r.person_id);

    if(mode==="preview") return J({
      ok:true,preview:true,parser_stage:"stock_count_parsed_v2",
      import_id,filename:imp.filename,
      period_start:p.period_start,period_end:p.period_end,
      source_row_count:p.source_rows.length,
      parsed_identity_count:p.rows.length,
      identity_count:rows.length,
      ignored_identities:ignored.map((r:any)=>r.alias),
      matched_count:matched.length,
      unresolved_count:unresolved.length,
      unresolved,
      observation_count:matched.length,
      rows
    });

    if(mode!=="commit") return J({error:"Unsupported mode"},400);

    await db.from("metric_definitions").upsert([{
      metric_id:"stock_count_adjustment_count",
      label:"Stock Count Inventory Adjustments",
      unit:"count",
      category:"activity",
      lower_is_better:false,
      default_granularity:"week"
    }],{onConflict:"metric_id"});

    const obs=matched.map((r:any)=>({
      person_id:r.person_id,
      metric_id:"stock_count_adjustment_count",
      value:r.value,
      period_start:p.period_start,
      period_end:p.period_end,
      granularity:"week",
      source_type:"stock_count",
      import_id,
      source_record_key:`mo|stock_count|${r.person_id}|stock_count_adjustment_count|${p.period_start}|${p.period_end}|week`,
      metadata:{
        source_identity:r.source_identity,
        source_rows:r.source_rows,
        adjustment_reason:"STOCK_COUNT"
      }
    }));

    const {data:w,error:we}=await db.from("metric_observations")
      .upsert(obs,{onConflict:"source_record_key"}).select("id");
    if(we) return J({error:we.message},500);

    for(const r of rows.filter((x:any)=>!x.person_id)){
      const {data:existing}=await db.from("unresolved_identities")
        .select("id").eq("import_id",import_id).eq("source_type","stock_count")
        .eq("alias_value",r.source_identity).maybeSingle();
      if(!existing){
        await db.from("unresolved_identities").insert({
          alias_type:r.source_identity.includes("@")?"email":"other",
          alias_value:r.source_identity,
          source_type:"stock_count",
          import_id,
          status:"unresolved",
          metadata:{
            period_start:p.period_start,
            period_end:p.period_end,
            adjustment_count:r.value,
            source_rows:r.source_rows
          }
        });
      }
    }

    await db.from("imports").update({
      status:"imported",
      period_start:p.period_start,
      period_end:p.period_end,
      parser_version:"stock-count-v4"
    }).eq("id",import_id);

    return J({
      ok:true,committed:true,
      inserted_count:w?.length??0,
      attempted_count:obs.length,
      unresolved_count:unresolved.length,
      merge_guard:"canonical-v152",
      unresolved
    });
  }catch(e){
    return J({error:String((e as any)?.message||e)},500);
  }
});
