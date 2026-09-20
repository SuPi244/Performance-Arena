import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"content-type":"application/json"}});

const norm=(s:any)=>String(s||"").trim().toLowerCase();
const finite=(v:any)=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
const vals=(a:any[])=>a.map(finite).filter((x:any)=>x!==null) as number[];
const sum=(a:any[])=>vals(a).reduce((x:number,y:number)=>x+y,0);
const avg=(a:any[])=>{const v=vals(a);return v.length?v.reduce((x:number,y:number)=>x+y,0)/v.length:null};
const round=(v:any,d=2)=>{const n=finite(v);if(n===null)return null;const p=10**d;return Math.round(n*p)/p};

function monthFrame(){
  const now=new Date();
  const y=now.getUTCFullYear(),m=now.getUTCMonth()+1;
  const start=`${y}-${String(m).padStart(2,"0")}-01`;
  const today=now.toISOString().slice(0,10);
  const end=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
  return {year:y,month:m,start,today,end,key:start.slice(0,7)};
}
function dateAdd(iso:string,days:number){
  const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}

function weekStart(iso:string){
  const d=new Date(String(iso).slice(0,10)+"T00:00:00Z");
  if(!Number.isFinite(d.getTime()))return null;
  const delta=(d.getUTCDay()+6)%7;
  d.setUTCDate(d.getUTCDate()-delta);
  return d.toISOString().slice(0,10);
}
function metricSeries(rows:any[],defs:Map<string,any>){
  const ids=[...new Set(rows.map((r:any)=>r.metric_id).filter(Boolean))];
  const out:any[]=[];
  for(const id of ids){
    const d:any=defs.get(id)||{metric_id:id,label:id,unit:"number",category:"other",lower_is_better:null};
    const buckets=new Map<string,number[]>();
    for(const r of rows.filter((x:any)=>x.metric_id===id)){
      const wk=weekStart(r.period_start); const v=finite(r.value);
      if(!wk||v===null)continue;
      if(!buckets.has(wk))buckets.set(wk,[]);
      buckets.get(wk)!.push(v);
    }
    const labels=[...buckets.keys()].sort();
    const aggregation=d.unit==="count"?"sum":"average";
    const values=labels.map(k=>{
      const a=buckets.get(k)||[];
      return round(aggregation==="sum"?sum(a):avg(a),d.unit==="count"?0:2);
    });
    if(values.some(v=>v!==null))out.push({
      metric_id:id,label:d.label||id,unit:d.unit||"number",
      category:d.category||classifyMetric(d.label||id,id,""),
      group:classifyMetric(d.label||id,id,d.category||""),
      lower_is_better:d.lower_is_better,
      aggregation,labels,values
    });
  }
  return out.sort((a,b)=>a.group.localeCompare(b.group)||a.label.localeCompare(b.label));
}
function dailyMetricSeries(rows:any[],defs:Map<string,any>){
  const dailyRows=(rows||[]).filter((r:any)=>{
    const ps=String(r.period_start||""),pe=String(r.period_end||r.period_start||"");
    return ps&&ps===pe;
  });
  const ids=[...new Set(dailyRows.map((r:any)=>r.metric_id).filter(Boolean))];
  const out:any[]=[];
  for(const id of ids){
    const d:any=defs.get(id)||{metric_id:id,label:id,unit:"number",category:"other",lower_is_better:null};
    const buckets=new Map<string,number[]>();
    for(const r of dailyRows.filter((x:any)=>x.metric_id===id)){
      const key=String(r.period_start||"");const v=finite(r.value);
      if(!key||v===null)continue;
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key)!.push(v);
    }
    const labels=[...buckets.keys()].sort();
    const aggregation=d.unit==="count"?"sum":"average";
    const values=labels.map(k=>{
      const a=buckets.get(k)||[];
      return round(aggregation==="sum"?sum(a):avg(a),d.unit==="count"?0:2);
    });
    if(values.some(v=>v!==null))out.push({
      metric_id:id,label:d.label||id,unit:d.unit||"number",
      category:d.category||classifyMetric(d.label||id,id,""),
      group:classifyMetric(d.label||id,id,d.category||""),
      lower_is_better:d.lower_is_better,
      aggregation,granularity:"day",labels,values
    });
  }
  return out.sort((a,b)=>a.group.localeCompare(b.group)||a.label.localeCompare(b.label));
}
function percentileScore(value:number|null,all:number[],lower=false){
  if(value===null||!all.length)return null;
  const a=all.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return null;
  if(a.length===1)return .5;
  const less=a.filter(x=>x<value).length;
  const equal=a.filter(x=>x===value).length;
  let p=(less+(equal-1)/2)/(a.length-1);
  if(lower)p=1-p;
  return Math.max(0,Math.min(1,p));
}
function rowsByMetric(rows:any[]){
  const m=new Map<string,any[]>();
  for(const r of rows){
    if(!m.has(r.metric_id))m.set(r.metric_id,[]);
    m.get(r.metric_id)!.push(r);
  }
  return m;
}
function metricVals(by:Map<string,any[]>,id:string){return (by.get(id)||[]).map((r:any)=>finite(r.value)).filter((x:any)=>x!==null) as number[]}
function metricSum(by:Map<string,any[]>,id:string){const v=metricVals(by,id);return v.length?v.reduce((a:number,b:number)=>a+b,0):null}
function metricAvg(by:Map<string,any[]>,id:string){const v=metricVals(by,id);return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:null}

function preferredGroupedValues(rows:any[],ids:string[],keyFn:(r:any)=>string){
  const groups=new Map<string,Map<string,number>>();
  for(const r of rows){
    if(!ids.includes(r.metric_id))continue;
    const v=finite(r.value);if(v===null)continue;
    const k=keyFn(r);if(!k)continue;
    if(!groups.has(k))groups.set(k,new Map());
    const g=groups.get(k)!;
    g.set(r.metric_id,(g.get(r.metric_id)||0)+v);
  }
  const out=new Map<string,number>();
  for(const [k,g] of groups){
    for(const id of ids){
      if(g.has(id)){out.set(k,Number(g.get(id)));break}
    }
  }
  return out;
}
function summedGroupedValues(rows:any[],ids:string[],keyFn:(r:any)=>string){
  const out=new Map<string,number>();
  for(const r of rows){
    if(!ids.includes(r.metric_id))continue;
    const v=finite(r.value);if(v===null)continue;
    const k=keyFn(r);if(!k)continue;
    out.set(k,(out.get(k)||0)+v);
  }
  return out;
}
function mapSum(m:Map<string,number>){return [...m.values()].reduce((a,b)=>a+b,0)}
function preferredWeeklyTotal(rows:any[],dailyIds:string[],weeklyIds:string[]){
  const weekKeys=[...new Set(rows.map((r:any)=>weekStart(r.period_start)).filter(Boolean))] as string[];
  let total=0,any=false;
  for(const w of weekKeys){
    const wr=rows.filter((r:any)=>weekStart(r.period_start)===w);
    const daily=preferredGroupedValues(wr,dailyIds,(r:any)=>String(r.period_start||""));
    if(daily.size){total+=mapSum(daily);any=true;continue}
    for(const id of weeklyIds){
      const a=wr.filter((r:any)=>r.metric_id===id).map((r:any)=>finite(r.value)).filter((v:any)=>v!==null) as number[];
      if(a.length){total+=a.reduce((x,y)=>x+y,0);any=true;break}
    }
  }
  return any?total:null;
}

