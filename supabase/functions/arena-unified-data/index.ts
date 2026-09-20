import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const J=(x:any,status=200)=>new Response(JSON.stringify(x),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});

type Def={
  id:string,label:string,unit:string,lower_is_better:boolean,category:string,
  weekly:string[],daily:string[],monthly?:string[],aggregation:"sum"|"avg",legacy_names:string[]
};

const defs:Def[]=[
 {id:"avg_picking_time",label:"Avg Picking Time",unit:"number",lower_is_better:true,category:"speed",weekly:["avg_picking_time"],daily:[],aggregation:"avg",legacy_names:["Avg Picking Time"]},
 {id:"outbound_orders",label:"Orders",unit:"count",lower_is_better:false,category:"volume",weekly:["picking_app_task_count"],daily:["daily_picking_app_task_count"],aggregation:"sum",legacy_names:["Picking App Task Count"]},
 {id:"outbound_units",label:"Outbound Units",unit:"count",lower_is_better:false,category:"volume",weekly:["item_count_total"],daily:["daily_items_picked_count","daily_item_count_total"],aggregation:"sum",legacy_names:["Item Count Total"]},
 {id:"scanner_ratio",label:"Scanner Ratio",unit:"percent",lower_is_better:false,category:"quality",weekly:["items_picked_via_scanner_ratio"],daily:["daily_items_picked_via_scanner_ratio"],aggregation:"avg",legacy_names:["Items Picked Via Scanner Ratio"]},
 {id:"missing_rate",label:"Missing / Incorrect",unit:"percent",lower_is_better:true,category:"quality",weekly:["missing_incorrect_items_rate"],daily:[],aggregation:"avg",legacy_names:["Missing Incorrect Items Rate"]},
 {id:"pofr",label:"POFR",unit:"percent",lower_is_better:false,category:"quality",weekly:["perfect_order_fulfilment_ratio"],daily:[],aggregation:"avg",legacy_names:["Perfect Order Fulfilment Ratio","Perfect Order Fulfillment Ratio","POFR"]},
 {id:"undelivered_rate",label:"Undelivered Items",unit:"percent",lower_is_better:true,category:"quality",weekly:[],daily:["daily_undelivered_items_ratio"],aggregation:"avg",legacy_names:["Undelivered Items","Undelivered"]},
 {id:"substitutions_rate",label:"Substitutions",unit:"percent",lower_is_better:true,category:"quality",weekly:[],daily:["daily_substitutions_ratio"],aggregation:"avg",legacy_names:["Substitution","Substitutions"]},
 {id:"bad_goods_rate",label:"Bad Goods Rating",unit:"percent",lower_is_better:true,category:"quality",weekly:["bad_goods_rating_ratio"],daily:[],aggregation:"avg",legacy_names:["Bad Goods Rating Ratio","Bad Goods Rating"]},
 {id:"goods_rating",label:"Average Rating of Goods",unit:"number",lower_is_better:false,category:"quality",weekly:["average_rating_of_goods"],daily:[],aggregation:"avg",legacy_names:["Average Rating of Goods"]},
 {id:"not_collected_rate",label:"Not Collected Items",unit:"percent",lower_is_better:true,category:"quality",weekly:["not_collected_items_ratio"],daily:[],aggregation:"avg",legacy_names:["Not Collected Items Ratio","Not Collected Items"]},
 {id:"refund_rate",label:"Refund",unit:"percent",lower_is_better:true,category:"quality",weekly:["refund_percent"],daily:[],aggregation:"avg",legacy_names:["Refund Percent","Refund"]},
 {id:"venue_late_rate",label:"Venue Late Preparation",unit:"percent",lower_is_better:true,category:"quality",weekly:["venue_late_preparation_ratio"],daily:[],aggregation:"avg",legacy_names:["Venue Late Preparation Ratio","Venue Late Preparation"]},
 {id:"merchant_rejection_rate",label:"Merchant Rejection",unit:"percent",lower_is_better:true,category:"quality",weekly:["merchant_rejection_ratio"],daily:[],aggregation:"avg",legacy_names:["Merchant Rejection Ratio"]},
 {id:"cs_tickets_rate",label:"Venue Related CS Tickets",unit:"percent",lower_is_better:true,category:"quality",weekly:["venue_related_cs_tickets_ratio"],daily:[],aggregation:"avg",legacy_names:["Venue Related CS Tickets"]},
 {id:"picking_time_per_item",label:"Picking Time / Item",unit:"number",lower_is_better:true,category:"speed",weekly:["picking_time_per_item"],daily:[],aggregation:"avg",legacy_names:["Picking Time Per Item"]},
 {id:"packing_time_per_item",label:"Packing Time / Item",unit:"number",lower_is_better:true,category:"speed",weekly:["packing_time_per_item"],daily:[],aggregation:"avg",legacy_names:["Packing Time Per Item"]},
 {id:"avg_packing_time",label:"Avg Packing Time",unit:"number",lower_is_better:true,category:"speed",weekly:["avg_packing_time"],daily:[],aggregation:"avg",legacy_names:["Avg Packing Time"]},
 {id:"avg_items_per_order",label:"Avg Items / Order",unit:"number",lower_is_better:false,category:"volume",weekly:["avg_items_per_order"],daily:[],aggregation:"avg",legacy_names:["Avg Items Per Order"]},
 {id:"accepted_time",label:"Average Accepted Time",unit:"number",lower_is_better:true,category:"speed",weekly:[],daily:["daily_avg_accepted_time"],aggregation:"avg",legacy_names:["Average Accepted Time"]},
 {id:"acknowledged_time",label:"Average Acknowledged Time",unit:"number",lower_is_better:true,category:"speed",weekly:[],daily:["daily_avg_acknowledged_time"],aggregation:"avg",legacy_names:["Average Acknowledged Time"]},
 {id:"collection_time",label:"Average Collection Time",unit:"number",lower_is_better:true,category:"speed",weekly:[],daily:["daily_avg_collection_time"],aggregation:"avg",legacy_names:["Average Collection Time"]},
 {id:"start_collection_time",label:"Average Start Collection Time",unit:"number",lower_is_better:true,category:"speed",weekly:[],daily:["daily_avg_start_collection_time"],aggregation:"avg",legacy_names:["Average Start Collection Time"]},
 {id:"ready_pickup_time",label:"Average Ready for Pickup Time",unit:"number",lower_is_better:true,category:"speed",weekly:[],daily:["daily_avg_ready_for_pickup_time"],aggregation:"avg",legacy_names:["Average Ready for Pickup Time"]},
 {id:"production_time",label:"Total Production Time",unit:"number",lower_is_better:true,category:"speed",weekly:[],daily:["daily_total_production_time"],aggregation:"avg",legacy_names:["Total Production Time"]},
 {id:"inbound_normal",label:"Inbound Normal Units",unit:"count",lower_is_better:false,category:"volume",weekly:[],daily:["inbound_normal_units"],monthly:["store_card_inbound_total_units"],aggregation:"sum",legacy_names:["Inbound Units","Inbound Normal Units"]},
 {id:"inbound_icy",label:"Inbound ICY Units",unit:"count",lower_is_better:false,category:"volume",weekly:[],daily:["inbound_icy_units"],monthly:["store_card_inbound_icy_units"],aggregation:"sum",legacy_names:["Inbound ICY Units"]},
 {id:"inbound_freeze",label:"Inbound FREEZE Units",unit:"count",lower_is_better:false,category:"volume",weekly:[],daily:["inbound_freez_units"],monthly:["store_card_inbound_freeze_units"],aggregation:"sum",legacy_names:["Inbound FREEZE Units"]},
 {id:"stock_count",label:"Stock Count",unit:"count",lower_is_better:false,category:"volume",weekly:[],daily:["stock_count_adjustment_count"],monthly:["store_card_stock_count"],aggregation:"sum",legacy_names:["Stock Count"]},
 {id:"worked_hours",label:"Worked Hours",unit:"hours",lower_is_better:false,category:"efficiency",weekly:[],daily:[],aggregation:"sum",legacy_names:["Quinyx Hours"]},
 {id:"orders_per_hour",label:"Orders / h",unit:"number",lower_is_better:false,category:"efficiency",weekly:[],daily:[],aggregation:"avg",legacy_names:[]},
 {id:"outbound_units_per_hour",label:"Outbound Units / h",unit:"number",lower_is_better:false,category:"efficiency",weekly:[],daily:[],aggregation:"avg",legacy_names:[]},
 {id:"inbound_units_per_hour",label:"Inbound Units / h",unit:"number",lower_is_better:false,category:"efficiency",weekly:[],daily:[],aggregation:"avg",legacy_names:[]},
 {id:"total_units_per_hour",label:"Total Units / h",unit:"number",lower_is_better:false,category:"efficiency",weekly:[],daily:[],aggregation:"avg",legacy_names:[]}
];

