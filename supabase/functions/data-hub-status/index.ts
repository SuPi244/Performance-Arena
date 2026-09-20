import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"content-type":"application/json"}});
const norm=(v:any)=>String(v??"").trim().toLowerCase();
const normIdentity=(v:any)=>norm(v);
function aliasTypeFor(reportType:string,alias:string){
  const a=String(alias||"").trim();
  if(a.includes("@"))return "email";
  if(reportType==="inbound")return /^[a-f0-9…]{8,}$/i.test(a.replace(/\s+/g,""))?"wolt_user_id":"picker_username";
  if(reportType==="quinyx")return "quinyx_name";
  if(reportType==="stock_count")return "other";
  if(reportType==="team_rating")return "email";
  return "picker_username";
}
async function ignoredSet(db:any,reportType:string){
  const {data,error}=await db.from("ignored_identities").select("normalized_value").eq("source_type",reportType);
  if(error)throw error;
  return new Set((data||[]).map((x:any)=>normIdentity(x.normalized_value)));
}

const compactIdentity=(v:any)=>norm(v).replace(/[^a-z0-9]+/g,"");
const isTechnicalIdentity=(v:any)=>{const x=compactIdentity(v);return x==="woltmark"||x.startsWith("woltmarketholesovice")};
const day=(v:any)=>String(v??"").slice(0,10);
const addDays=(iso:string,n:number)=>{const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const daysInMonth=(y:number,m:number)=>new Date(Date.UTC(y,m,0)).getUTCDate();
const clamp=(v:number,a=0,b=100)=>Math.max(a,Math.min(b,v));
const pct=(a:number,b:number)=>b?Math.round(a/b*100):0;
const sameScalar=(a:any,b:any)=>{
  if(a==null&&b==null)return true;
  const na=Number(a),nb=Number(b);
  if(Number.isFinite(na)&&Number.isFinite(nb))return Math.abs(na-nb)<1e-9;
  return String(a??"")===String(b??"");
};

function metricKey(r:any){
  const identity=r.person_id||("alias:"+norm(r.source_identity||r.source_email||r.email||"unknown"));
  return ["mo",norm(r.source_type),identity,norm(r.metric_id),day(r.period_start),day(r.period_end),norm(r.granularity)].join("|");
}
function shiftKey(r:any){
  return ["shift",r.person_id||"unknown",day(r.shift_date),norm(r.role).replace(/\s+/g," "),norm(r.shift_type).replace(/\s+/g," ")].join("|");
}
function storeKey(r:any){
  return ["store",norm(r.venue_key),norm(r.metric_id),day(r.period_start),day(r.period_end),norm(r.granularity)].join("|");
}

const storeCardPersonFields:any={
  store_card_orders_picked:"orders_picked",store_card_total_units_picked:"total_units_picked",
  store_card_missing_items_ratio:"missing_items_ratio",store_card_undelivered_items_ratio:"undelivered_items_ratio",
  store_card_scan_to_pick_ratio:"scan_to_pick_ratio",store_card_bad_goods_rating_ratio:"bad_goods_rating_ratio",
  store_card_avg_goods_rating:"avg_goods_rating",store_card_venue_related_cs_tickets_ratio:"venue_related_cs_tickets_ratio",
  store_card_average_accepted_time:"average_accepted_time",store_card_average_collection_time:"average_collection_time",
  store_card_average_start_collection_time:"average_start_collection_time",store_card_inbound_total_units:"inbound_total_units",
  store_card_inbound_icy_units:"inbound_icy_units",store_card_inbound_freeze_units:"inbound_freeze_units",
  store_card_stock_count:"stock_count",store_card_team_rating:"team_rating",store_card_score_outbound:"score_outbound",
  store_card_score_quality:"score_quality",store_card_score_speed:"score_speed",
  store_card_score_inbound_stock:"score_inbound_stock",store_card_score_people:"score_people",
  store_card_total_points:"total_points"
};
const storeCardStoreFields:any={
  store_outbound_seconds_per_unit:"outbound_seconds_per_unit",store_outercase_scan_ratio:"outercase_scan_ratio",
  store_pofr:"pofr",store_weighted_availability:"weighted_availability",store_uph:"uph",
  store_missing_items_ratio:"missing_items_ratio",store_undelivered_items_ratio:"undelivered_items_ratio",
  store_task_completion_ratio:"task_completion_ratio",store_total_score:"total_score"
};

async function previewRecords(db:any,reportType:string,p:any){
  const records:any[]=[];
  const addMetric=(r:any,label:string)=>records.push({table:"metric_observations",key:metricKey(r),label,value:r.value,record:r});
  const addStore=(r:any,label:string)=>records.push({table:"store_metrics",key:storeKey(r),label,value:r.value,record:r});

  if(reportType==="ga_metrics"||reportType==="daily_picking"||reportType==="team_rating"){
    const source_type=reportType,granularity=reportType==="ga_metrics"?"week":reportType==="team_rating"?"month":"day";
    for(const person of p.people||[]){
      if(!person.person_id)continue;
      for(const [metric_id,value] of Object.entries(person.values||{})){
        if(value==null)continue;
        const r={source_type,person_id:person.person_id,metric_id,value,period_start:p.period_start,period_end:p.period_end,granularity};
        addMetric(r,`${person.source_identity||person.person_id} · ${metric_id}`);
      }
    }
  }else if(reportType==="inbound"){
    for(const x of p.rows||[]){
      if(!x.person_id||x.value==null)continue;
      const r={source_type:"inbound",person_id:x.person_id,metric_id:x.metric_id,value:x.value,period_start:x.date,period_end:x.date,granularity:"day"};
      addMetric(r,`${x.alias||x.person_id} · ${x.date} · ${x.bucket||x.metric_id}`);
    }
  }else if(reportType==="stock_count"){
    for(const x of p.rows||[]){
      if(!x.person_id||x.value==null)continue;
      const r={source_type:"stock_count",person_id:x.person_id,metric_id:"stock_count_adjustment_count",value:x.value,period_start:p.period_start,period_end:p.period_end,granularity:"week"};
      addMetric(r,`${x.source_identity||x.person_id} · Stock Count`);
    }
  }else if(reportType==="quinyx"){
    const personKeys=[...new Set((p.rows||[]).map((x:any)=>x.person_key).filter(Boolean))];
    const {data:people,error}=personKeys.length?await db.from("people").select("id,person_key").in("person_key",personKeys):{data:[],error:null};
    if(error)throw error;
    const personMap=new Map((people||[]).map((x:any)=>[x.person_key,x.id]));
    for(const x of p.rows||[]){
      const person_id=personMap.get(x.person_key);if(!person_id)continue;
      const r={person_id,person_key:x.person_key,shift_date:x.date,role:x.role,shift_type:x.shift_type,
        scheduled_start:x.scheduled_start,scheduled_end:x.scheduled_end,actual_start:x.actual_start,actual_end:x.actual_end,
        scheduled_hours:x.scheduled_hours,worked_hours:x.actual_worked_hours};
      records.push({table:"shifts",key:shiftKey(r),label:`${x.name||x.person_key} · ${x.date} · ${x.role}`,value:r,record:r});
    }
  }else if(reportType==="store_metrics"){
    for(const venue of p.rows||[]){
      for(const [metric_id,value] of Object.entries(venue.values||{})){
        const r={venue_key:venue.venue_key,metric_id,value,period_start:p.period_start,period_end:p.period_end,granularity:"month"};
        addStore(r,`${venue.venue||venue.venue_key} · ${metric_id}`);
      }
    }
  }else if(reportType==="universal_metrics"){
    for(const x of p.observations||[]){
      if(!x.person_id||x.value==null)continue;
      const r={source_type:x.source_type||"universal_metrics",person_id:x.person_id,metric_id:x.metric_id,value:x.value,period_start:x.period_start,period_end:x.period_end,granularity:x.granularity};
      addMetric(r,`${x.source_identity||x.person_id} · ${x.metric_label||x.metric_id}`);
    }
    for(const x of p.store_metrics||[]){
      if(!x.venue_key||x.value==null)continue;
      const r={venue_key:x.venue_key,metric_id:x.metric_id,value:x.value,period_start:x.period_start,period_end:x.period_end,granularity:x.granularity};
      addStore(r,`${x.venue||x.venue_key} · ${x.metric_label||x.metric_id}`);
    }
  }else if(reportType==="store_card_monthly"){
    for(const person of p.people||[]){
      for(const [metric_id,field] of Object.entries(storeCardPersonFields)){
        const value=person[field as string];if(value==null)continue;
        if(!person.person_id){records.push({table:"pending",key:`pending|${norm(person.email||person.picker_login||person.display_name)}|${metric_id}`,label:`${person.display_name||person.email||"Nový historický profil"} · ${metric_id}`,value,record:{value}});continue}
        const r={source_type:"store_card_monthly",person_id:person.person_id,metric_id,value,period_start:p.period_start,period_end:p.period_end,granularity:"month"};
        addMetric(r,`${person.display_name||person.email||person.person_id} · ${metric_id}`);
      }
    }
    for(const venue of p.store_metrics||[]){
      for(const [metric_id,field] of Object.entries(storeCardStoreFields)){
        const value=venue[field as string];
        const r={venue_key:venue.venue_key,metric_id,value,period_start:p.period_start,period_end:p.period_end,granularity:"month"};
        addStore(r,`${venue.venue||venue.venue_key} · ${metric_id}`);
      }
    }
  }else throw new Error(`Unsupported report type: ${reportType}`);
  return records;
}

function shiftLocal(iso:any){
  if(!iso)return null;
  const d=new Date(iso);if(!Number.isFinite(d.getTime()))return null;
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d);
  const m:any={};for(const x of parts)m[x.type]=x.value;
  return `${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute}`;
}
function shiftPreviewLocal(date:string,time:any,start:any=null){
  if(!time)return null;
  let d=date;
  if(start){
    const a=String(start).split(":").map(Number),b=String(time).split(":").map(Number);
    if(b[0]*60+b[1]<=a[0]*60+a[1])d=addDays(date,1);
  }
  return `${d} ${String(time).slice(0,5)}`;
}
function compareRecord(candidate:any,existing:any){
  if(candidate.table==="metric_observations"||candidate.table==="store_metrics"||candidate.table==="pending"){
    const oldValue=existing?.value??existing?.text_value??null;
    return {same:sameScalar(oldValue,candidate.value),oldValue,newValue:candidate.value};
  }
  const c=candidate.record||{},pairs=[
    ["scheduled_start",shiftLocal(existing?.scheduled_start),shiftPreviewLocal(c.shift_date,c.scheduled_start)],
    ["scheduled_end",shiftLocal(existing?.scheduled_end),shiftPreviewLocal(c.shift_date,c.scheduled_end,c.scheduled_start)],
    ["actual_start",shiftLocal(existing?.actual_start),shiftPreviewLocal(c.shift_date,c.actual_start)],
    ["actual_end",shiftLocal(existing?.actual_end),shiftPreviewLocal(c.shift_date,c.actual_end,c.actual_start)],
    ["scheduled_hours",existing?.scheduled_hours,c.scheduled_hours],
    ["worked_hours",existing?.worked_hours,c.worked_hours]
  ];
  const changed=pairs.filter(([,a,b])=>!sameScalar(a,b)).map(([k])=>k);
  return {same:changed.length===0,oldValue:pairs.map(([k,a])=>[k,a]),newValue:pairs.map(([k,,b])=>[k,b]),changedFields:changed};
}

