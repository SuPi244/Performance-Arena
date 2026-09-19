import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"content-type":"application/json"}});
const norm=(v:any)=>String(v??"").trim().toLowerCase();
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
  for(let i=0;i<keys.length;i+=150){
    const chunk=keys.slice(i,i+150);if(!chunk.length)continue;
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
  const unresolved=(p.unresolved||[]).filter(Boolean);
  if(["ga_metrics","daily_picking","inbound","team_rating"].includes(reportType)){
    for(const identity of unresolved)conflicts.push({key:`identity:${identity}`,label:String(identity),reason:"Nerozpoznaná identita blokuje potvrzení"});
  }else if(reportType==="stock_count"&&unresolved.length){
    warnings.push({reason:"Nerozpoznané Stock Count identity zůstanou v reconciliation queue",items:unresolved});
  }
  if(reportType==="store_card_monthly"){
    for(const x of p.identity_conflicts||[])conflicts.push({key:`identity:${x.email||x.picker_login}`,label:x.display_name||x.email||x.picker_login,reason:"Konflikt identity blokuje potvrzení"});
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
    for(const identity of missing)conflicts.push({key:`identity:${identity}`,label:String(identity),reason:"Quinyx osoba není napojená na profil"});
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
  const [{data:imports,error:ie},{data:obs,error:oe},{data:shifts,error:se},{data:storeMetrics,error:sme},{data:storeCards,error:sce},{data:unresolved,error:ue},{data:teamRating,error:tre},{data:activePeople,error:ape}]=await Promise.all([
    db.from("imports").select("id,report_type,period_start,period_end,status,metadata").lte("period_start",end).gte("period_end",queryStart).eq("status","imported"),
    db.from("metric_observations").select("source_type,period_start,period_end").lte("period_start",end).gte("period_end",queryStart).limit(10000),
    db.from("shifts").select("shift_date,scheduled_start,actual_start,shift_type").gte("shift_date",start).lte("shift_date",end).limit(10000),
    db.from("store_metrics").select("venue_key,period_start,period_end,metric_id,metadata").lte("period_start",end).gte("period_end",start).limit(10000),
    db.from("store_card_months").select("month,status").eq("month",start),
    db.from("unresolved_identities").select("source_type,status,metadata").eq("status","unresolved").limit(1000),
    db.from("team_rating_responses").select("respondent_person_id,is_valid,disqualified_reason,submitted_at,metadata").eq("response_month",start),
    db.from("people").select("id,display_name,active,employment_type,team_effort_eligible").eq("active",true)
  ]);
  const err=ie||oe||se||sme||sce||ue||tre||ape;if(err)throw err;
  const imps=imports||[],observations=obs||[],shiftRows=shifts||[];
  const unresolvedCounts:any={};
  for(const x of unresolved||[]){const ps=day(x.metadata?.period_start),pe=day(x.metadata?.period_end||ps);if(ps<=end&&pe>=start)unresolvedCounts[x.source_type]=(unresolvedCounts[x.source_type]||0)+1}

  const allDays=[];for(let d=start;d<=end;d=addDays(d,1))allDays.push(d);
  const dueEnd=month<currentMonth?end:month===currentMonth?today:addDays(start,-1);
  const daily=(id:string,label:string)=>{
    const coveredSet=new Set<string>();
    for(const d of allDays){
      if(observations.some(x=>x.source_type===id&&day(x.period_start)===d))coveredSet.add(d);
    }
    const due=allDays.filter(d=>d<=dueEnd),covered=due.filter(d=>coveredSet.has(d)).length;
    const segments=allDays.map(d=>({key:d,label:d.slice(8),state:d>dueEnd?"future":coveredSet.has(d)?"complete":d===today?"partial":"missing"}));
    const missing=segments.filter(x=>x.state==="missing").map(x=>x.key);
    return {id,label,cadence:"day",covered,expected:due.length,percentage:pct(covered,due.length),state:coverageState(covered,due.length,segments.some(x=>x.state==="partial")),missing,segments,unresolved:unresolvedCounts[id]||0};
  };

  const weekStarts:string[]=[];for(let w=monday(start);w<=end;w=addDays(w,7))weekStarts.push(w);
  const weekly=(id:string,label:string)=>{
    const segments=weekStarts.map(w=>{const we=addDays(w,6),future=w>today,covered=spanCovers(imps,w,we,id)||observations.some(x=>x.source_type===id&&day(x.period_start)<=we&&day(x.period_end)>=w);return {key:w,label:`W${String(isoWeek(w)).padStart(2,"0")}`,range:`${w} → ${we}`,state:future?"future":covered?"complete":today<=we?"partial":"missing"}});
    const due=segments.filter(x=>x.state!=="future"),covered=due.filter(x=>x.state==="complete").length,missing=segments.filter(x=>x.state==="missing").map(x=>x.range);
    return {id,label,cadence:"week",covered,expected:due.length,percentage:pct(covered,due.length),state:coverageState(covered,due.length,segments.some(x=>x.state==="partial")),missing,segments,unresolved:unresolvedCounts[id]||0};
  };

  const storeCoreIds=["store_outbound_seconds_per_unit","store_outercase_scan_ratio","store_pofr","store_weighted_availability","store_uph","store_missing_items_ratio","store_undelivered_items_ratio","store_task_completion_ratio","store_total_score"];
  const storeCorePresent=new Set((storeMetrics||[]).filter((x:any)=>x.venue_key==="wolt_market_holesovice"&&day(x.period_start)===start&&day(x.period_end)===end).map((x:any)=>x.metric_id));
  const storeMetricCovered=imps.some(x=>x.report_type==="store_metrics"&&day(x.period_start)<=start&&day(x.period_end)>=end)||storeCoreIds.every((id:string)=>storeCorePresent.has(id));
  const storeCardCovered=(storeCards||[]).length>0||imps.some(x=>(x.report_type==="store_card_monthly"||x.metadata?.store_card_monthly)&&day(x.period_start)<=start&&day(x.period_end)>=end);
  const quinyxCovered=spanCovers(imps,start,end,"quinyx");
  const dueShifts=shiftRows.filter(x=>day(x.shift_date)<=today),actualShifts=dueShifts.filter(x=>x.actual_start),missingActual=dueShifts.filter(x=>!x.actual_start).map(x=>day(x.shift_date));
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
  const teamRatingSource={
    id:"team_rating",label:"Team Rating Form",cadence:"response",
    covered:teamRatingValid.length,expected:teamRatingExpected,
    percentage:teamRatingExpected?pct(teamRatingValid.length,teamRatingExpected):0,
    state:month>currentMonth?"future":teamRatingExpected>0&&teamRatingValid.length>=teamRatingExpected?"complete":
      (teamRatingLatest.size>0||month===currentMonth)?"partial":"missing",
    missing:teamRatingSegments.filter((x:any)=>x.state==="missing").map((x:any)=>x.label),
    segments:teamRatingSegments,unresolved:0,disqualified:teamRatingInvalid.length,
    received:teamRatingLatest.size
  };
  const sources:any[]=[
    weekly("ga_metrics","GA Metrics"),
    daily("daily_picking","Daily Picking"),
    daily("inbound","Inbound"),
    {id:"quinyx",label:"Quinyx",cadence:"shift",covered:actualShifts.length,expected:dueShifts.length,percentage:dueShifts.length?pct(actualShifts.length,dueShifts.length):(quinyxCovered?100:0),state:month>currentMonth&&!quinyxCovered?"future":!quinyxCovered?"missing":missingActual.length?"partial":"complete",missing:[...new Set(missingActual)],segments:[],planned_shifts:shiftRows.length,due_shifts:dueShifts.length,actual_shifts:actualShifts.length,scheduled_period_complete:quinyxCovered,unresolved:unresolvedCounts.quinyx||0},
    weekly("stock_count","Stock Count"),
    teamRatingSource,
    {id:"store_metrics",label:"Store Metrics",cadence:"month",covered:storeMetricCovered?1:0,expected:monthlyExpected,percentage:storeMetricCovered?100:0,state:storeMetricCovered?"complete":month>currentMonth?"future":month===currentMonth?"partial":"missing",missing:storeMetricCovered||month>currentMonth?[]:[month],segments:[{key:month,label:month,state:storeMetricCovered?"complete":month>currentMonth?"future":month===currentMonth?"partial":"missing"}],unresolved:0},
    {id:"store_card_monthly",label:"Monthly Store Card",cadence:"month",covered:storeCardCovered?1:0,expected:monthlyExpected,percentage:storeCardCovered?100:0,state:storeCardCovered?"complete":month>currentMonth?"future":month===currentMonth?"partial":"missing",missing:storeCardCovered||month>currentMonth?[]:[month],segments:[{key:month,label:month,state:storeCardCovered?"complete":month>currentMonth?"future":month===currentMonth?"partial":"missing"}],unresolved:0}
  ];
  const relevant=sources.filter(x=>x.expected>0),overall=relevant.length?Math.round(relevant.reduce((a,x)=>a+x.percentage,0)/relevant.length):0;
  return {month,period_start:start,period_end:end,through:today,overall_percent:clamp(overall),sources};
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
    if(action==="preflight")return J({ok:true,preflight:await preflight(db,body.report_type,body.preview||{})});
    if(action==="import_result"){
      if(!body.import_id)return J({error:"Missing import_id"},400);
      return J({ok:true,result:await importResult(db,body.import_id)});
    }
    return J({error:"Unsupported action"},400);
  }catch(e){return J({error:String((e as any)?.message||e)},500)}
});