const storeDefs:any={
 store_outbound_seconds_per_unit:{label:"Outbound sec / unit",unit:"number",lower_is_better:true},
 store_outercase_scan_ratio:{label:"Outercase Scan",unit:"percent",lower_is_better:false},
 store_pofr:{label:"POFR",unit:"percent",lower_is_better:false},
 store_weighted_availability:{label:"Weighted Availability",unit:"percent",lower_is_better:false},
 store_uph:{label:"UPH",unit:"number",lower_is_better:false},
 store_missing_items_ratio:{label:"Missing Items",unit:"percent",lower_is_better:true},
 store_undelivered_items_ratio:{label:"Undelivered Items",unit:"percent",lower_is_better:true},
 store_task_completion_ratio:{label:"Task Completion",unit:"percent",lower_is_better:false},
 store_total_score:{label:"Total Score",unit:"number",lower_is_better:false}
};

function num(v:any){const n=Number(v);return Number.isFinite(n)?n:null}
function day(v:any){return String(v||"").slice(0,10)}
function weekStart(v:any){
 const d=new Date(day(v)+"T12:00:00Z");if(Number.isNaN(d.getTime()))return null;
 const dow=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-dow);
 return d.toISOString().slice(0,10);
}
function avg(a:number[]){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function aggregate(vals:number[],mode:"sum"|"avg"){return mode==="sum"?vals.reduce((a,b)=>a+b,0):avg(vals)}
function displayVenue(key:string,meta:any){
 const n=String(meta?.venue_name||"").trim();if(n)return n;
 return key.replace(/^wolt_market_/,"Wolt Market ").replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase());
}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return J({error:"POST required"},405);
 try{
  const body=await req.json().catch(()=>({}));
  const since=String(body.since||"2026-03-30").slice(0,10);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const {data:people,error:pe}=await db.from("people")
    .select("id,person_key,display_name,full_name,active,employment_type,team_effort_eligible")
    .eq("active",true);
  if(pe)throw new Error(pe.message);
  const ids=(people||[]).map((p:any)=>p.id);

  const [{data:obs,error:oe},{data:shifts,error:se},{data:storeRows,error:sme}]=await Promise.all([
   ids.length?db.from("metric_observations")
     .select("person_id,metric_id,value,period_start,period_end,source_type")
     .in("person_id",ids).gte("period_start",since)
     .in("source_type",["daily_picking","ga_metrics","inbound","stock_count","store_card_monthly"]):Promise.resolve({data:[],error:null}),
   ids.length?db.from("shifts")
     .select("person_id,shift_date,scheduled_start,scheduled_end,scheduled_hours,worked_hours,updated_at")
     .in("person_id",ids).gte("shift_date",since):Promise.resolve({data:[],error:null}),
   db.from("store_metrics")
     .select("venue_key,metric_id,value,period_start,period_end,granularity,metadata")
     .gte("period_start","2026-01-01").order("period_start")
  ]);
  if(oe)throw new Error(oe.message);if(se)throw new Error(se.message);if(sme)throw new Error(sme.message);

  const byPersonObs=new Map<string,any[]>();
  for(const r of obs||[]){if(!byPersonObs.has(r.person_id))byPersonObs.set(r.person_id,[]);byPersonObs.get(r.person_id)!.push(r)}

  const shiftBest=new Map<string,any>();
  for(const s of shifts||[]){
   const k=[s.person_id,s.shift_date,s.scheduled_start||"",s.scheduled_end||""].join("|");
   const old=shiftBest.get(k);
   if(!old||String(s.updated_at||"")>String(old.updated_at||""))shiftBest.set(k,s);
  }
  const byPersonShifts=new Map<string,any[]>();
  for(const s of shiftBest.values()){
   if(!byPersonShifts.has(s.person_id))byPersonShifts.set(s.person_id,[]);
   byPersonShifts.get(s.person_id)!.push(s);
  }

  const team:any={};
  for(const p of people||[]){
   const rows=byPersonObs.get(p.id)||[], ps=byPersonShifts.get(p.id)||[];
   const daily:any={},weekly:any={},monthly:any={};

   // Index values by source metric id.
   const byMetric=new Map<string,any[]>();
   for(const r of rows){if(!byMetric.has(r.metric_id))byMetric.set(r.metric_id,[]);byMetric.get(r.metric_id)!.push(r)}

   for(const d of defs){
    // Exact-day operational series.
    let dailyRows:any[]=[];
    // Daily aliases are preference-ordered (e.g. Items Picked Count before Item Count Total).
    // Use the first source that actually exists for this person so aliases never double-count.
    for(const id of d.daily){
      const candidate=(byMetric.get(id)||[]).filter((r:any)=>day(r.period_start)===day(r.period_end));
      if(candidate.length){dailyRows=candidate;break}
    }
    const dg=new Map<string,number[]>();
    for(const r of dailyRows){
      const v=num(r.value);if(v===null)continue;const k=day(r.period_start);
      if(!dg.has(k))dg.set(k,[]);dg.get(k)!.push(v);
    }
    if(dg.size){
      const labels=[...dg.keys()].sort();
      daily[d.id]={labels,values:labels.map(k=>aggregate(dg.get(k)!,d.aggregation)),source:"data_hub"};
    }

    // Closed Store Card fallback. Keep this as one monthly observation instead of
    // copying a monthly total into every week. Frontend can display it as a monthly
    // fallback point and always prefer the more granular Data Hub rows when available.
    if(d.monthly?.length){
      const mg=new Map<string,{values:number[],period_end:string}>();

      if(d.id==="inbound_normal"){
        // Store Card "IB total units" already includes ICY + FREEZE. The detailed
        // inbound feed exposes Normal/ICY/FREEZE separately, so derive the Normal
        // monthly fallback instead of treating Total as Normal and double-counting.
        const totals=(byMetric.get("store_card_inbound_total_units")||[]).filter((r:any)=>r.source_type==="store_card_monthly");
        const icyByMonth=new Map<string,number>();
        const freezeByMonth=new Map<string,number>();
        for(const r of byMetric.get("store_card_inbound_icy_units")||[]){
          if(r.source_type!=="store_card_monthly")continue;
          const v=num(r.value),k=day(r.period_start);if(v!==null&&k)icyByMonth.set(k,(icyByMonth.get(k)||0)+v);
        }
        for(const r of byMetric.get("store_card_inbound_freeze_units")||[]){
          if(r.source_type!=="store_card_monthly")continue;
          const v=num(r.value),k=day(r.period_start);if(v!==null&&k)freezeByMonth.set(k,(freezeByMonth.get(k)||0)+v);
        }
        for(const r of totals){
          const total=num(r.value),k=day(r.period_start),pe=day(r.period_end||r.period_start);
          if(total===null||!k)continue;
          const normal=Math.max(0,total-(icyByMonth.get(k)||0)-(freezeByMonth.get(k)||0));
          mg.set(k,{values:[normal],period_end:pe||k});
        }
      }else{
        for(const id of d.monthly){
          for(const r of byMetric.get(id)||[]){
            if(r.source_type!=="store_card_monthly")continue;
            const v=num(r.value),k=day(r.period_start),pe=day(r.period_end||r.period_start);
            if(v===null||!k)continue;
            if(!mg.has(k))mg.set(k,{values:[],period_end:pe||k});
            const g=mg.get(k)!;g.values.push(v);
            if(pe&&pe>g.period_end)g.period_end=pe;
          }
        }
      }

      if(mg.size){
        const labels=[...mg.keys()].sort();
        monthly[d.id]={
          labels,
          period_ends:labels.map(k=>mg.get(k)!.period_end),
          values:labels.map(k=>aggregate(mg.get(k)!.values,d.aggregation)),
          source:"store_card_monthly",
          granularity:"month"
        };
      }
    }

    // Prefer explicit weekly GA rows; fill missing newer weeks from daily rows.
    const wg=new Map<string,number[]>();
    for(const id of d.weekly){
      for(const r of byMetric.get(id)||[]){
        const v=num(r.value),k=weekStart(r.period_start);if(v===null||!k)continue;
        if(!wg.has(k))wg.set(k,[]);wg.get(k)!.push(v);
      }
    }
    const dailyWeek=new Map<string,number[]>();
    for(const r of dailyRows){
      const v=num(r.value),k=weekStart(r.period_start);if(v===null||!k)continue;
      if(!dailyWeek.has(k))dailyWeek.set(k,[]);dailyWeek.get(k)!.push(v);
    }
    for(const [k,vals] of dailyWeek)if(!wg.has(k))wg.set(k,vals);
    if(wg.size){
      const labels=[...wg.keys()].sort();
      weekly[d.id]={labels,values:labels.map(k=>aggregate(wg.get(k)!,d.aggregation)),source:"data_hub"};
    }
   }

   // Hours by day/week from deduped Quinyx.
   const hd=new Map<string,number[]>(),hw=new Map<string,number[]>();
   for(const s of ps){
     const v=num(s.worked_hours);if(v===null)continue;
     const dk=day(s.shift_date),wk=weekStart(dk);if(!dk||!wk)continue;
     if(!hd.has(dk))hd.set(dk,[]);hd.get(dk)!.push(v);
     if(!hw.has(wk))hw.set(wk,[]);hw.get(wk)!.push(v);
   }
   if(hd.size){const labels=[...hd.keys()].sort();daily.worked_hours={labels,values:labels.map(k=>aggregate(hd.get(k)!,"sum")),source:"quinyx"}}
   if(hw.size){const labels=[...hw.keys()].sort();weekly.worked_hours={labels,values:labels.map(k=>aggregate(hw.get(k)!,"sum")),source:"quinyx"}}

   const addEfficiency=(bucket:any,gran:"day"|"week")=>{
     const labels=new Set<string>();
     for(const id of ["outbound_orders","outbound_units","inbound_normal","inbound_icy","inbound_freeze","worked_hours"]){
       for(const x of bucket[id]?.labels||[])labels.add(x);
     }
     const sorted=[...labels].sort();
     const val=(id:string,k:string)=>{const s=bucket[id];if(!s)return null;const i=s.labels.indexOf(k);return i>=0?num(s.values[i]):null};
     const series=(id:string,fn:(k:string)=>number|null)=>{
       const values=sorted.map(fn);if(!values.some(v=>v!==null))return;
       bucket[id]={labels:sorted,values,source:"computed"};
     };
     series("orders_per_hour",k=>{const h=val("worked_hours",k),o=val("outbound_orders",k);return h&&o!==null?o/h:null});
     series("outbound_units_per_hour",k=>{const h=val("worked_hours",k),o=val("outbound_units",k);return h&&o!==null?o/h:null});
     series("inbound_units_per_hour",k=>{const h=val("worked_hours",k),ib=(val("inbound_normal",k)||0)+(val("inbound_icy",k)||0)+(val("inbound_freeze",k)||0);return h&&ib?ib/h:null});
     series("total_units_per_hour",k=>{const h=val("worked_hours",k),out=val("outbound_units",k)||0,ib=(val("inbound_normal",k)||0)+(val("inbound_icy",k)||0)+(val("inbound_freeze",k)||0);return h&&(out||ib)?(out+ib)/h:null});
   };
   addEfficiency(daily,"day");addEfficiency(weekly,"week");

   team[p.id]={
    id:p.id,name:p.full_name||p.display_name||p.person_key,person_key:p.person_key,
    employment_type:p.employment_type,team_effort_eligible:p.team_effort_eligible===true,
    daily,weekly,monthly
   };
  }

  const storeMap:any={};
  for(const r of storeRows||[]){
    const key=String(r.venue_key),id=String(r.metric_id),v=num(r.value);if(v===null)continue;
    if(!storeMap[key])storeMap[key]={key,name:displayVenue(key,r.metadata),metrics:{}};
    if(!storeMap[key].metrics[id])storeMap[key].metrics[id]=[];
    storeMap[key].metrics[id].push({period_start:day(r.period_start),period_end:day(r.period_end),value:v});
  }
  for(const st of Object.values(storeMap) as any[]){
    for(const id of Object.keys(st.metrics))st.metrics[id].sort((a:any,b:any)=>a.period_start.localeCompare(b.period_start));
  }

  return J({
    ok:true,version:"arena-unified-data-v4",since,
    metrics:defs.map(d=>({id:d.id,label:d.label,unit:d.unit,lower_is_better:d.lower_is_better,category:d.category,legacy_names:d.legacy_names,daily_available:Object.values(team).some((p:any)=>!!p.daily[d.id]),weekly_available:Object.values(team).some((p:any)=>!!p.weekly[d.id]),monthly_available:Object.values(team).some((p:any)=>!!p.monthly?.[d.id]),monthly_source_ids:d.monthly||[]})),
    people:team,
    store:{metrics:Object.entries(storeDefs).map(([id,d]:any)=>({id,...d})),stores:storeMap}
  });
 }catch(e){return J({error:String((e as any)?.message||e)},500)}
});