async function existingByKeys(db:any,table:string,keys:string[]){
  const out:any[]=[];
  for(let i=0;i<keys.length;i+=20){
    const chunk=keys.slice(i,i+20);if(!chunk.length)continue;
    const cols=table==="shifts"?"source_record_key,scheduled_start,scheduled_end,actual_start,actual_end,scheduled_hours,worked_hours":
      "source_record_key,value,text_value";
    const {data,error}=await db.from(table).select(cols).in("source_record_key",chunk);
    if(error)throw error;out.push(...(data||[]));
  }
  return new Map(out.map(x=>[x.source_record_key,x]));
}

async function preflight(db:any,reportType:string,p:any){
  const raw=await previewRecords(db,reportType,p),byKey=new Map<string,any>(),conflicts:any[]=[];
  const warnings:any[]=[];let duplicateRows=0;
  const ignored=await ignoredSet(db,reportType);
  const unresolved=(p.unresolved||[]).filter((x:any)=>x&&!isTechnicalIdentity(x)&&!ignored.has(normIdentity(x)));
  if(["ga_metrics","daily_picking","inbound","team_rating"].includes(reportType)){
    for(const identity of unresolved)conflicts.push({
      key:`identity:${identity}`,label:String(identity),alias_value:String(identity),alias_type:aliasTypeFor(reportType,String(identity)),
      reason:"Nerozpoznaná identita blokuje potvrzení"
    });
    if(reportType==="inbound"){
      for(const uid of p.unresolved_unknown_user_ids||[]){
        if(uid&&!ignored.has(normIdentity(uid)))conflicts.push({
          key:`identity:${uid}`,label:String(uid),alias_value:String(uid),alias_type:"wolt_user_id",
          reason:"Neznámý Wolt User ID — přiřaď člověka nebo označ jako burner"
        });
      }
    }
  }else if(reportType==="stock_count"&&unresolved.length){
    warnings.push({reason:"Nerozpoznané Stock Count identity zůstanou v reconciliation queue",items:unresolved});
  }
  if(reportType==="store_card_monthly"){
    for(const x of p.identity_conflicts||[])conflicts.push({
      key:`identity:${x.email||x.picker_login}`,label:x.display_name||x.email||x.picker_login,
      alias_value:x.email||x.picker_login,alias_type:x.email?"email":"picker_username",reason:"Konflikt identity blokuje potvrzení"
    });
    const br=p.bonus_rules||{},tb=br.team_bonus||{},thr=tb.thresholds||{};
    if(!Array.isArray(br.top_bonus_czk)||br.top_bonus_czk.length<5)conflicts.push({
      key:"store-card:top-bonus-rules",label:"TOP 1–5",reason:"Z PDF se nepodařilo spolehlivě přečíst všech 5 TOP bonusů"
    });
    const teamBonusExists=tb.exists!==false&&p.team_bonus_exists!==false;
    if(teamBonusExists&&(thr.high_min_pct==null||thr.mid_min_pct==null||(tb.forty_h_czk||[]).length<3||(tb.thirty_h_czk||[]).length<3))conflicts.push({
      key:"store-card:team-bonus-rules",label:"Team Bonus",reason:"Team Bonus tabulka v PDF existuje, ale chybí hranice nebo částky 40h/30h"
    });
    if(!(p.payouts||[]).length)conflicts.push({
      key:"store-card:payout-table",label:"Payout tabulka",reason:"Nebyl spolehlivě napárován ani jeden oficiální payout — commit je blokovaný"
    });
  }
  if(reportType==="team_rating"){
    for(const x of p.conflicts||[])conflicts.push({key:"team-rating:"+String(x),label:String(x),reason:"Konflikt Team Rating parseru"});
    for(const x of p.warnings||[])warnings.push({reason:String(x)});
  }
  if(reportType==="universal_metrics"){
    (p.conflicts||[]).forEach((x:any,i:number)=>conflicts.push({key:"universal:"+(x.key||x.line||i),label:x.metric_id||x.alias||x.raw_line||"Universal mapping",reason:x.reason||"Nejasné mapování"}));
    for(const x of p.warnings||[])warnings.push({reason:x.reason||String(x),metric_id:x.metric_id||null,line:x.line||null});
  }
  if(reportType==="quinyx"){
    const resolved=new Set(raw.map((x:any)=>x.record?.person_key).filter(Boolean));
    const missing=[...new Set((p.rows||[]).map((x:any)=>x.person_key).filter((x:any)=>x&&!resolved.has(x)))];
    for(const identity of missing)conflicts.push({key:`identity:${identity}`,label:String(identity),alias_value:String(identity),alias_type:"quinyx_name",reason:"Quinyx osoba není napojená na profil"});
    const v=p.validation||{};
    if(Number(v.missing_planned||0)>0)conflicts.push({
      key:"quinyx:missing_planned",label:String(v.missing_planned)+" směn",
      reason:"Quinyx parser u některých směn nenašel plánovaný začátek/konec",
      details:v.missing_planned_rows||[]
    });
    if(Number(v.future_actuals||0)>0)conflicts.push({
      key:"quinyx:future_actuals",label:String(v.future_actuals)+" směn",
      reason:"Actual clock je na budoucím datu — pravděpodobně chybně rozpoznané období",
      details:v.future_actual_rows||[]
    });
    if((v.missing_date_pages||[]).length)conflicts.push({
      key:"quinyx:missing_date_pages",label:"page "+(v.missing_date_pages||[]).join(", "),
      reason:"Na těchto stránkách se nepodařilo bezpečně určit datumové období"
    });
  }
  for(const r of raw){
    const prev=byKey.get(r.key);
    if(!prev){byKey.set(r.key,r);continue}
    duplicateRows++;
    const cmp=compareRecord(r,prev.record||{value:prev.value});
    if(!cmp.same)conflicts.push({key:r.key,label:r.label,reason:"Různé hodnoty uvnitř stejného uploadu",old_value:prev.value,new_value:r.value});
  }
  const records=[...byKey.values()],tables=[...new Set(records.map(x=>x.table))],existingMaps=new Map<string,Map<string,any>>();
  for(const table of tables){
    const keys=records.filter(x=>x.table===table).map(x=>x.key);
    existingMaps.set(table,table==="pending"?new Map():await existingByKeys(db,table,keys));
  }
  const changes:any[]=[];let added=0,unchanged=0,changed=0;
  for(const r of records){
    const old=existingMaps.get(r.table)?.get(r.key);
    if(!old){added++;changes.push({action:"new",table:r.table,key:r.key,label:r.label,new_value:r.value});continue}
    const cmp=compareRecord(r,old);
    if(cmp.same)unchanged++;
    else{changed++;changes.push({action:"changed",table:r.table,key:r.key,label:r.label,old_value:cmp.oldValue,new_value:cmp.newValue,changed_fields:cmp.changedFields||["value"]})}
  }
  return {summary:{total:records.length,new:added,unchanged,changed,conflicts:conflicts.length,warnings:warnings.length,duplicate_rows:duplicateRows},changes:changes.slice(0,250),conflict_details:conflicts.slice(0,100),warning_details:warnings.slice(0,100)};
}