function workedHoursForDates(shifts:any[],dates:Set<string>){
  if(!dates.size)return 0;
  return sum((shifts||[])
    .filter((s:any)=>dates.has(String(s.shift_date||""))&&finite(s.worked_hours)!==null)
    .map((s:any)=>s.worked_hours));
}
function preferredWeeklyObserved(rows:any[],shifts:any[],dailyIds:string[],weeklyIds:string[]){
  const relevant=new Set([...dailyIds,...weeklyIds]);
  const weekKeys=[...new Set((rows||[])
    .filter((r:any)=>relevant.has(r.metric_id))
    .map((r:any)=>weekStart(r.period_start)).filter(Boolean))] as string[];
  const out=new Map<string,{value:number,hours:number,dates:Set<string>,source:"daily"|"weekly",period_start:string,period_end:string}>();
  for(const w of weekKeys){
    const wr=(rows||[]).filter((r:any)=>weekStart(r.period_start)===w);
    const daily=preferredGroupedValues(wr,dailyIds,(r:any)=>String(r.period_start||""));
    if(daily.size){
      const dates=new Set<string>([...daily.keys()]);
      out.set(w,{value:mapSum(daily),hours:workedHoursForDates(shifts,dates),dates,source:"daily",period_start:[...dates].sort()[0],period_end:[...dates].sort().at(-1)!});
      continue;
    }
    for(const id of weeklyIds){
      const rs=wr.filter((r:any)=>r.metric_id===id&&finite(r.value)!==null);
      if(!rs.length)continue;
      const period_start=rs.map((r:any)=>String(r.period_start||w)).sort()[0]||w;
      const period_end=rs.map((r:any)=>String(r.period_end||dateAdd(w,6))).sort().at(-1)||dateAdd(w,6);
      const dates=new Set<string>((shifts||[])
        .filter((s:any)=>String(s.shift_date||"")>=period_start&&String(s.shift_date||"")<=period_end&&finite(s.worked_hours)!==null)
        .map((s:any)=>String(s.shift_date)));
      out.set(w,{value:sum(rs.map((r:any)=>r.value)),hours:workedHoursForDates(shifts,dates),dates,source:"weekly",period_start,period_end});
      break;
    }
  }
  return out;
}
function weightedByPeriod(rows:any[],valueId:string,weightId:string){
  const groups=new Map<string,{v:number[],w:number[]}>();
  for(const r of rows){
    const k=String(r.period_start||"");
    if(!groups.has(k))groups.set(k,{v:[],w:[]});
    const g=groups.get(k)!;
    if(r.metric_id===valueId&&finite(r.value)!==null)g.v.push(Number(r.value));
    if(r.metric_id===weightId&&finite(r.value)!==null)g.w.push(Number(r.value));
  }
  let num=0,den=0;
  for(const g of groups.values()){
    if(!g.v.length)continue;
    const v=avg(g.v); if(v===null)continue;
    const w=g.w.length?sum(g.w):1;
    if(w>0){num+=v*w;den+=w}
  }
  return den?num/den:null;
}
function weightedAcrossPeople(rows:any[],valueId:string,weightId:string){
  const groups=new Map<string,{v:number[],w:number[]}>();
  for(const r of rows){
    const k=`${r.person_id||"x"}|${r.period_start||""}`;
    if(!groups.has(k))groups.set(k,{v:[],w:[]});
    const g=groups.get(k)!;
    if(r.metric_id===valueId&&finite(r.value)!==null)g.v.push(Number(r.value));
    if(r.metric_id===weightId&&finite(r.value)!==null)g.w.push(Number(r.value));
  }
  let num=0,den=0;
  for(const g of groups.values()){
    if(!g.v.length)continue;
    const v=avg(g.v); if(v===null)continue;
    const w=g.w.length?sum(g.w):1;
    if(w>0){num+=v*w;den+=w}
  }
  return den?num/den:null;
}
function cvPct(a:number[]){
  const v=a.filter(x=>Number.isFinite(x));
  if(v.length<2)return null;
  const mean=v.reduce((x,y)=>x+y,0)/v.length;
  if(!mean)return null;
  const variance=v.reduce((s,x)=>s+(x-mean)**2,0)/v.length;
  return Math.sqrt(variance)/Math.abs(mean)*100;
}
function tardinessMinutes(scheduled:any,actual:any){
  if(!scheduled||!actual)return null;
  const s=new Date(scheduled).getTime(),a=new Date(actual).getTime();
  if(!Number.isFinite(s)||!Number.isFinite(a))return null;
  return Math.max(0,(a-s)/60000);
}
function classifyMetric(label:string,id:string,category:string){
  const x=(label+" "+id+" "+category).toLowerCase();
  if(/missing|undelivered|rating|quality|pofr|perfect order|refund|ticket|late preparation|not collected|scanner|scan to pick|substitution/.test(x))return "quality";
  if(/time|accepted|collection|ready|start collection|production|pick.*per item|speed/.test(x))return "speed";
  if(/inbound|units|orders|count|stock|task/.test(x))return "output";
  return "other";
}
async function resolvePerson(db:any,worker:string){
  const w=norm(worker);
  const {data:a}=await db.from("person_aliases").select("person_id,alias_type,alias_value,normalized_value")
    .eq("normalized_value",w).limit(2);
  if(a?.length===1){
    const {data:p}=await db.from("people").select("id,person_key,display_name,full_name,active,employment_type,team_effort_eligible").eq("id",a[0].person_id).single();
    return p||null;
  }
  const {data:p1}=await db.from("people").select("id,person_key,display_name,full_name,active,employment_type,team_effort_eligible").ilike("display_name",worker).limit(2);
  if(p1?.length===1)return p1[0];
  const {data:p2}=await db.from("people").select("id,person_key,display_name,full_name,active,employment_type,team_effort_eligible").ilike("full_name",worker).limit(2);
  return p2?.length===1?p2[0]:null;
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return J({error:"POST required"},405);

  try{
    const body=await req.json().catch(()=>({}));
    const worker=String(body.worker||"").trim();
    if(!worker)return J({error:"worker is required"},400);

    const url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db=createClient(url,service);
    const frame=monthFrame();

    const person=await resolvePerson(db,worker);
    if(!person)return J({error:"Player not found"},404);

    const historyStart=dateAdd(frame.today,-97);
    const [
      {data:bonusRows,error:bonusErr},
      {data:months,error:monthsErr},
      {data:personalRows,error:personalErr},
      {data:officialRows,error:officialErr},
      {data:personalShifts,error:personalShiftErr},
      {data:historyRows,error:historyErr},
      {data:historyShifts,error:historyShiftErr}
    ]=await Promise.all([
      db.from("bonus_ledger").select("bonus_month,amount,currency,status,metadata").eq("person_id",person.id)
        .in("status",["confirmed","paid","pending_unparsed"]).order("bonus_month",{ascending:false}),
      db.from("store_card_months").select("*").order("month",{ascending:false}).limit(24),
      db.from("metric_observations").select("person_id,metric_id,value,period_start,period_end,source_type,metadata")
        .eq("person_id",person.id).gte("period_start",frame.start).lte("period_start",frame.today),
      db.from("metric_observations").select("metric_id,value,period_start,period_end,source_type,metadata")
        .eq("person_id",person.id).eq("source_type","store_card_monthly").order("period_start",{ascending:false}).limit(500),
      db.from("shifts").select("shift_date,shift_type,role,scheduled_start,scheduled_end,actual_start,actual_end,scheduled_hours,worked_hours")
        .eq("person_id",person.id).gte("shift_date",frame.start).lte("shift_date",frame.today).order("shift_date"),
      db.from("metric_observations").select("person_id,metric_id,value,period_start,period_end,source_type,metadata")
        .eq("person_id",person.id).gte("period_start",historyStart).lte("period_start",frame.today).limit(5000),
      db.from("shifts").select("shift_date,shift_type,role,scheduled_start,scheduled_end,actual_start,actual_end,scheduled_hours,worked_hours")
        .eq("person_id",person.id).gte("shift_date",historyStart).lte("shift_date",frame.today).order("shift_date")
    ]);
    if(bonusErr)throw new Error(bonusErr.message);
    if(monthsErr)throw new Error(monthsErr.message);
    if(personalErr)throw new Error(personalErr.message);
    if(officialErr)throw new Error(officialErr.message);
    if(personalShiftErr)throw new Error(personalShiftErr.message);
    if(historyErr)throw new Error(historyErr.message);
    if(historyShiftErr)throw new Error(historyShiftErr.message);

    const by=rowsByMetric(personalRows||[]);
    const personalDataDates=(personalRows||[]).map((r:any)=>String(r.period_end||r.period_start||"").slice(0,10)).filter(Boolean).sort();
    const dailyPickingDates=(personalRows||[]).filter((r:any)=>r.source_type==="daily_picking")
      .map((r:any)=>String(r.period_end||r.period_start||"").slice(0,10)).filter(Boolean).sort();
    const personalDataThrough=personalDataDates.at(-1)||null;
    const dailyPickingThrough=dailyPickingDates.at(-1)||null;
    // OUTBOUND semantics:
    // - Picking App Task Count = outbound orders/tasks.
    // - Items Picked Count = actual picked outbound units (preferred).
    // - Item Count Total is only a fallback when Items Picked Count is unavailable.
    // Weekly GA totals are used only for weeks where daily picking data is absent.
    const outboundOrdersMTD=preferredWeeklyTotal(personalRows||[],["daily_picking_app_task_count"],["picking_app_task_count"]);
    const outboundUnitsMTD=preferredWeeklyTotal(personalRows||[],["daily_items_picked_count","daily_item_count_total"],["item_count_total"]);

    const live:any={
      month:frame.key,
      period_start:frame.start,
      through:frame.today,
      data_through:personalDataThrough,
      daily_picking_through:dailyPickingThrough,
      orders_picked:outboundOrdersMTD,
      total_units_picked:outboundUnitsMTD,
      outbound_orders:outboundOrdersMTD,
      outbound_units:outboundUnitsMTD,
      outbound_definition:"Orders = Picking App Task Count; Units = Items Picked Count (fallback Item Count Total).",

      missing_items_ratio:weightedByPeriod(personalRows||[],"missing_incorrect_items_rate","item_count_total"),
      missing_items_count:metricSum(by,"missing_incorrect_items_count"),
      undelivered_items_ratio:weightedByPeriod(personalRows||[],"daily_undelivered_items_ratio","daily_item_count_total"),
      scan_to_pick_ratio:weightedByPeriod(personalRows||[],"daily_items_picked_via_scanner_ratio","daily_item_count_total")
        ?? weightedByPeriod(personalRows||[],"items_picked_via_scanner_ratio","item_count_total"),
      substitutions_ratio:weightedByPeriod(personalRows||[],"daily_substitutions_ratio","daily_item_count_total"),
      replacement_items_picked_count:metricSum(by,"daily_replacement_items_picked_count"),
      items_picked_count:metricSum(by,"daily_items_picked_count"),

      bad_goods_rating_ratio:weightedByPeriod(personalRows||[],"bad_goods_rating_ratio","item_count_total"),
      avg_goods_rating:weightedByPeriod(personalRows||[],"average_rating_of_goods","item_count_total"),
      venue_related_cs_tickets_ratio:weightedByPeriod(personalRows||[],"venue_related_cs_tickets_ratio","item_count_total"),
      pofr:weightedByPeriod(personalRows||[],"perfect_order_fulfilment_ratio","picking_app_task_count"),
      not_collected_items_ratio:weightedByPeriod(personalRows||[],"not_collected_items_ratio","picking_app_task_count"),
      refund_percent:weightedByPeriod(personalRows||[],"refund_percent","picking_app_task_count"),
      venue_late_preparation_ratio:weightedByPeriod(personalRows||[],"venue_late_preparation_ratio","picking_app_task_count"),

      avg_picking_time:weightedByPeriod(personalRows||[],"avg_picking_time","picking_app_task_count"),
      picking_time_per_item:weightedByPeriod(personalRows||[],"picking_time_per_item","item_count_total"),
      avg_items_per_order:weightedByPeriod(personalRows||[],"avg_items_per_order","picking_app_task_count"),
      average_accepted_time:weightedByPeriod(personalRows||[],"daily_avg_accepted_time","daily_picking_app_task_count"),
      average_acknowledged_time:weightedByPeriod(personalRows||[],"daily_avg_acknowledged_time","daily_picking_app_task_count"),
      average_collection_time:weightedByPeriod(personalRows||[],"daily_avg_collection_time","daily_picking_app_task_count"),
      average_ready_for_pickup_time:weightedByPeriod(personalRows||[],"daily_avg_ready_for_pickup_time","daily_picking_app_task_count"),
      average_start_collection_time:weightedByPeriod(personalRows||[],"daily_avg_start_collection_time","daily_picking_app_task_count"),
      total_production_time:metricAvg(by,"daily_total_production_time"),

      inbound_total_units:metricSum(by,"inbound_normal_units"),
      inbound_icy_units:metricSum(by,"inbound_icy_units"),
      inbound_freeze_units:metricSum(by,"inbound_freez_units"),
      stock_count:metricSum(by,"stock_count_adjustment_count"),

      team_rating:null,
      total_points:null,
      projected_bonus_czk:null
    };
    live.inbound_all_units=sum([live.inbound_total_units,live.inbound_icy_units,live.inbound_freeze_units]);

    const liveFields=[
      "orders_picked","total_units_picked","missing_items_ratio","undelivered_items_ratio","scan_to_pick_ratio",
      "bad_goods_rating_ratio","avg_goods_rating","venue_related_cs_tickets_ratio","average_accepted_time",
      "average_collection_time","average_start_collection_time","inbound_total_units","inbound_icy_units",
      "inbound_freeze_units","stock_count","team_rating"
    ];
    live.coverage_total=liveFields.length;
    live.coverage_count=liveFields.filter(k=>finite(live[k])!==null).length;
    live.coverage_percent=Math.round(live.coverage_count/live.coverage_total*100);
    for(const k of Object.keys(live)){
      if(typeof live[k]==="number"){
        const isInt=/units|orders|count/.test(k)&&!/ratio|percent|time/.test(k);
        live[k]=round(live[k],isInt?0:2);
      }
    }

    const history=(bonusRows||[]).map((x:any)=>{
      const rawAmount=Number(x.amount||0);
      const eligible=x?.metadata?.bonus_eligible;
      const parsed=x.status!=="pending_unparsed";
      return {...x,raw_amount:rawAmount,amount:parsed?(eligible===false?0:rawAmount):null,payout_parsed:parsed};
    });
    const confirmed=history.filter((x:any)=>x.status==="confirmed"||x.status==="paid");
    const bonus_wallet={
      currency:"CZK",
      confirmed_total_czk:confirmed.reduce((a:number,x:any)=>a+Number(x.amount||0),0),
      latest:confirmed[0]||null,
      history,
      pending_unparsed_count:history.filter((x:any)=>x.status==="pending_unparsed").length
    };

    const latestMonth=months?.[0]||null;

    // Official Store Card snapshot for the latest closed month.
    const latestOfficialPeriod=(officialRows||[])[0]?.period_start||null;
    const officialMap:any={};
    for(const r of officialRows||[]){
      if(r.period_start!==latestOfficialPeriod)continue;
      officialMap[r.metric_id]=finite(r.value);
    }
    const latestOfficialPoints=latestOfficialPeriod&&officialMap.store_card_total_points!==undefined?{
      value:officialMap.store_card_total_points,
      period_start:latestOfficialPeriod,
      period_end:(officialRows||[]).find((r:any)=>r.period_start===latestOfficialPeriod)?.period_end||null
    }:null;

    const officialMetricLabels:any={
      store_card_orders_picked:["Orders picked","count"],
      store_card_total_units_picked:["Total Units Picked","count"],
      store_card_missing_items_ratio:["Missing items","percent"],
      store_card_undelivered_items_ratio:["Undelivered items","percent"],
      store_card_scan_to_pick_ratio:["Scan to pick","percent"],
      store_card_bad_goods_rating_ratio:["Bad Goods Rating Ratio","percent"],
      store_card_avg_goods_rating:["Avg. goods rating","number"],
      store_card_venue_related_cs_tickets_ratio:["Venue Related CS Tickets","percent"],
      store_card_average_accepted_time:["Average Accepted Time","number"],
      store_card_average_collection_time:["Average Collection Time","number"],
      store_card_average_start_collection_time:["Average Start Collection Time","number"],
      store_card_inbound_total_units:["IB total units","count"],
      store_card_inbound_icy_units:["ICY IB Units","count"],
      store_card_inbound_freeze_units:["FREEZE IB units","count"],
      store_card_stock_count:["Stock Count","count"],
      store_card_team_rating:["Team rating","number"],
      store_card_score_outbound:["Score OUTBOUND","points"],
      store_card_score_quality:["Score Quality KPIs","points"],
      store_card_score_speed:["Score Speed KPIs","points"],
      store_card_score_inbound_stock:["Score IB + SC","points"],
      store_card_score_people:["Score People","points"],
      store_card_total_points:["Total points per GA","points"]
    };
    const official_metrics=Object.entries(officialMetricLabels).map(([metric_id,def]:any)=>({
      metric_id,label:def[0],unit:def[1],value:officialMap[metric_id]??null
    })).filter((x:any)=>x.value!==null);

    // Dynamic raw metric catalog for all current-month observations.
    const metricIds=[...new Set((personalRows||[]).map((r:any)=>r.metric_id))];
    const historyMetricIds=[...new Set([...(historyRows||[]).map((r:any)=>r.metric_id),...metricIds])];
    const {data:defRows,error:defErr}=historyMetricIds.length
      ?await db.from("metric_definitions").select("metric_id,label,unit,category,lower_is_better").in("metric_id",historyMetricIds)
      :{data:[],error:null};
    if(defErr)throw new Error(defErr.message);
    const defs=new Map<string,any>((defRows||[]).map((d:any)=>[d.metric_id,d]));
    const raw_metrics=metricIds.map((id:string)=>{
      const rows=(by.get(id)||[]);
      const d:any=defs.get(id)||{metric_id:id,label:id,unit:"number",category:"other",lower_is_better:null};
      let value:null|number=null,aggregation="average";
      if(d.unit==="count"){value=metricSum(by,id);aggregation="sum"}
      else{value=metricAvg(by,id);aggregation="average"}
      return {
        metric_id:id,
        label:d.label||id,
        unit:d.unit||"number",
        category:d.category||classifyMetric(d.label||id,id,""),
        group:classifyMetric(d.label||id,id,d.category||""),
        lower_is_better:d.lower_is_better,
        value:round(value,d.unit==="count"?0:2),
        aggregation,
        source_types:[...new Set(rows.map((r:any)=>r.source_type).filter(Boolean))]
      };
    }).filter((x:any)=>x.value!==null).sort((a:any,b:any)=>a.group.localeCompare(b.group)||a.label.localeCompare(b.label));

    const metric_series=metricSeries(historyRows||[],defs).map((s:any)=>({...s,granularity:"week"}));
    const daily_metric_series=dailyMetricSeries(historyRows||[],defs);

    // Daily synthetic output series use the same friendly metric IDs as the weekly chart,
    // so the UI can switch granularity without changing the selected metric.
    const dailyHistoryDates=[...new Set((historyRows||[])
      .filter((r:any)=>String(r.period_start||"")===String(r.period_end||r.period_start||""))
      .map((r:any)=>String(r.period_start||"")).filter(Boolean))].sort() as string[];
    const dailyOutboundMap=preferredGroupedValues(historyRows||[],["daily_items_picked_count","daily_item_count_total"],(r:any)=>String(r.period_start||""));
    const dailyOrdersMap=preferredGroupedValues(historyRows||[],["daily_picking_app_task_count"],(r:any)=>String(r.period_start||""));
    const dailyInboundMap=summedGroupedValues(historyRows||[],["inbound_normal_units","inbound_icy_units","inbound_freez_units"],(r:any)=>String(r.period_start||""));
    const synthDailyDates=[...new Set([...dailyOutboundMap.keys(),...dailyOrdersMap.keys(),...dailyInboundMap.keys()])].sort();
    daily_metric_series.push(
      {metric_id:"outbound_units_picked",label:"Outbound Units Picked",unit:"count",category:"output",group:"output",lower_is_better:false,aggregation:"sum",granularity:"day",labels:synthDailyDates,values:synthDailyDates.map(d=>dailyOutboundMap.has(d)?round(dailyOutboundMap.get(d),0):null)},
      {metric_id:"outbound_orders",label:"Outbound Orders / Picking Tasks",unit:"count",category:"output",group:"output",lower_is_better:false,aggregation:"sum",granularity:"day",labels:synthDailyDates,values:synthDailyDates.map(d=>dailyOrdersMap.has(d)?round(dailyOrdersMap.get(d),0):null)},
      {metric_id:"inbound_total_units_live",label:"Inbound Total Units",unit:"count",category:"output",group:"output",lower_is_better:false,aggregation:"sum",granularity:"day",labels:synthDailyDates,values:synthDailyDates.map(d=>dailyInboundMap.has(d)?round(dailyInboundMap.get(d),0):null)}
    );

    // User-friendly synthetic series: avoid making employees choose between two
    // technical outbound counters. We prefer actual Items Picked Count.
    const synthWeeks=[...new Set((historyRows||[]).map((r:any)=>weekStart(r.period_start)).filter(Boolean))].sort() as string[];
    const synthOutboundValues=synthWeeks.map(w=>{
      const wr=(historyRows||[]).filter((r:any)=>weekStart(r.period_start)===w);
      const daily=preferredGroupedValues(wr,["daily_items_picked_count","daily_item_count_total"],(r:any)=>String(r.period_start||""));
      if(daily.size)return round(mapSum(daily),0);
      const b=rowsByMetric(wr);return round(metricSum(b,"item_count_total"),0);
    });
    const synthOrdersValues=synthWeeks.map(w=>{
      const wr=(historyRows||[]).filter((r:any)=>weekStart(r.period_start)===w);
      const daily=preferredGroupedValues(wr,["daily_picking_app_task_count"],(r:any)=>String(r.period_start||""));
      if(daily.size)return round(mapSum(daily),0);
      const b=rowsByMetric(wr);return round(metricSum(b,"picking_app_task_count"),0);
    });
    const synthInboundValues=synthWeeks.map(w=>{
      const wr=(historyRows||[]).filter((r:any)=>weekStart(r.period_start)===w);
      const m=summedGroupedValues(wr,["inbound_normal_units","inbound_icy_units","inbound_freez_units"],(r:any)=>String(r.period_start||""));
      return m.size?round(mapSum(m),0):null;
    });
    metric_series.push(
      {metric_id:"outbound_units_picked",label:"Outbound Units Picked",unit:"count",category:"output",group:"output",lower_is_better:false,aggregation:"sum",granularity:"week",labels:synthWeeks,values:synthOutboundValues},
      {metric_id:"outbound_orders",label:"Outbound Orders / Picking Tasks",unit:"count",category:"output",group:"output",lower_is_better:false,aggregation:"sum",granularity:"week",labels:synthWeeks,values:synthOrdersValues},
      {metric_id:"inbound_total_units_live",label:"Inbound Total Units",unit:"count",category:"output",group:"output",lower_is_better:false,aggregation:"sum",granularity:"week",labels:synthWeeks,values:synthInboundValues}
    );

    // Weekly efficiency history for the graph selector.
    // Prefer daily output when a week has daily rows; otherwise use the weekly GA total.
    // This keeps Orders / Units visible even before every Daily Picking export is loaded.
    const histOutboundWeeks=preferredWeeklyObserved(historyRows||[],historyShifts||[],
      ["daily_items_picked_count","daily_item_count_total"],["item_count_total"]);
    const histOrdersWeeks=preferredWeeklyObserved(historyRows||[],historyShifts||[],
      ["daily_picking_app_task_count"],["picking_app_task_count"]);
    const histInboundByDay=summedGroupedValues(historyRows||[],
      ["inbound_normal_units","inbound_icy_units","inbound_freez_units"],(r:any)=>String(r.period_start||""));

    const histWeekKeys=new Set<string>([
      ...histOutboundWeeks.keys(),
      ...histOrdersWeeks.keys(),
      ...[...histInboundByDay.keys()].map(d=>weekStart(d)).filter(Boolean) as string[]
    ]);
    const effWeeks=new Map<string,{outbound:number,inbound:number,orders:number,totalHours:number,outboundHours:number,inboundHours:number,ordersHours:number,missing:number[],undelivered:number[]}>();
    for(const w of histWeekKeys){
      const out=histOutboundWeeks.get(w),ord=histOrdersWeeks.get(w);
      const inboundDates=new Set<string>([...histInboundByDay.keys()].filter(d=>weekStart(d)===w));
      const inbound=mapSum(new Map([...histInboundByDay].filter(([d])=>weekStart(d)===w)));
      const inboundHours=workedHoursForDates(historyShifts||[],inboundDates);
      const totalDates=new Set<string>([...(out?.dates||[]),...inboundDates]);
      const wr=(historyRows||[]).filter((r:any)=>weekStart(r.period_start)===w);
      effWeeks.set(w,{
        outbound:out?.value||0,
        inbound,
        orders:ord?.value||0,
        totalHours:workedHoursForDates(historyShifts||[],totalDates),
        outboundHours:out?.hours||0,
        inboundHours,
        ordersHours:ord?.hours||0,
        missing:wr.filter((r:any)=>r.metric_id==="missing_incorrect_items_rate").map((r:any)=>finite(r.value)).filter((v:any)=>v!==null),
        undelivered:wr.filter((r:any)=>r.metric_id==="daily_undelivered_items_ratio").map((r:any)=>finite(r.value)).filter((v:any)=>v!==null)
      });
    }
    const effLabels=[...effWeeks.keys()].sort();
    const effVals=(kind:string)=>effLabels.map(w=>{
      const g=effWeeks.get(w)!;
      if(kind==="total")return g.totalHours>0?round((g.outbound+g.inbound)/g.totalHours,2):null;
      if(kind==="outbound")return g.outboundHours>0?round(g.outbound/g.outboundHours,2):null;
      if(kind==="inbound")return g.inboundHours>0?round(g.inbound/g.inboundHours,2):null;
      if(kind==="orders")return g.ordersHours>0?round(g.orders/g.ordersHours,2):null;
      if(g.totalHours<=0)return null;
      const q=Math.max(0,1-Number(avg(g.missing)||0)/100-Number(avg(g.undelivered)||0)/100);
      return round(((g.outbound+g.inbound)/g.totalHours)*q,2);
    });
    const efficiency_series=[
      {metric_id:"eff_total_units_per_hour",label:"Total Units / Worked Hour",unit:"number",group:"efficiency",lower_is_better:false,granularity:"week",labels:effLabels,values:effVals("total")},
      {metric_id:"eff_outbound_units_per_hour",label:"Outbound Units / Worked Hour",unit:"number",group:"efficiency",lower_is_better:false,granularity:"week",labels:effLabels,values:effVals("outbound")},
      {metric_id:"eff_inbound_units_per_hour",label:"Inbound Units / Worked Hour",unit:"number",group:"efficiency",lower_is_better:false,granularity:"week",labels:effLabels,values:effVals("inbound")},
      {metric_id:"eff_orders_per_hour",label:"Orders / Worked Hour",unit:"number",group:"efficiency",lower_is_better:false,granularity:"week",labels:effLabels,values:effVals("orders")},
      {metric_id:"eff_quality_adjusted_units_per_hour",label:"Quality-adjusted Units / Hour",unit:"number",group:"efficiency",lower_is_better:false,granularity:"week",labels:effLabels,values:effVals("quality")}
    ];

    // Daily efficiency history: exact day-level output + matching Quinyx worked hours.
    // No weekly totals are spread across days; if a day-level source is missing the point stays null.
    const histHoursByDay=new Map<string,number>();
    const histShiftTypeByDay=new Map<string,string>();
    for(const s of historyShifts||[]){
      const d=String(s.shift_date||"");if(!d)continue;
      const h=finite(s.worked_hours);
      if(h!==null)histHoursByDay.set(d,(histHoursByDay.get(d)||0)+h);
      if(s.shift_type&&!histShiftTypeByDay.has(d))histShiftTypeByDay.set(d,String(s.shift_type));
    }
    const histOutboundByDay=preferredGroupedValues(historyRows||[],["daily_items_picked_count","daily_item_count_total"],(r:any)=>String(r.period_start||""));
    const histOrdersByDay=preferredGroupedValues(historyRows||[],["daily_picking_app_task_count"],(r:any)=>String(r.period_start||""));
    const histInboundDaily=summedGroupedValues(historyRows||[],["inbound_normal_units","inbound_icy_units","inbound_freez_units"],(r:any)=>String(r.period_start||""));
    const histMissingByDay=preferredGroupedValues(historyRows||[],["daily_undelivered_items_ratio"],(r:any)=>String(r.period_start||""));
    const histQualityMissingByDay=preferredGroupedValues(historyRows||[],["missing_incorrect_items_rate"],(r:any)=>String(r.period_start||""));
    const dailyEffLabels=[...new Set([
      ...histOutboundByDay.keys(),...histOrdersByDay.keys(),...histInboundDaily.keys()
    ])].sort();
    const dailyEffValue=(kind:string)=>dailyEffLabels.map(d=>{
      const h=histHoursByDay.get(d)||0;
      const out=histOutboundByDay.get(d);
      const ib=histInboundDaily.get(d);
      const ord=histOrdersByDay.get(d);
      if(kind==="outbound")return h>0&&out!=null?round(out/h,2):null;
      if(kind==="inbound")return h>0&&ib!=null?round(ib/h,2):null;
      if(kind==="orders")return h>0&&ord!=null?round(ord/h,2):null;
      if(kind==="total"){
        if(h<=0||out==null&&ib==null)return null;
        return round((Number(out||0)+Number(ib||0))/h,2);
      }
      if(h<=0||out==null&&ib==null)return null;
      const missing=Number(histQualityMissingByDay.get(d)||0),undel=Number(histMissingByDay.get(d)||0);
      const q=Math.max(0,1-missing/100-undel/100);
      return round(((Number(out||0)+Number(ib||0))/h)*q,2);
    });
    const daily_efficiency_series=[
      {metric_id:"eff_total_units_per_hour",label:"Total Units / Worked Hour",unit:"number",group:"efficiency",lower_is_better:false,granularity:"day",labels:dailyEffLabels,values:dailyEffValue("total")},
      {metric_id:"eff_outbound_units_per_hour",label:"Outbound Units / Worked Hour",unit:"number",group:"efficiency",lower_is_better:false,granularity:"day",labels:dailyEffLabels,values:dailyEffValue("outbound")},
      {metric_id:"eff_inbound_units_per_hour",label:"Inbound Units / Worked Hour",unit:"number",group:"efficiency",lower_is_better:false,granularity:"day",labels:dailyEffLabels,values:dailyEffValue("inbound")},
      {metric_id:"eff_orders_per_hour",label:"Orders / Worked Hour",unit:"number",group:"efficiency",lower_is_better:false,granularity:"day",labels:dailyEffLabels,values:dailyEffValue("orders")},
      {metric_id:"eff_quality_adjusted_units_per_hour",label:"Quality-adjusted Units / Hour",unit:"number",group:"efficiency",lower_is_better:false,granularity:"day",labels:dailyEffLabels,values:dailyEffValue("quality")}
    ];

    // Personal efficiency / output / reliability from current-month canonical data + Quinyx.
    const allShifts=(personalShifts||[]).filter((s:any)=>finite(s.worked_hours)!==null||finite(s.scheduled_hours)!==null);
    // Reliability/attendance uses completed observed shifts only. Scheduled-only rows
    // (for example today's not-yet-worked shift) must not lower attendance by themselves.
    const shifts=allShifts.filter((s:any)=>finite(s.worked_hours)!==null);
    const scheduled_hours=sum(shifts.map((s:any)=>s.scheduled_hours));
    const worked_hours=sum(shifts.map((s:any)=>s.worked_hours));
    const shift_count=shifts.length;
    const scheduled_only_shift_count=Math.max(0,allShifts.length-shifts.length);

    // Explicit attendance exception: 2026-09-10 for Martin was an extra shift whose
    // recorded planned start is not a valid lateness baseline. Keep the shift/hours in
    // efficiency, but exclude it ONLY from tardiness / on-time calculations.
    const tardinessExceptionReasons=new Map<string,string>([
      ["martin-po|2026-09-10","extra shift — planned start is not a valid attendance baseline"]
    ]);
    const tardinessExcluded=shifts.filter((s:any)=>
      !!s.scheduled_start&&!!s.actual_start&&tardinessExceptionReasons.has(`${person.person_key}|${String(s.shift_date)}`)
    );
    const tardinessShifts=shifts.filter((s:any)=>
      !!s.scheduled_start&&!!s.actual_start&&!tardinessExceptionReasons.has(`${person.person_key}|${String(s.shift_date)}`)
    );
    const tardinessDetails=tardinessShifts.map((s:any)=>{
      const minutes=tardinessMinutes(s.scheduled_start,s.actual_start);
      return {
        shift_date:String(s.shift_date),
        shift_type:String(s.shift_type||"Unknown"),
        scheduled_start:s.scheduled_start,
        actual_start:s.actual_start,
        tardiness_min:minutes===null?null:round(minutes,1),
        on_time:minutes!==null?minutes<=5:null
      };
    }).filter((x:any)=>x.tardiness_min!==null);
    const tardiness=tardinessDetails.map((x:any)=>Number(x.tardiness_min)) as number[];
    const on_time_count=tardinessDetails.filter((x:any)=>x.on_time===true).length;
    const late_shifts=tardinessDetails.filter((x:any)=>x.on_time===false)
      .sort((a:any,b:any)=>String(a.shift_date).localeCompare(String(b.shift_date)));

    const daily=new Map<string,{outbound:number,inbound:number,orders:number,hours:number,shift_type:string,hasOutbound:boolean,hasInbound:boolean,hasOrders:boolean}>();
    for(const s of shifts){
      const d=String(s.shift_date);
      if(!daily.has(d))daily.set(d,{outbound:0,inbound:0,orders:0,hours:0,shift_type:String(s.shift_type||"Unknown"),hasOutbound:false,hasInbound:false,hasOrders:false});
      const g=daily.get(d)!;
      g.hours+=Number(s.worked_hours||0);
      if(!g.shift_type&&s.shift_type)g.shift_type=s.shift_type;
    }
    const outboundByDay=preferredGroupedValues(personalRows||[],["daily_items_picked_count","daily_item_count_total"],(r:any)=>String(r.period_start||""));
    const ordersByDay=preferredGroupedValues(personalRows||[],["daily_picking_app_task_count"],(r:any)=>String(r.period_start||""));
    const inboundByDay=summedGroupedValues(personalRows||[],["inbound_normal_units","inbound_icy_units","inbound_freez_units"],(r:any)=>String(r.period_start||""));
    const observedDates=new Set<string>([...outboundByDay.keys(),...ordersByDay.keys(),...inboundByDay.keys()]);
    for(const d of observedDates){
      if(!daily.has(d))daily.set(d,{outbound:0,inbound:0,orders:0,hours:0,shift_type:"Unknown",hasOutbound:false,hasInbound:false,hasOrders:false});
      const g=daily.get(d)!;
      if(outboundByDay.has(d)){g.outbound=outboundByDay.get(d)!;g.hasOutbound=true}
      if(ordersByDay.has(d)){g.orders=ordersByDay.get(d)!;g.hasOrders=true}
      if(inboundByDay.has(d)){g.inbound=inboundByDay.get(d)!;g.hasInbound=true}
    }

    const dayRows=[...daily.entries()].map(([date,g])=>({
      date,...g,total:g.outbound+g.inbound,
      total_uph:g.hours>0&&(g.hasOutbound||g.hasInbound)?(g.outbound+g.inbound)/g.hours:null,
      outbound_uph:g.hours>0&&g.hasOutbound?g.outbound/g.hours:null,
      inbound_uph:g.hours>0&&g.hasInbound?g.inbound/g.hours:null,
      orders_per_hour:g.hours>0&&g.hasOrders?g.orders/g.hours:null
    })).sort((a,b)=>a.date.localeCompare(b.date));

    const outboundObservedWeeks=preferredWeeklyObserved(personalRows||[],shifts,
      ["daily_items_picked_count","daily_item_count_total"],["item_count_total"]);
    const orderObservedWeeks=preferredWeeklyObserved(personalRows||[],shifts,
      ["daily_picking_app_task_count"],["picking_app_task_count"]);
    const outboundObservedDates=new Set<string>([...outboundObservedWeeks.values()].flatMap((x:any)=>[...x.dates]));
    const orderObservedDates=new Set<string>([...orderObservedWeeks.values()].flatMap((x:any)=>[...x.dates]));
    const inboundObservedDates=new Set<string>([...inboundByDay.keys()]);
    const totalObservedDates=new Set<string>([...outboundObservedDates,...inboundObservedDates]);

    const outbound_units=[...outboundObservedWeeks.values()].reduce((a:any,x:any)=>a+Number(x.value||0),0);
    const inbound_units=mapSum(inboundByDay);
    const total_units=outbound_units+inbound_units;
    const orders=[...orderObservedWeeks.values()].reduce((a:any,x:any)=>a+Number(x.value||0),0);
    const observed_worked_hours=workedHoursForDates(shifts,totalObservedDates);
    const outbound_observed_hours=workedHoursForDates(shifts,outboundObservedDates);
    const inbound_observed_hours=workedHoursForDates(shifts,inboundObservedDates);
    const orders_observed_hours=workedHoursForDates(shifts,orderObservedDates);

    const qualityFactor=Math.max(0,1-Number(live.missing_items_ratio||0)/100-Number(live.undelivered_items_ratio||0)/100);
    const total_units_per_worked_hour=observed_worked_hours>0?total_units/observed_worked_hours:null;

    const byShift=new Map<string,{hours:number,observedHours:number,outboundHours:number,inboundHours:number,ordersHours:number,outbound:number,inbound:number,orders:number,days:number}>();
    for(const x of dayRows){
      const k=x.shift_type||"Unknown";
      if(!byShift.has(k))byShift.set(k,{hours:0,observedHours:0,outboundHours:0,inboundHours:0,ordersHours:0,outbound:0,inbound:0,orders:0,days:0});
      const g=byShift.get(k)!;
      g.hours+=x.hours;
      if(x.hasOutbound||x.hasInbound)g.observedHours+=x.hours;
      if(x.hasOutbound)g.outboundHours+=x.hours;
      if(x.hasInbound)g.inboundHours+=x.hours;
      if(x.hasOrders)g.ordersHours+=x.hours;
      if(x.hasOutbound)g.outbound+=x.outbound;
      if(x.hasInbound)g.inbound+=x.inbound;
      if(x.hasOrders)g.orders+=x.orders;
      g.days++;
    }
    const by_shift_type=[...byShift.entries()].map(([shift_type,g])=>({
      shift_type,
      days:g.days,
      worked_hours:round(g.hours,2),
      observed_worked_hours:round(g.observedHours,2),
      outbound_units:round(g.outbound,0),
      inbound_units:round(g.inbound,0),
      total_units_per_hour:g.observedHours>0?round((g.outbound+g.inbound)/g.observedHours,2):null,
      outbound_units_per_hour:g.outboundHours>0?round(g.outbound/g.outboundHours,2):null,
      inbound_units_per_hour:g.inboundHours>0?round(g.inbound/g.inboundHours,2):null,
      orders_per_hour:g.ordersHours>0?round(g.orders/g.ordersHours,2):null
    })).sort((a,b)=>(b.total_units_per_hour||0)-(a.total_units_per_hour||0));

    const recentStart=dateAdd(frame.today,-6),prevEnd=dateAdd(recentStart,-1),prevStart=dateAdd(prevEnd,-6);
    const rangeEff=(start:string,end:string)=>{
      const xs=dayRows.filter(x=>x.date>=start&&x.date<=end&&(x.hasOutbound||x.hasInbound));
      const h=xs.reduce((a,x)=>a+x.hours,0),u=xs.reduce((a,x)=>a+x.total,0);
      return h>0?u/h:null;
    };
    const recentEff=rangeEff(recentStart,frame.today),prevEff=rangeEff(prevStart,prevEnd);
    const trendDelta=recentEff!==null&&prevEff!==null&&prevEff!==0?(recentEff-prevEff)/Math.abs(prevEff)*100:null;

    const efficiency={
      period_start:frame.start,
      through:frame.today,
      shift_count,
      scheduled_only_shift_count,
      active_days:dayRows.filter(x=>x.hours>0).length,
      scheduled_hours:round(scheduled_hours,2),
      worked_hours:round(worked_hours,2),
      observed_worked_hours:round(observed_worked_hours,2),
      outbound_observed_hours:round(outbound_observed_hours,2),
      inbound_observed_hours:round(inbound_observed_hours,2),
      orders_observed_hours:round(orders_observed_hours,2),
      hours_variance:round(worked_hours-scheduled_hours,2),
      attendance_ratio_pct:scheduled_hours>0?round(worked_hours/scheduled_hours*100,1):null,
      avg_tardiness_min:tardiness.length?round(avg(tardiness),1):null,
      on_time_count,
      tardiness_shift_count:tardiness.length,
      tardiness_excluded_count:tardinessExcluded.length,
      tardiness_details:tardinessDetails,
      late_shifts,
      tardiness_exclusions:tardinessExcluded.map((s:any)=>({
        shift_date:String(s.shift_date),
        scheduled_start:s.scheduled_start,
        actual_start:s.actual_start,
        reason:tardinessExceptionReasons.get(`${person.person_key}|${String(s.shift_date)}`)||"attendance exception"
      })),
      on_time_pct:tardiness.length?round(on_time_count/tardiness.length*100,1):null,

      orders:round(orders,0),
      outbound_units:round(outbound_units,0),
      inbound_units:round(inbound_units,0),
      total_units:round(total_units,0),

      orders_per_worked_hour:orders_observed_hours>0?round(orders/orders_observed_hours,2):null,
      outbound_units_per_worked_hour:outbound_observed_hours>0?round(outbound_units/outbound_observed_hours,2):null,
      inbound_units_per_worked_hour:inbound_observed_hours>0?round(inbound_units/inbound_observed_hours,2):null,
      total_units_per_worked_hour:round(total_units_per_worked_hour,2),

      quality_factor:round(qualityFactor*100,2),
      quality_adjusted_units_per_hour:total_units_per_worked_hour!==null?round(total_units_per_worked_hour*qualityFactor,2):null,
      quality_adjusted_formula:"Total units/h × (1 − Missing% − Undelivered%)",

      inbound_share_pct:total_units>0?round(inbound_units/total_units*100,1):null,
      outbound_share_pct:total_units>0?round(outbound_units/total_units*100,1):null,
      consistency_cv_pct:round(cvPct(dayRows.map(x=>finite(x.total_uph)).filter((x:any)=>x!==null) as number[]),1),

      trend:{
        recent_period:`${recentStart} → ${frame.today}`,
        previous_period:`${prevStart} → ${prevEnd}`,
        recent_units_per_hour:round(recentEff,2),
        previous_units_per_hour:round(prevEff,2),
        delta_pct:round(trendDelta,1)
      },
      by_shift_type,
      note:"Efficiency is contextual, not a Rank/ELO score. Orders = Picking App Task Count; Outbound = Items Picked Count (fallback Item Count Total). Daily output is preferred when present for a week; otherwise the weekly GA total is used with Quinyx worked hours from the same covered period. Shift-type breakdown stays daily-only because weekly totals cannot be truthfully assigned to Morning/Afternoon. Reliability uses completed shifts only."
    };

    // Team/store live MTD estimate + projection inputs.
    const [{data:activePeople,error:activeErr},{data:teamObs,error:teamErr},{data:shiftRows,error:shiftErr},{data:teamRatingResponses,error:teamRatingErr}]=await Promise.all([
      db.from("people").select("id,person_key,display_name,full_name,active,employment_type,team_effort_eligible").eq("active",true),
      db.from("metric_observations").select("person_id,metric_id,value,period_start,period_end,source_type")
        .gte("period_start",frame.start).lte("period_start",frame.today).limit(12000),
      db.from("shifts").select("person_id,worked_hours,scheduled_hours,shift_date,shift_type,scheduled_start,actual_start")
        .gte("shift_date",frame.start).lte("shift_date",frame.today).limit(5000),
      db.from("team_rating_responses").select("respondent_person_id,is_valid,disqualified_reason,submitted_at,metadata")
        .eq("response_month",frame.start).order("submitted_at",{ascending:false}).limit(1000)
    ]);
    if(activeErr)throw new Error(activeErr.message);
    if(teamErr)throw new Error(teamErr.message);
    if(shiftErr)throw new Error(shiftErr.message);
    if(teamRatingErr)throw new Error(teamRatingErr.message);

    const activeIds=new Set((activePeople||[]).map((p:any)=>p.id));
    const teamCurrent=(teamObs||[]).filter((r:any)=>activeIds.has(r.person_id));
    const teamCurrentShifts=(shiftRows||[]).filter((r:any)=>activeIds.has(r.person_id));
    const teamDataDates=teamCurrent.map((r:any)=>String(r.period_end||r.period_start||"").slice(0,10)).filter(Boolean).sort();
    const teamDailyPickingDates=teamCurrent.filter((r:any)=>r.source_type==="daily_picking")
      .map((r:any)=>String(r.period_end||r.period_start||"").slice(0,10)).filter(Boolean).sort();
    const teamDataThrough=teamDataDates.at(-1)||null;
    const teamDailyPickingThrough=teamDailyPickingDates.at(-1)||null;

    const latestTeamRatingByPerson=new Map<string,any>();
    for(const r of teamRatingResponses||[]){
      if(!r.respondent_person_id||!activeIds.has(r.respondent_person_id))continue;
      if(r.disqualified_reason==="outside_form_month"||r.metadata?.within_month===false)continue;
      const k=String(r.respondent_person_id);
      if(!latestTeamRatingByPerson.has(k))latestTeamRatingByPerson.set(k,r);
    }
    const teamRatingRequiredPeople=(activePeople||[]).filter((p:any)=>p.employment_type==="HPP"||p.team_effort_eligible===true);
    const teamRatingCompletion=teamRatingRequiredPeople.map((p:any)=>{
      const r=latestTeamRatingByPerson.get(String(p.id));
      const status=r?.is_valid===true?"completed":r?"disqualified":"pending";
      return {
        person_id:p.id,
        display_name:p.display_name,
        status,
        submitted_at:r?.submitted_at??null,
        disqualified_reason:status==="disqualified"?(r?.disqualified_reason||"invalid_response"):null
      };
    }).sort((a:any,b:any)=>{
      const order:any={pending:0,disqualified:1,completed:2};
      return order[a.status]-order[b.status]||a.display_name.localeCompare(b.display_name,"cs");
    });
    const teamRatingCompletedCount=teamRatingCompletion.filter((x:any)=>x.status==="completed").length;
    const teamRatingDisqualifiedCount=teamRatingCompletion.filter((x:any)=>x.status==="disqualified").length;
    const teamRatingTotalCount=teamRatingCompletion.length;

    const tby=rowsByMetric(teamCurrent);
    let storeOutbound=0,storeInbound=0,storeObservedWorked=0;
    const teamPersonIds=[...new Set(teamCurrent.map((r:any)=>r.person_id).filter(Boolean))];
    for(const pid of teamPersonIds){
      const rows=teamCurrent.filter((r:any)=>r.person_id===pid);
      const ps=teamCurrentShifts.filter((s:any)=>s.person_id===pid&&finite(s.worked_hours)!==null);
      const outWeeks=preferredWeeklyObserved(rows,ps,["daily_items_picked_count","daily_item_count_total"],["item_count_total"]);
      const ib=summedGroupedValues(rows,["inbound_normal_units","inbound_icy_units","inbound_freez_units"],(r:any)=>String(r.period_start||""));
      const outDates=new Set<string>([...outWeeks.values()].flatMap((x:any)=>[...x.dates]));
      const ibDates=new Set<string>([...ib.keys()]);
      const observed=new Set<string>([...outDates,...ibDates]);
      storeOutbound+=[...outWeeks.values()].reduce((a:any,x:any)=>a+Number(x.value||0),0);
      storeInbound+=mapSum(ib);
      storeObservedWorked+=workedHoursForDates(ps,observed);
    }
    const storeWorked=sum(teamCurrentShifts.map((x:any)=>x.worked_hours));

    const liveStore={
      month:frame.key,
      through:frame.today,
      data_through:teamDataThrough,
      daily_picking_through:teamDailyPickingThrough,
      uph:storeObservedWorked>0?round((storeOutbound+storeInbound)/storeObservedWorked,2):null,
      pofr:round(weightedAcrossPeople(teamCurrent,"perfect_order_fulfilment_ratio","picking_app_task_count"),2),
      missing_items_ratio:round(weightedAcrossPeople(teamCurrent,"missing_incorrect_items_rate","item_count_total"),2),
      undelivered_items_ratio:round(weightedAcrossPeople(teamCurrent,"daily_undelivered_items_ratio","daily_item_count_total"),2),
      outbound_units:round(storeOutbound,0),
      inbound_units:round(storeInbound,0),
      worked_hours:round(storeWorked,2),
      observed_worked_hours:round(storeObservedWorked,2),
      outercase_scan_ratio:null,
      weighted_availability:null,
      task_completion_ratio:null,
      outbound_seconds_per_unit:null,
      total_score:null,
      status:"provisional"
    };

    // Store Card projection: transparent proxy model, intentionally separate from the official month-end score.
    // Exact documented rule used: Orders + Total Units target = 80% of team maximum.
    // Other categories use current Arena targets where known and team-relative proxies where the spreadsheet formula is not available.
    const teamByPerson=new Map<string,any[]>();
    for(const p of activePeople||[])teamByPerson.set(p.id,[]);
    for(const r of teamCurrent){
      if(!teamByPerson.has(r.person_id))teamByPerson.set(r.person_id,[]);
      teamByPerson.get(r.person_id)!.push(r);
    }

    const proxy=(rows:any[])=>{
      const b=rowsByMetric(rows);
      return {
        orders:preferredWeeklyTotal(rows,["daily_picking_app_task_count"],["picking_app_task_count"]),
        units:preferredWeeklyTotal(rows,["daily_items_picked_count","daily_item_count_total"],["item_count_total"]),
        missing:weightedByPeriod(rows,"missing_incorrect_items_rate","item_count_total"),
        undelivered:weightedByPeriod(rows,"daily_undelivered_items_ratio","daily_item_count_total"),
        scan:weightedByPeriod(rows,"daily_items_picked_via_scanner_ratio","daily_item_count_total")
          ??weightedByPeriod(rows,"items_picked_via_scanner_ratio","item_count_total"),
        bad_goods:weightedByPeriod(rows,"bad_goods_rating_ratio","item_count_total"),
        rating:weightedByPeriod(rows,"average_rating_of_goods","item_count_total"),
        cs:weightedByPeriod(rows,"venue_related_cs_tickets_ratio","item_count_total"),
        accepted:weightedByPeriod(rows,"daily_avg_accepted_time","daily_picking_app_task_count"),
        collection:weightedByPeriod(rows,"daily_avg_collection_time","daily_picking_app_task_count"),
        start_collection:weightedByPeriod(rows,"daily_avg_start_collection_time","daily_picking_app_task_count"),
        inbound:metricSum(b,"inbound_normal_units"),
        icy:metricSum(b,"inbound_icy_units"),
        freeze:metricSum(b,"inbound_freez_units"),
        stock:metricSum(b,"stock_count_adjustment_count"),
        team_rating_votes:metricSum(b,"team_rating_vote_count"),
        forms_filled_points:metricSum(b,"team_rating_forms_filled_points"),
        team_rating_points:metricSum(b,"team_rating_points"),
        people_live_score:metricSum(b,"team_rating_people_score")
      };
    };

    const proxyRows=(activePeople||[]).map((p:any)=>({person:p,metrics:proxy(teamByPerson.get(p.id)||[])}));
    const arr=(k:string)=>proxyRows.map((x:any)=>finite(x.metrics[k])).filter((v:any)=>v!==null) as number[];
    const maxOf=(k:string)=>{const a=arr(k);return a.length?Math.max(...a):null};
    const median=(k:string)=>{const a=arr(k).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};

    // Last official People score is carried only as an estimate because Forms / Team rating / Engage me are monthly/manual inputs.
    const latestClosed=latestMonth?.month||latestOfficialPeriod||null;
    let priorPeopleScore=new Map<string,number>(),priorTotals:any[]=[],priorBonuses:any[]=[];
    if(latestClosed){
      const [{data:ps,error:pse},{data:pb,error:pbe}]=await Promise.all([
        db.from("metric_observations").select("person_id,metric_id,value,period_start")
          .in("metric_id",["store_card_score_people","store_card_total_points"]).eq("period_start",latestClosed).limit(1000),
        db.from("bonus_ledger").select("person_id,amount,bonus_month,status,metadata")
          .eq("bonus_month",latestClosed).in("status",["confirmed","paid"]).limit(1000)
      ]);
      if(pse)throw new Error(pse.message);
      if(pbe)throw new Error(pbe.message);
      priorBonuses=pb||[];
      for(const r of ps||[]){
        if(r.metric_id==="store_card_score_people"&&finite(r.value)!==null)priorPeopleScore.set(r.person_id,Number(r.value));
        if(r.metric_id==="store_card_total_points"&&finite(r.value)!==null)priorTotals.push({person_id:r.person_id,value:Number(r.value)});
      }
    }

    // Store Card scoring rules transcribed from the hidden rule sheets.
    // Flexible metrics: 1 point at 80% of team TOP, 0.5 point at half of that target.
    // Fixed metrics use the published August threshold table.
    const flexibleCountKeys=new Set(["orders","units","inbound","icy","freeze","stock"]);
    const teamRatingTop=maxOf("team_rating_votes");
    const teamRatingOne=teamRatingTop!==null&&teamRatingTop>0?teamRatingTop*.8:null;
    const teamRatingHalf=teamRatingOne!==null?teamRatingOne/2:null;
    const hasLivePeopleSource=proxyRows.some((x:any)=>finite(x.metrics.forms_filled_points)!==null||finite(x.metrics.team_rating_votes)!==null);
    const flexibleThresholds=new Map<string,{one:number,half:number}>();
    for(const k of [...flexibleCountKeys]){
      const mx=maxOf(k);
      if(mx===null||mx<=0)continue;
      const one=Math.round(mx*.8);
      const half=Math.round(one/2);
      flexibleThresholds.set(k,{one,half});
    }
    const flexibleRule=(k:string,v:number|null)=>{
      const t=flexibleThresholds.get(k);
      if(v===null||!t)return {point:0,rule:"čeká na data",one:null,half:null};
      const point=v>=t.one?1:v>=t.half?.5:0;
      return {point,rule:`1 b ≥ ${t.one} · 0,5 b ≥ ${t.half}`,one:t.one,half:t.half};
    };

    const fixedRules:any={
      missing:{direction:"lower",one:.34,half:.40,label:"Missing items"},
      undelivered:{direction:"lower",one:.24,half:.30,label:"Undelivered items"},
      scan:{direction:"higher",one:99,half:96,label:"Scan to pick"},
      bad_goods:{direction:"lower",one:2.00,half:3.90,label:"Bad Goods Rating"},
      rating:{direction:"higher",one:4.70,half:4.60,label:"Avg. goods rating"},
      cs:{direction:"lower",one:0.00,half:0.10,label:"Venue Related CS Tickets"},
      accepted:{direction:"lower",one:.08,half:.11,label:"Average Accepted Time"},
      collection:{direction:"lower",one:2.57,half:3.00,label:"Average Collection Time"},
      start_collection:{direction:"lower",one:7.50,half:14.00,label:"Average Start Collection Time"}
    };
    const fixedRule=(k:string,v:number|null)=>{
      const r=fixedRules[k];
      if(!r||v===null)return {point:0,rule:"čeká na data",one:r?.one??null,half:r?.half??null,direction:r?.direction??null};
      const one=r.direction==="lower"?v<=r.one:v>=r.one;
      const half=r.direction==="lower"?v<=r.half:v>=r.half;
      const point=one?1:half?.5:0;
      const sign=r.direction==="lower"?"≤":"≥";
      return {point,rule:`1 b ${sign} ${r.one} · 0,5 b ${sign} ${r.half}`,one:r.one,half:r.half,direction:r.direction};
    };

    const inboundKeys=["inbound","icy","freeze","stock"];
    const maxPoints=17;

    const leaderboardMetricDefinitions=[
      {id:"store_card_points",label:"Store Card · body",unit:"points",lower_is_better:false,group:"Store Card"},
      {id:"orders",label:"Orders · MTD",unit:"count",lower_is_better:false,group:"Output"},
      {id:"outbound_units",label:"Outbound Units · MTD",unit:"count",lower_is_better:false,group:"Output"},
      {id:"inbound_units",label:"Inbound Units · MTD",unit:"count",lower_is_better:false,group:"Output"},
      {id:"total_units",label:"Total Units · MTD",unit:"count",lower_is_better:false,group:"Output"},
      {id:"orders_per_hour",label:"Orders / h",unit:"number",lower_is_better:false,group:"Efficiency"},
      {id:"outbound_units_per_hour",label:"Outbound Units / h",unit:"number",lower_is_better:false,group:"Efficiency"},
      {id:"inbound_units_per_hour",label:"Inbound Units / h",unit:"number",lower_is_better:false,group:"Efficiency"},
      {id:"total_units_per_hour",label:"Total Units / h",unit:"number",lower_is_better:false,group:"Efficiency"},
      {id:"quality_adjusted_units_per_hour",label:"Quality-adjusted Units / h",unit:"number",lower_is_better:false,group:"Efficiency"},
      {id:"on_time_pct",label:"On-Time",unit:"percent",lower_is_better:false,group:"Reliability"},
      {id:"pofr",label:"POFR",unit:"percent",lower_is_better:false,group:"Quality"},
      {id:"scan_to_pick_ratio",label:"Scan to pick",unit:"percent",lower_is_better:false,group:"Quality"},
      {id:"missing_items_ratio",label:"Missing items",unit:"percent",lower_is_better:true,group:"Quality"},
      {id:"undelivered_items_ratio",label:"Undelivered items",unit:"percent",lower_is_better:true,group:"Quality"},
      {id:"bad_goods_rating_ratio",label:"Bad Goods Rating",unit:"percent",lower_is_better:true,group:"Quality"},
      {id:"avg_goods_rating",label:"Avg. goods rating",unit:"rating",lower_is_better:false,group:"Quality"},
      {id:"refund_percent",label:"Refund",unit:"percent",lower_is_better:true,group:"Quality"},
      {id:"not_collected_items_ratio",label:"Not Collected Items",unit:"percent",lower_is_better:true,group:"Quality"},
      {id:"venue_late_preparation_ratio",label:"Venue Late Preparation",unit:"percent",lower_is_better:true,group:"Quality"},
      {id:"avg_picking_time",label:"Avg Picking Time",unit:"minutes",lower_is_better:true,group:"Speed"},
      {id:"picking_time_per_item",label:"Picking Time / Item",unit:"minutes",lower_is_better:true,group:"Speed"},
      {id:"average_accepted_time",label:"Average Accepted Time",unit:"minutes",lower_is_better:true,group:"Speed"},
      {id:"average_collection_time",label:"Average Collection Time",unit:"minutes",lower_is_better:true,group:"Speed"},
      {id:"average_start_collection_time",label:"Average Start Collection Time",unit:"minutes",lower_is_better:true,group:"Speed"},
      {id:"stock_count",label:"Stock Count",unit:"count",lower_is_better:false,group:"Inbound + SC"},
      {id:"team_rating_votes",label:"Team Rating · hlasy",unit:"count",lower_is_better:false,group:"People"},
      {id:"forms_filled_points",label:"Forms filled · body",unit:"points",lower_is_better:false,group:"People"},
      {id:"people_score",label:"People Score",unit:"points",lower_is_better:false,group:"People"}
    ];

    const attendanceExceptionReasons=new Map<string,string>([
      ["martin-po|2026-09-10","extra shift — planned start is not a valid attendance baseline"]
    ]);

    const buildLeaderboardLiveMetrics=(p:any,m:any)=>{
      const rows=teamByPerson.get(p.id)||[];
      const ps=teamCurrentShifts.filter((s:any)=>s.person_id===p.id&&finite(s.worked_hours)!==null);
      const outWeeks=preferredWeeklyObserved(rows,ps,["daily_items_picked_count","daily_item_count_total"],["item_count_total"]);
      const orderWeeks=preferredWeeklyObserved(rows,ps,["daily_picking_app_task_count"],["picking_app_task_count"]);
      const inboundByDay=summedGroupedValues(rows,["inbound_normal_units","inbound_icy_units","inbound_freez_units"],(r:any)=>String(r.period_start||""));

      const outDates=new Set<string>([...outWeeks.values()].flatMap((x:any)=>[...x.dates]));
      const orderDates=new Set<string>([...orderWeeks.values()].flatMap((x:any)=>[...x.dates]));
      const inboundDates=new Set<string>([...inboundByDay.keys()]);
      const totalDates=new Set<string>([...outDates,...inboundDates]);

      const hasOutbound=outWeeks.size>0;
      const hasOrders=orderWeeks.size>0;
      const hasInbound=inboundByDay.size>0;
      const outbound=hasOutbound?[...outWeeks.values()].reduce((a:any,x:any)=>a+Number(x.value||0),0):null;
      const orders=hasOrders?[...orderWeeks.values()].reduce((a:any,x:any)=>a+Number(x.value||0),0):null;
      const inbound=hasInbound?mapSum(inboundByDay):null;
      const total=(outbound!==null||inbound!==null)?Number(outbound||0)+Number(inbound||0):null;

      const outHours=workedHoursForDates(ps,outDates);
      const orderHours=workedHoursForDates(ps,orderDates);
      const inboundHours=workedHoursForDates(ps,inboundDates);
      const totalHours=workedHoursForDates(ps,totalDates);

      const attendance=ps.filter((s:any)=>
        !!s.scheduled_start&&!!s.actual_start&&!attendanceExceptionReasons.has(`${p.person_key}|${String(s.shift_date)}`)
      );
      const attendanceMinutes=attendance.map((s:any)=>tardinessMinutes(s.scheduled_start,s.actual_start)).filter((v:any)=>v!==null) as number[];
      const onTime=attendanceMinutes.length?attendanceMinutes.filter((v:number)=>v<=5).length/attendanceMinutes.length*100:null;

      const missing=finite(m.missing),undelivered=finite(m.undelivered);
      const qualityFactor=(missing!==null||undelivered!==null)
        ?Math.max(0,1-Number(missing||0)/100-Number(undelivered||0)/100)
        :null;
      const totalUph=totalHours>0&&total!==null?total/totalHours:null;

      return {
        store_card_points:null,
        orders:round(orders,0),
        outbound_units:round(outbound,0),
        inbound_units:round(inbound,0),
        total_units:round(total,0),
        orders_per_hour:orderHours>0&&orders!==null?round(orders/orderHours,2):null,
        outbound_units_per_hour:outHours>0&&outbound!==null?round(outbound/outHours,2):null,
        inbound_units_per_hour:inboundHours>0&&inbound!==null?round(inbound/inboundHours,2):null,
        total_units_per_hour:totalUph!==null?round(totalUph,2):null,
        quality_adjusted_units_per_hour:totalUph!==null&&qualityFactor!==null?round(totalUph*qualityFactor,2):null,
        on_time_pct:round(onTime,1),
        pofr:round(weightedByPeriod(rows,"perfect_order_fulfilment_ratio","picking_app_task_count"),2),
        scan_to_pick_ratio:round(m.scan,2),
        missing_items_ratio:round(m.missing,2),
        undelivered_items_ratio:round(m.undelivered,2),
        bad_goods_rating_ratio:round(m.bad_goods,2),
        avg_goods_rating:round(m.rating,2),
        refund_percent:round(weightedByPeriod(rows,"refund_percent","picking_app_task_count"),2),
        not_collected_items_ratio:round(weightedByPeriod(rows,"not_collected_items_ratio","picking_app_task_count"),2),
        venue_late_preparation_ratio:round(weightedByPeriod(rows,"venue_late_preparation_ratio","picking_app_task_count"),2),
        avg_picking_time:round(weightedByPeriod(rows,"avg_picking_time","picking_app_task_count"),2),
        picking_time_per_item:round(weightedByPeriod(rows,"picking_time_per_item","item_count_total"),2),
        average_accepted_time:round(m.accepted,2),
        average_collection_time:round(m.collection,2),
        average_start_collection_time:round(m.start_collection,2),
        stock_count:round(m.stock,0),
        team_rating_votes:round(m.team_rating_votes,0),
        forms_filled_points:round(m.forms_filled_points,1),
        people_score:round(m.people_live_score,1)
      };
    };

    const projected=proxyRows.map((x:any)=>{
      const m=x.metrics,components:any[]=[];
      const liveMetrics=buildLeaderboardLiveMetrics(x.person,m);
      let dataCount=0,totalInputs=15; // 2 Output + 6 Quality + 3 Speed + 4 IB/SC. People is monthly/manual.

      let output=0;
      for(const k of ["orders","units"]){
        const v=finite(m[k]);
        const s=flexibleRule(k,v);
        if(v!==null&&s.one!==null)dataCount++;
        output+=s.point;
        components.push({key:k,group:"output",value:v,point:s.point,rule:s.rule,one_point_target:s.one,half_point_target:s.half,rule_source:"store_card_hidden_sheet"});
      }

      let quality=0;
      for(const k of ["missing","undelivered","scan","bad_goods","rating","cs"]){
        const v=finite(m[k]);
        const s=fixedRule(k,v);
        if(v!==null)dataCount++;
        quality+=s.point;
        components.push({key:k,group:"quality",value:v,point:s.point,rule:s.rule,one_point_target:s.one,half_point_target:s.half,direction:s.direction,rule_source:"store_card_hidden_sheet"});
      }

      let speed=0;
      for(const k of ["accepted","collection","start_collection"]){
        const v=finite(m[k]);
        const s=fixedRule(k,v);
        if(v!==null)dataCount++;
        speed+=s.point;
        components.push({key:k,group:"speed",value:v,point:s.point,rule:s.rule,one_point_target:s.one,half_point_target:s.half,direction:s.direction,rule_source:"store_card_hidden_sheet"});
      }

      let inboundStock=0;
      for(const k of inboundKeys){
        const v=finite(m[k]);
        const s=flexibleRule(k,v);
        if(v!==null&&s.one!==null)dataCount++;
        inboundStock+=s.point;
        components.push({key:k,group:"inbound_stock",value:v,point:s.point,rule:s.rule,one_point_target:s.one,half_point_target:s.half,rule_source:"store_card_hidden_sheet"});
      }

      let people=0;
      const formsLive=finite(m.forms_filled_points),ratingLive=finite(m.team_rating_points),votesLive=finite(m.team_rating_votes);
      if(hasLivePeopleSource){
        const forms=Math.max(0,Math.min(1,Number(formsLive||0)));
        const rating=Math.max(0,Math.min(1,Number(ratingLive||0)));
        people=Math.round((forms+rating)*2)/2;
        components.push({
          key:"forms_filled",group:"people",value:forms,point:forms,
          rule:"1 b. za platnou odpověď odeslanou do konce měsíce; self-vote = diskvalifikace odpovědi",
          one_point_target:1,half_point_target:null,direction:"higher",rule_source:"team_rating_form_live"
        });
        components.push({
          key:"team_rating",group:"people",value:votesLive??0,point:rating,
          rule:teamRatingOne!==null?`1 b ≥ ${round(teamRatingOne,1)} hlasů · 0,5 b ≥ ${round(teamRatingHalf,1)}`:"čeká na platné hlasy",
          one_point_target:teamRatingOne,half_point_target:teamRatingHalf,direction:"higher",rule_source:"team_rating_form_live"
        });
      }else{
        const peopleRaw=priorPeopleScore.has(x.person.id)?Number(priorPeopleScore.get(x.person.id)):1;
        people=Math.max(-1,Math.min(2,peopleRaw));
        components.push({key:"people_carry",group:"people",value:people,point:people,rule:"Forms filled + Team rating · carry-forward do prvního Team Rating importu",rule_source:"carry_forward"});
      }

      output=Math.round(output*2)/2;
      quality=Math.round(quality*2)/2;
      speed=Math.round(speed*2)/2;
      inboundStock=Math.round(inboundStock*2)/2;
      const total=Math.round((output+quality+speed+inboundStock+people)*2)/2;
      liveMetrics.store_card_points=total;
      const dataCoverage=Math.round(dataCount/totalInputs*100);
      return {
        person_id:x.person.id,
        display_name:x.person.display_name,
        employment_type:x.person.employment_type??null,
        team_effort_eligible:x.person.team_effort_eligible===true,
        total_points:total,
        data_coverage_percent:dataCoverage,
        categories:{output,quality,speed,inbound_stock:inboundStock,people},
        components,
        live_metrics:liveMetrics
      };
    }).sort((a:any,b:any)=>b.total_points-a.total_points||b.data_coverage_percent-a.data_coverage_percent||a.display_name.localeCompare(b.display_name,"cs"));

    projected.forEach((x:any,i:number)=>x.rank=i+1);

    // Store Card movement snapshots. A snapshot is tied to the newest import that can
    // change the personal Store Card proxy. This lets every client see the same arrows
    // instead of relying on local browser history.
    const projectionReportTypes=["ga_metrics","daily_picking","inbound","stock_count","team_rating"];
    const {data:projectionImports,error:projectionImportErr}=await db.from("imports")
      .select("id,report_type,filename,created_at,period_start,period_end")
      .eq("status","imported")
      .in("report_type",projectionReportTypes)
      .lte("period_start",frame.today)
      .gte("period_end",frame.start)
      .order("created_at",{ascending:false})
      .limit(1);
    if(projectionImportErr)throw new Error(projectionImportErr.message);
    const latestProjectionImport=projectionImports?.[0]||null;

    let previousProjectionSnapshot:any=null;
    let movementAvailable=false;
    if(latestProjectionImport){
      const {data:snapshots,error:snapshotErr}=await db.from("store_card_projection_snapshots")
        .select("import_id,report_type,import_created_at,leaderboard,captured_at")
        .eq("month",frame.start)
        .order("captured_at",{ascending:false})
        .limit(20);
      if(snapshotErr)throw new Error(snapshotErr.message);

      previousProjectionSnapshot=(snapshots||[]).find((s:any)=>String(s.import_id||"")!==String(latestProjectionImport.id))||null;
      const currentSnapshot=(snapshots||[]).find((s:any)=>String(s.import_id||"")===String(latestProjectionImport.id))||null;

      if(!currentSnapshot){
        const snapshotLeaderboard=projected.map((x:any)=>({
          person_id:x.person_id,display_name:x.display_name,rank:x.rank,
          points:x.total_points,coverage:x.data_coverage_percent
        }));
        const {error:saveSnapshotErr}=await db.from("store_card_projection_snapshots").upsert({
          month:frame.start,
          import_id:latestProjectionImport.id,
          report_type:latestProjectionImport.report_type,
          import_created_at:latestProjectionImport.created_at,
          leaderboard:snapshotLeaderboard
        },{onConflict:"month,import_id"});
        if(saveSnapshotErr)throw new Error(saveSnapshotErr.message);
      }

      const prevRows=Array.isArray(previousProjectionSnapshot?.leaderboard)?previousProjectionSnapshot.leaderboard:[];
      const prevByPerson=new Map<string,any>(prevRows.map((x:any)=>[String(x.person_id||""),x]));
      for(const x of projected){
        const prev=prevByPerson.get(String(x.person_id));
        x.previous_rank=prev?.rank??null;
        x.rank_delta=prev?.rank!=null?Number(prev.rank)-Number(x.rank):null;
        x.points_delta=prev?.points!=null?round(Number(x.total_points)-Number(prev.points),1):null;
      }
      movementAvailable=prevByPerson.size>0;
    }else{
      for(const x of projected){
        x.previous_rank=null;x.rank_delta=null;x.points_delta=null;
      }
    }

    const mine=projected.find((x:any)=>x.person_id===person.id)||null;
    const teamEffortRows=projected.filter((x:any)=>x.team_effort_eligible===true);
    const teamEffortBest=teamEffortRows.length?Math.max(...teamEffortRows.map((x:any)=>Number(x.total_points||0))):null;
    const teamEffortEstimate=teamEffortRows.length&&teamEffortBest!==null&&teamEffortBest>0
      ?round((teamEffortRows.reduce((a:number,x:any)=>a+Number(x.total_points||0),0)/teamEffortRows.length)/teamEffortBest*100,2)
      :null;
    const teamEffortExcludedDpc=projected.filter((x:any)=>x.employment_type==="DPC").length;
    const teamEffortUnknown=projected.filter((x:any)=>x.employment_type==null).length;

    // Infer 40h/30h bonus class from the last closed Store Card using the
    // official payout itself. Do not derive the TOP component from raw score
    // rank: official red/ineligible people keep their score rank but are
    // skipped for monetary rewards.
    const topBonus=Array.isArray(latestMonth?.top_bonus_czk)?latestMonth.top_bonus_czk.map(Number):[3500,2500,1800,1200,500];
    const priorBonus=priorBonuses.find((x:any)=>x.person_id===person.id);
    let contractClass:string|null=null;
    const priorTeamEffort=finite(priorBonus?.metadata?.team_effort_percent)??finite(latestMonth?.team_effort_percent);
    const priorBonusEligible=priorBonus?.metadata?.bonus_eligible!==false;
    if(priorBonus&&priorBonusEligible&&priorTeamEffort!==null&&priorTeamEffort>=65){
      const amount=Number(priorBonus.amount||0);
      const possibleTop=[0,...topBonus.map((x:any)=>Number(x||0))];
      const teamByClass=priorTeamEffort>=70?{ "40h":800, "30h":600 }:{ "40h":600, "30h":400 };
      const matches=Object.entries(teamByClass).filter(([,team])=>possibleTop.some(t=>Math.abs(amount-(Number(team)+t))<1)).map(([cls])=>cls);
      if(matches.length===1)contractClass=matches[0];
    }

    const projectedRank=mine?.rank??null;
    const projectedTop=projectedRank&&projectedRank<=topBonus.length?Number(topBonus[projectedRank-1]||0):0;
    let projectedTeam:number|null=null;
    if(person.team_effort_eligible===false){
      projectedTeam=0;
    }else if(teamEffortEstimate!==null&&contractClass){
      if(teamEffortEstimate>=70)projectedTeam=contractClass==="40h"?800:600;
      else if(teamEffortEstimate>=65)projectedTeam=contractClass==="40h"?600:400;
      else projectedTeam=0;
    }
    const maxTeam=teamEffortEstimate!==null&&teamEffortEstimate>=70?800:teamEffortEstimate!==null&&teamEffortEstimate>=65?600:0;
    const projectedBonusExact=projectedTeam!==null?projectedTop+projectedTeam:null;
    const projectedBonusMin=projectedTop;
    const projectedBonusMax=projectedTop+(projectedTeam!==null?projectedTeam:maxTeam);

    const projection={
      status:"provisional",
      model_version:"store-card-rules-v2",
      projected_points:mine?.total_points??null,
      projected_rank:projectedRank,
      projected_rank_total:projected.length,
      projected_top_bonus_czk:projectedTop,
      projected_team_bonus_czk:projectedTeam,
      projected_bonus_czk:projectedBonusExact,
      projected_bonus_min_czk:projectedBonusMin,
      projected_bonus_max_czk:projectedBonusMax,
      team_effort_estimate_percent:teamEffortEstimate,
      team_effort_hpp_count:teamEffortRows.length,
      team_effort_dpc_excluded_count:teamEffortExcludedDpc,
      team_effort_unknown_count:teamEffortUnknown,
      team_effort_reference_top_points:teamEffortBest,
      employment_type:person.employment_type??null,
      team_effort_eligible:person.team_effort_eligible===true,
      contract_class_inferred:contractClass,
      data_coverage_percent:mine?.data_coverage_percent??0,
      confidence_percent:mine?Math.round(mine.data_coverage_percent*.65):0,
      categories:mine?.categories||null,
      components:mine?.components||[],
      rank_delta:mine?.rank_delta??null,
      previous_rank:mine?.previous_rank??null,
      points_delta:mine?.points_delta??null,
      movement_available:movementAvailable,
      latest_import:latestProjectionImport?{
        id:latestProjectionImport.id,
        report_type:latestProjectionImport.report_type,
        filename:latestProjectionImport.filename,
        created_at:latestProjectionImport.created_at,
        period_start:latestProjectionImport.period_start,
        period_end:latestProjectionImport.period_end
      }:null,
      movement_baseline_import:previousProjectionSnapshot?{
        id:previousProjectionSnapshot.import_id,
        report_type:previousProjectionSnapshot.report_type,
        created_at:previousProjectionSnapshot.import_created_at||previousProjectionSnapshot.captured_at
      }:null,
      team_rating_completion:{
        month:frame.start,
        completed:teamRatingCompletedCount,
        disqualified:teamRatingDisqualifiedCount,
        pending:Math.max(0,teamRatingTotalCount-teamRatingCompletedCount-teamRatingDisqualifiedCount),
        total:teamRatingTotalCount,
        percent:teamRatingTotalCount?Math.round(teamRatingCompletedCount/teamRatingTotalCount*100):0,
        people:teamRatingCompletion
      },
      leaderboard_metric_definitions:leaderboardMetricDefinitions,
      leaderboard:projected.map((x:any)=>({
        rank:x.rank,
        previous_rank:x.previous_rank??null,
        rank_delta:x.rank_delta??null,
        points_delta:x.points_delta??null,
        person_id:x.person_id,
        display_name:x.display_name,
        points:x.total_points,
        coverage:x.data_coverage_percent,
        employment_type:x.employment_type??null,
        team_effort_eligible:x.team_effort_eligible===true,
        live_metrics:x.live_metrics||{}
      })),
      explanation:hasLivePeopleSource?"Průběžná Store Card používá pravidla ze skrytých listů. People je live z Team Rating Form: platné vyplnění = 1 bod, Team rating = 80 % TOP / polovina targetu; odpovědi po konci měsíce a self-vote se nezapočítají. Team effort počítá pouze HPP.":"Průběžná Store Card používá pravidla ze skrytých listů. People zatím používá carry-forward z poslední uzavřené Store Card, dokud není nahrán Team Rating Form. Team effort počítá pouze HPP."
    };

    // Team benchmark for user-friendly efficiency comparison.
    // Use the same observed-day logic as the personal efficiency calculation.
    const teamEffVals:number[]=[];
    for(const p of activePeople||[]){
      const rows=teamByPerson.get(p.id)||[];
      const ps=teamCurrentShifts.filter((s:any)=>s.person_id===p.id&&finite(s.worked_hours)!==null);
      const outWeeks=preferredWeeklyObserved(rows,ps,["daily_items_picked_count","daily_item_count_total"],["item_count_total"]);
      const ib=summedGroupedValues(rows,["inbound_normal_units","inbound_icy_units","inbound_freez_units"],(r:any)=>String(r.period_start||""));
      const outDates=new Set<string>([...outWeeks.values()].flatMap((x:any)=>[...x.dates]));
      const observed=new Set<string>([...outDates,...ib.keys()]);
      const h=workedHoursForDates(ps,observed);
      const u=[...outWeeks.values()].reduce((a:any,x:any)=>a+Number(x.value||0),0)+mapSum(ib);
      if(h>0)teamEffVals.push(u/h);
    }
    const teamEffAvg=avg(teamEffVals);
    const myEff=finite(efficiency.total_units_per_worked_hour);
    (efficiency as any).team_average_total_units_per_hour=round(teamEffAvg,2);
    (efficiency as any).vs_team_percent=myEff!==null&&teamEffAvg!==null&&teamEffAvg!==0?round((myEff-teamEffAvg)/teamEffAvg*100,1):null;
    (efficiency as any).team_percentile=myEff!==null&&teamEffVals.length?round((percentileScore(myEff,teamEffVals,false)||0)*100,0):null;

    return J({
      ok:true,
      version:"player-store-card-v18",
      person:{
        person_key:person.person_key,
        display_name:person.display_name,
        full_name:person.full_name,
        active:person.active,
        employment_type:person.employment_type??null,
        team_effort_eligible:person.team_effort_eligible===true
      },
      bonus_wallet,
      latest_official_store_card:latestMonth,
      latest_official_points:latestOfficialPoints,
      official_metrics,
      live_personal:live,
      live_store:liveStore,
      raw_metrics,
      metric_series,
      daily_metric_series,
      efficiency_series,
      daily_efficiency_series,
      efficiency,
      projection,
      scoring:{
        projected_bonus_available:true,
        projected_bonus_is_estimate:true,
        reason:hasLivePeopleSource?"Store Card rules are transcribed from the hidden rule sheets and current-month Forms filled / Team rating are live. Projection remains PROVISIONAL until the month is closed; optional Engage me adjustment is not applied unless sourced.":"Store Card rules are transcribed from the hidden rule sheets. People uses carry-forward only until the first current-month Team Rating Form import.",
        reference_threshold_points:latestMonth?.threshold_points??null,
        reference_max_points:latestMonth?.max_points??17,
        rule_set:"hidden-store-card-august-2026-v1",
        automated_rules_exact:true,
        people_rule_live:hasLivePeopleSource,
        team_effort_hpp_only:true
      }
    });
  }catch(e){
    return J({error:String((e as any)?.message||e)},500);
  }
});