function isoWeek(date:string){
  const d=new Date(date+"T12:00:00Z"),t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));
  const y=new Date(Date.UTC(t.getUTCFullYear(),0,1));
  return 1+Math.ceil((((t.getTime()-y.getTime())/86400000)+1)/7);
}
function monday(date:string){const d=new Date(date+"T12:00:00Z"),delta=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-delta);return d.toISOString().slice(0,10)}
function spanCovers(imports:any[],from:string,to:string,type:string){
  return imports.some(x=>x.report_type===type&&x.status==="imported"&&day(x.period_start)<=from&&day(x.period_end)>=to);
}
function coverageState(covered:number,expected:number,currentPartial=false){
  if(expected===0)return "future";
  if(covered>=expected)return "complete";
  if(covered>0||currentPartial)return "partial";
  return "missing";
}

async function coverage(db:any,requestedMonth:string){
  const now=new Date(),today=(shiftLocal(now.toISOString())||now.toISOString()).slice(0,10),currentMonth=today.slice(0,7);
  const month=/^20\d{2}-\d{2}$/.test(requestedMonth||"")?requestedMonth:currentMonth;
  const [year,mon]=month.split("-").map(Number),start=`${month}-01`,end=`${month}-${String(daysInMonth(year,mon)).padStart(2,"0")}`;
  const queryStart=addDays(start,-7);
  const metricSources=["ga_metrics","daily_picking","inbound","stock_count","store_card_monthly","team_rating"];
  const [
    {data:allImports,error:ie},
    {data:obs,error:oe},
    {data:metricHistory,error:mhe},
    {data:shifts,error:se},
    {data:storeMetrics,error:sme},
    {data:storeCards,error:sce},
    {data:unresolved,error:ue},
    {data:teamRating,error:tre},
    {data:activePeople,error:ape}
  ]=await Promise.all([
    db.from("imports").select("id,filename,report_type,period_start,period_end,status,metadata,parser_version,created_at").order("created_at",{ascending:false}).limit(500),
    db.rpc("data_hub_metric_coverage_spans",{p_start:queryStart,p_end:end}),
    db.rpc("data_hub_metric_type_history"),
    db.from("shifts").select("shift_date,scheduled_start,actual_start,shift_type").gte("shift_date",start).lte("shift_date",end).limit(20000),
    db.from("store_metrics").select("venue_key,period_start,period_end,metric_id,metadata").lte("period_start",end).gte("period_end",start).limit(20000),
    db.from("store_card_months").select("month,status").eq("month",start),
    db.from("unresolved_identities").select("source_type,status,metadata").eq("status","unresolved").limit(2000),
    db.from("team_rating_responses").select("respondent_person_id,is_valid,disqualified_reason,submitted_at,metadata").eq("response_month",start),
    db.from("people").select("id,display_name,active,employment_type,team_effort_eligible").eq("active",true)
  ]);
  const err=ie||oe||mhe||se||sme||sce||ue||tre||ape;if(err)throw err;
  const imports=allImports||[],observations=obs||[],allMetricRows=metricHistory||[],shiftRows=shifts||[];
  const imps=imports.filter((x:any)=>x.status==="imported"&&day(x.period_start)<=end&&day(x.period_end)>=queryStart);
  const unresolvedCounts:any={};
  for(const x of unresolved||[]){const ps=day(x.metadata?.period_start),pe=day(x.metadata?.period_end||ps);if(ps<=end&&pe>=start)unresolvedCounts[x.source_type]=(unresolvedCounts[x.source_type]||0)+1}

  const monthStart=(d:string)=>String(d||"").slice(0,7);
  const nextMonth=(ym:string)=>{const [y,m]=ym.split("-").map(Number),d=new Date(Date.UTC(y,m,1));return d.toISOString().slice(0,7)};
  const importHistory=(id:string)=>{
    const rows=imports.filter((x:any)=>x.report_type===id);
    const committed=rows.filter((x:any)=>x.status==="imported");
    const staged=rows.filter((x:any)=>["staged","previewed","partial"].includes(String(x.status)));
    const dated=committed.filter((x:any)=>day(x.period_start)&&day(x.period_end));
    const first=dated.length?dated.map((x:any)=>day(x.period_start)).sort()[0]:null;
    const last=dated.length?dated.map((x:any)=>day(x.period_end)).sort().at(-1):null;
    const months=new Set<string>();
    for(const x of dated){
      let cur=monthStart(day(x.period_start)),to=monthStart(day(x.period_end));
      let guard=0;
      while(cur&&to&&cur<=to&&guard++<60){months.add(cur);cur=nextMonth(cur)}
    }
    return {imported_files:committed.length,staged_files:staged.length,first_date:first,last_date:last,month_count:months.size,months:[...months].sort()};
  };
  const metricCoverage=(id:string)=>{
    const known=new Set(allMetricRows.filter((x:any)=>x.source_type===id).map((x:any)=>x.metric_id).filter(Boolean));
    const present=new Set(observations.filter((x:any)=>x.source_type===id&&day(x.period_start)<=end&&day(x.period_end)>=start).map((x:any)=>x.metric_id).filter(Boolean));
    return {metrics_covered:present.size,metrics_expected:known.size,metrics_percentage:known.size?pct(present.size,known.size):0};
  };
  const enrich=(base:any,id:string)=>Object.assign(base,{history:importHistory(id)},metricCoverage(id));

  const allDays=[];for(let d=start;d<=end;d=addDays(d,1))allDays.push(d);
  const dueEnd=month<currentMonth?end:month===currentMonth?today:addDays(start,-1);
  const dueDays=allDays.filter(d=>d<=dueEnd);
  const daily=(id:string,label:string)=>{
    const coveredSet=new Set<string>();
    for(const x of observations){
      if(x.source_type!==id)continue;
      const ps=day(x.period_start),pe=day(x.period_end||x.period_start);
      if(!ps)continue;
      // Daily sources normally have start=end, but expand a short span defensively.
      let d=ps,guard=0;
      while(d<=pe&&guard++<62){
        if(d>=start&&d<=end)coveredSet.add(d);
        d=addDays(d,1);
      }
    }
    // Imported file periods are a secondary truth source. This makes coverage resilient
    // even when the observation table is large or a source intentionally writes sparse rows.
    for(const x of imports.filter((z:any)=>z.status==="imported"&&z.report_type===id)){
      let d=day(x.period_start),pe=day(x.period_end||x.period_start),guard=0;
      if(!d||!pe)continue;
      while(d<=pe&&guard++<62){
        if(d>=start&&d<=end)coveredSet.add(d);
        d=addDays(d,1);
      }
    }
    const covered=dueDays.filter(d=>coveredSet.has(d)).length;
    const loadedDays=allDays.filter(d=>coveredSet.has(d));
    const segments=allDays.map(d=>({key:d,label:d.slice(8),state:d>dueEnd?"future":coveredSet.has(d)?"complete":d===today?"partial":"missing"}));
    const missing=segments.filter(x=>x.state==="missing").map(x=>x.key);
    const importedFilesInMonth=imports.filter((x:any)=>x.status==="imported"&&x.report_type===id&&day(x.period_start)<=end&&day(x.period_end)>=start).length;
    return enrich({
      id,label,cadence:"day",covered,expected:dueDays.length,percentage:pct(covered,dueDays.length),
      state:coverageState(covered,dueDays.length,segments.some(x=>x.state==="partial")),
      missing,segments,loaded_days:loadedDays,loaded_day_count:loadedDays.length,
      imported_files_in_month:importedFilesInMonth,unresolved:unresolvedCounts[id]||0
    },id);
  };

  const weekStarts:string[]=[];for(let w=monday(start);w<=end;w=addDays(w,7))weekStarts.push(w);
  const weekly=(id:string,label:string)=>{
    const segments=weekStarts.map(w=>{const we=addDays(w,6),future=w>today,covered=spanCovers(imps,w,we,id)||observations.some((x:any)=>x.source_type===id&&day(x.period_start)<=we&&day(x.period_end)>=w);return {key:w,label:`W${String(isoWeek(w)).padStart(2,"0")}`,range:`${w} → ${we}`,state:future?"future":covered?"complete":today<=we?"partial":"missing"}});
    const due=segments.filter(x=>x.state!=="future"),covered=due.filter(x=>x.state==="complete").length,missing=segments.filter(x=>x.state==="missing").map(x=>x.range);
    return enrich({id,label,cadence:"week",covered,expected:due.length,percentage:pct(covered,due.length),state:coverageState(covered,due.length,segments.some(x=>x.state==="partial")),missing,segments,unresolved:unresolvedCounts[id]||0},id);
  };

  const storeCoreIds=["store_outbound_seconds_per_unit","store_outercase_scan_ratio","store_pofr","store_weighted_availability","store_uph","store_missing_items_ratio","store_undelivered_items_ratio","store_task_completion_ratio","store_total_score"];
  const storeCorePresent=new Set((storeMetrics||[]).filter((x:any)=>x.venue_key==="wolt_market_holesovice"&&day(x.period_start)===start&&day(x.period_end)===end).map((x:any)=>x.metric_id));
  const storeMetricCovered=imps.some((x:any)=>x.report_type==="store_metrics"&&day(x.period_start)<=start&&day(x.period_end)>=end)||storeCoreIds.every((id:string)=>storeCorePresent.has(id));
  const storeCardCovered=(storeCards||[]).length>0||imps.some((x:any)=>(x.report_type==="store_card_monthly"||x.metadata?.store_card_monthly)&&day(x.period_start)<=start&&day(x.period_end)>=end);

  // Quinyx coverage comes from the actual stored shifts, not from one PDF spanning the whole month.
  // This is important because a complete month is normally assembled from several weekly exports.
  const scheduledDays=new Set(shiftRows.map((x:any)=>day(x.shift_date)).filter(Boolean));
  const scheduledDueDays=dueDays.filter(d=>scheduledDays.has(d)).length;
  const dueShifts=shiftRows.filter((x:any)=>day(x.shift_date)<=dueEnd);
  const actualShifts=dueShifts.filter((x:any)=>x.actual_start);
  const missingActual=[...new Set(dueShifts.filter((x:any)=>!x.actual_start).map((x:any)=>day(x.shift_date)))];
  const missingSchedule=dueDays.filter(d=>!scheduledDays.has(d));
  const quinyxHasData=shiftRows.length>0;
  const quinyxPct=dueShifts.length?pct(actualShifts.length,dueShifts.length):(dueDays.length?pct(scheduledDueDays,dueDays.length):0);
  const quinyxState=month>currentMonth?"future":!quinyxHasData?"missing":(scheduledDueDays>=dueDays.length&&missingActual.length===0)?"complete":"partial";
  const monthlyExpected=month>currentMonth?0:1;

  const teamRatingLatest=new Map<string,any>();
  for(const r of teamRating||[]){
    if(!r.respondent_person_id||r.disqualified_reason==="outside_form_month"||r.metadata?.within_month===false)continue;
    const k=String(r.respondent_person_id),old=teamRatingLatest.get(k);
    if(!old||String(r.submitted_at)>String(old.submitted_at))teamRatingLatest.set(k,r);
  }
  const teamRatingPeople=(activePeople||[]).filter((p:any)=>p.employment_type==="HPP"||p.team_effort_eligible===true);
  const teamRatingValid=teamRatingPeople.filter((p:any)=>teamRatingLatest.get(String(p.id))?.is_valid===true);
  const teamRatingInvalid=teamRatingPeople.filter((p:any)=>teamRatingLatest.has(String(p.id))&&teamRatingLatest.get(String(p.id))?.is_valid!==true);
  const teamRatingSegments=teamRatingPeople.map((p:any)=>{
    const r=teamRatingLatest.get(String(p.id));
    return {key:String(p.id),label:p.display_name,state:r?.is_valid===true?"complete":r?"partial":month>currentMonth?"future":"missing"};
  });
  const teamRatingExpected=month>currentMonth?0:teamRatingPeople.length;
  const teamRatingSource=enrich({
    id:"team_rating",label:"Team Rating Form",cadence:"response",
    covered:teamRatingValid.length,expected:teamRatingExpected,
    percentage:teamRatingExpected?pct(teamRatingValid.length,teamRatingExpected):0,
    state:month>currentMonth?"future":teamRatingExpected>0&&teamRatingValid.length>=teamRatingExpected?"complete":
      (teamRatingLatest.size>0||month===currentMonth)?"partial":"missing",
    missing:teamRatingSegments.filter((x:any)=>x.state==="missing").map((x:any)=>x.label),
    segments:teamRatingSegments,unresolved:0,disqualified:teamRatingInvalid.length,
    received:teamRatingLatest.size
  },"team_rating");

  const storeMetricsHistory=importHistory("store_metrics");
  const storeCardHistory=importHistory("store_card_monthly");
  const sources:any[]=[
    weekly("ga_metrics","GA Metrics"),
    daily("daily_picking","Daily Picking"),
    daily("inbound","Inbound"),
    {id:"quinyx",label:"Quinyx",cadence:"shift",covered:actualShifts.length,expected:dueShifts.length,percentage:quinyxPct,state:quinyxState,
      missing:[...missingSchedule.map(d=>"schedule "+d),...missingActual.map(d=>"actual "+d)],segments:allDays.map(d=>({key:d,label:d.slice(8),state:d>dueEnd?"future":!scheduledDays.has(d)?"missing":missingActual.includes(d)?"partial":"complete"})),
      planned_shifts:shiftRows.length,due_shifts:dueShifts.length,actual_shifts:actualShifts.length,
      scheduled_days:scheduledDueDays,expected_days:dueDays.length,scheduled_period_complete:scheduledDueDays>=dueDays.length,
      unresolved:unresolvedCounts.quinyx||0,history:importHistory("quinyx"),metrics_covered:actualShifts.length,metrics_expected:dueShifts.length,metrics_percentage:quinyxPct},
    weekly("stock_count","Stock Count"),
    teamRatingSource,
    {id:"store_metrics",label:"Store Metrics",cadence:"month",covered:storeMetricCovered?1:0,expected:monthlyExpected,percentage:storeMetricCovered?100:0,state:storeMetricCovered?"complete":month>currentMonth?"future":month===currentMonth?"partial":"missing",missing:storeMetricCovered||month>currentMonth?[]:[month],segments:[{key:month,label:month,state:storeMetricCovered?"complete":month>currentMonth?"future":month===currentMonth?"partial":"missing"}],unresolved:0,history:storeMetricsHistory,metrics_covered:storeCorePresent.size,metrics_expected:storeCoreIds.length,metrics_percentage:pct(storeCorePresent.size,storeCoreIds.length)},
    {id:"store_card_monthly",label:"Monthly Store Card",cadence:"month",covered:storeCardCovered?1:0,expected:monthlyExpected,percentage:storeCardCovered?100:0,state:storeCardCovered?"complete":month>currentMonth?"future":month===currentMonth?"partial":"missing",missing:storeCardCovered||month>currentMonth?[]:[month],segments:[{key:month,label:month,state:storeCardCovered?"complete":month>currentMonth?"future":month===currentMonth?"partial":"missing"}],unresolved:0,history:storeCardHistory,...metricCoverage("store_card_monthly")}
  ];
  const relevant=sources.filter(x=>x.expected>0),overall=relevant.length?Math.round(relevant.reduce((a,x)=>a+x.percentage,0)/relevant.length):0;
  const staged_total=imports.filter((x:any)=>["staged","previewed","partial"].includes(String(x.status))).length;
  return {month,period_start:start,period_end:end,through:today,overall_percent:clamp(overall),staged_total,sources};
}

async function identityCandidates(db:any){
  const {data,error}=await db.from("people")
    .select("id,person_key,display_name,full_name,active")
    .order("active",{ascending:false})
    .order("display_name",{ascending:true});
  if(error)throw error;
  return (data||[]).filter((p:any)=>p.person_key!=="nick-sch");
}

async function resolveIdentity(db:any,body:any){
  const alias=String(body.alias||"").trim(),personId=String(body.person_id||"").trim(),reportType=String(body.report_type||"");
  if(!alias||!personId)throw new Error("Missing alias or person_id");
  if(isTechnicalIdentity(alias))return {ignored:true,alias,reason:"technical_store_account"};
  const {data:person,error:pe}=await db.from("people").select("id,display_name,active").eq("id",personId).maybeSingle();
  if(pe)throw pe;if(!person)throw new Error("Person not found");
  const aliasType=String(body.alias_type||aliasTypeFor(reportType,alias));
  const normalizedValue=normIdentity(alias);
  const cleaned=(v:any)=>normIdentity(v).replace(/[….]+$/g,"");
  const aliasPrefix=cleaned(alias);

  const {error}=await db.from("person_aliases").upsert({
    person_id:personId,alias_type:aliasType,alias_value:alias,
    source:"data_hub_manual_confirmation",confirmed:true
  },{onConflict:"alias_type,normalized_value"});
  if(error)throw error;

  // Truncated Wolt IDs in PDF exports end with an ellipsis. Persist the visible
  // prefix too, so future inbound previews can resolve it without asking again.
  if(aliasType==="wolt_user_id"&&aliasPrefix&&aliasPrefix!==normalizedValue&&aliasPrefix.length>=12){
    const {error:prefixErr}=await db.from("person_aliases").upsert({
      person_id:personId,alias_type:aliasType,alias_value:aliasPrefix,
      source:"data_hub_manual_confirmation_prefix",confirmed:true
    },{onConflict:"alias_type,normalized_value"});
    if(prefixErr)throw prefixErr;
  }

  await db.from("ignored_identities").delete().eq("source_type",reportType).eq("normalized_value",normalizedValue);
  if(aliasPrefix&&aliasPrefix!==normalizedValue){
    await db.from("ignored_identities").delete().eq("source_type",reportType).eq("normalized_value",aliasPrefix);
  }

  let resolvedRows=0;
  if(aliasType==="wolt_user_id"){
    const {data:pending,error:qe}=await db.from("unresolved_identities")
      .select("id,alias_value")
      .eq("status","unresolved").eq("source_type",reportType).eq("alias_type","wolt_user_id");
    if(qe)throw qe;
    const ids=(pending||[]).filter((x:any)=>{
      const p=cleaned(x.alias_value);
      return p===aliasPrefix || (aliasPrefix.length>=12&&(p.startsWith(aliasPrefix)||aliasPrefix.startsWith(p)));
    }).map((x:any)=>x.id);
    if(ids.length){
      const {error:re}=await db.from("unresolved_identities")
        .update({status:"resolved",resolved_person_id:personId,resolved_at:new Date().toISOString()})
        .in("id",ids);
      if(re)throw re;resolvedRows=ids.length;
    }
  }else{
    const {data:resolved,error:re}=await db.from("unresolved_identities")
      .update({status:"resolved",resolved_person_id:personId,resolved_at:new Date().toISOString()})
      .eq("status","unresolved").eq("source_type",reportType).eq("alias_value",alias)
      .select("id");
    if(re)throw re;resolvedRows=(resolved||[]).length;
  }

  return {alias,alias_type:aliasType,normalized_value:normalizedValue,person_id:personId,display_name:person.display_name,active:person.active,resolved_rows:resolvedRows};
}

async function ignoreIdentity(db:any,body:any){
  const alias=String(body.alias||"").trim(),reportType=String(body.report_type||"").trim();
  if(!alias||!reportType)throw new Error("Missing alias or report_type");
  const aliasType=String(body.alias_type||aliasTypeFor(reportType,alias));
  const normalizedValue=normIdentity(alias);
  const {error}=await db.from("ignored_identities").upsert({
    source_type:reportType,alias_type:aliasType,alias_value:alias,normalized_value:normalizedValue,
    reason:String(body.reason||"burner_or_technical_account"),updated_at:new Date().toISOString()
  },{onConflict:"source_type,alias_type,normalized_value"});
  if(error)throw error;
  await db.from("unresolved_identities")
    .update({status:"ignored",resolved_person_id:null,resolved_at:new Date().toISOString()})
    .eq("status","unresolved").eq("source_type",reportType).eq("alias_value",alias);
  return {ignored:true,alias,alias_type:aliasType,normalized_value:normalizedValue,report_type:reportType};
}

async function importResult(db:any,importId:string){
  const {data,error}=await db.from("import_change_log").select("action,table_name,canonical_key,changed_fields,old_row,new_row,created_at").eq("import_id",importId).order("created_at",{ascending:true}).limit(2000);
  if(error)throw error;
  const rows=data||[],summary:any={inserted:0,updated:0,unchanged:0,deduplicated:0,total:rows.length};
  for(const r of rows)summary[r.action]=(summary[r.action]||0)+1;
  return {summary,changes:rows.filter(x=>x.action==="updated").slice(0,200).map(x=>({table:x.table_name,key:x.canonical_key,changed_fields:x.changed_fields,old_value:x.old_row?.value??x.old_row?.worked_hours??null,new_value:x.new_row?.value??x.new_row?.worked_hours??null}))};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const auth=req.headers.get("authorization")||"";if(!auth)return J({error:"Unauthorized"},401);
    const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user}}=await userClient.auth.getUser();if(!user)return J({error:"Unauthorized"},401);
    const db=createClient(url,service),{data:admin}=await db.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
    if(!admin)return J({error:"Forbidden"},403);
    const body=await req.json().catch(()=>({})),action=body.action||"coverage";
    if(action==="coverage")return J({ok:true,coverage:await coverage(db,body.month||"")});
    if(action==="identity_candidates")return J({ok:true,people:await identityCandidates(db)});
    if(action==="resolve_identity")return J({ok:true,resolution:await resolveIdentity(db,body)});
    if(action==="ignore_identity")return J({ok:true,resolution:await ignoreIdentity(db,body)});
    if(action==="preflight")return J({ok:true,preflight:await preflight(db,body.report_type,body.preview||{})});
    if(action==="import_result"){
      if(!body.import_id)return J({error:"Missing import_id"},400);
      return J({ok:true,result:await importResult(db,body.import_id)});
    }
    return J({error:"Unsupported action"},400);
  }catch(e){return J({error:String((e as any)?.message||e)},500)}
});
