import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"
};
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"content-type":"application/json"}});

const MONTHS:any={
  january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,
  leden:1,"únor":2,unor:2,"březen":3,brezen:3,duben:4,"květen":5,kveten:5,"červen":6,cerven:6,"červenec":7,cervenec:7,
  srpen:8,"září":9,zari:9,"říjen":10,rijen:10,listopad:11,prosinec:12
};

const n=(v:any)=>{
  const s=String(v??"").trim().replace(/\s/g,"").replace("%","").replace(",",".");
  if(!s||s==="-"||s==="—")return null;
  const x=Number(s); return Number.isFinite(x)?x:null;
};
const norm=(s:string)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const compact=(s:string)=>norm(s).replace(/\s+/g,"");
const center=(it:any)=>Number(it.x||0)+Number(it.w||0)/2;

function monthFromText(raw:string){
  const s=" "+norm(raw)+" ";
  const ordered=["september","november","december","february","cervenec","listopad","prosinec","january","october","august","brezen","duben","april","kveten","cerven","srpen","rijen","zari","march","june","july","leden","unor","may"];
  for(const k of ordered){
    if(s.includes(" "+k+" "))return MONTHS[k]??null;
  }
  return null;
}

function inferMonth(filename:string,layout:any[]){
  // Filename is authoritative. The PDF itself contains a 12-month threshold
  // table, so scanning the whole document for month names can select the wrong month.
  const fy=String(filename||"").match(/\b(20\d{2})\b/);
  const fm=monthFromText(filename);
  if(fy&&fm){
    const year=Number(fy[1]),month=Number(fm);
    const start=`${year}-${String(month).padStart(2,"0")}-01`;
    return {year,month,period_start:start,period_end:new Date(Date.UTC(year,month,0)).toISOString().slice(0,10),source:"filename"};
  }

  const page1=norm((layout?.[0]?.items||[]).map((i:any)=>i.text).join(" "));
  let title=page1.match(/\bresults\s+([a-z]+)\s+(20\d{2})\b/);
  if(title){
    const month=monthFromText(title[1]),year=Number(title[2]);
    if(month){
      const start=`${year}-${String(month).padStart(2,"0")}-01`;
      return {year,month,period_start:start,period_end:new Date(Date.UTC(year,month,0)).toISOString().slice(0,10),source:"page1_results_title"};
    }
  }

  const anyYear=page1.match(/\b(20\d{2})\b/);
  const perMonth=page1.match(/\bper\s+month\s+([a-z]+)\b/);
  const month=perMonth?monthFromText(perMonth[1]):null;
  if(anyYear&&month){
    const year=Number(anyYear[1]);
    const start=`${year}-${String(month).padStart(2,"0")}-01`;
    return {year,month,period_start:start,period_end:new Date(Date.UTC(year,month,0)).toISOString().slice(0,10),source:"page_title"};
  }
  return null;
}

function groupRows(page:any,tol=1.4){
  const items=[...(page?.items||[])].filter((x:any)=>x.text&&String(x.text).trim()).sort((a:any,b:any)=>b.y-a.y||a.x-b.x);
  const rows:any[]=[];
  for(const it of items){
    let row=rows.find(r=>Math.abs(r.y-it.y)<=tol);
    if(!row){row={y:it.y,items:[]};rows.push(row)}
    row.items.push(it);
  }
  for(const r of rows)r.items.sort((a:any,b:any)=>a.x-b.x);
  rows.sort((a,b)=>b.y-a.y);
  return rows;
}
function txt(row:any,min=-Infinity,max=Infinity){
  return row.items.filter((i:any)=>center(i)>=min&&center(i)<max).map((i:any)=>i.text).join(" ").replace(/\s+/g," ").trim();
}
function val(row:any,min:number,max:number){
  const s=txt(row,min,max); const m=s.match(/-?\d+(?:[.,]\d+)?%?/); return m?n(m[0]):null;
}
function canonicalVenue(raw:any){
  const safe=String(raw??"").trim();
  const c=compact(safe);
  if(c.includes("holesovice"))return {venue:"Wolt Market Holešovice",venue_key:"wolt_market_holesovice"};
  if(c.includes("zizkov"))return {venue:"Wolt Market Žižkov",venue_key:"wolt_market_zizkov"};
  if(c.includes("michle"))return {venue:"Wolt Market Michle",venue_key:"wolt_market_michle"};
  if(c.includes("brnostred"))return {venue:"Wolt Market Brno-střed",venue_key:"wolt_market_brno_stred"};
  return {venue:safe.replace(/\s+/g," ").trim(),venue_key:norm(safe).replace(/\s+/g,"_")};
}

function parsePeople(layout:any[],identityHints:any[]=[]){
  const hints=(identityHints||[])
    .filter((h:any)=>h&&h.alias_value&&h.person_id)
    .map((h:any)=>({alias_value:String(h.alias_value),key:compact(h.alias_value),person_id:h.person_id,display_name:h.display_name||null}))
    .filter((h:any)=>h.key.length>=3)
    .sort((a:any,b:any)=>b.key.length-a.key.length);

  const pageRanks=(layout||[]).map((p:any,idx:number)=>{
    const items=(p.items||[]).map((x:any)=>String(x.text||""));
    const joined=items.join(" ");
    const tight=items.join("");
    const emailCount=(joined.match(/[A-Z0-9._%+-]+\s*@\s*wolt\s*\.\s*com/ig)||[]).length+
      (tight.match(/[A-Z0-9._%+-]+@wolt\.com/ig)||[]).length;
    const compactPage=compact(joined);
    const hintHits=hints.filter((h:any)=>compactPage.includes(h.key)).slice(0,30).length;
    let score=emailCount*12+hintHits*3;
    if(/Total points per GA/i.test(joined))score+=12;
    if(/Orders picked|Total units picked|Scan to Pick|Average Accepted Time/i.test(joined))score+=8;
    if(/E-?mail/i.test(joined))score+=3;
    return {p,idx,score,emailCount,hintHits};
  }).sort((a:any,b:any)=>b.score-a.score);

  // Historical cards can omit/split the email column. Metric headers or known picker/name
  // rows are therefore sufficient to identify the GA table page.
  const candidates=pageRanks.filter((x:any)=>x.score>=8).slice(0,3);
  const out:any[]=[];
  const seen=new Set<string>();

  for(const cand of candidates){
    const rows=groupRows(cand.p,2.6);
    for(const r of rows){
      const itemTexts=(r.items||[]).map((i:any)=>String(i.text||"").trim()).filter(Boolean);
      const rowText=itemTexts.join(" ").replace(/\s+/g," ").trim();
      const tight=itemTexts.join("").replace(/\s+/g,"");
      const compactRow=compact(rowText);
      if(!rowText||/Total points per GA|Orders picked|Total units picked|Average Accepted Time|E-?mail/i.test(rowText))continue;

      let email:string|null=null;
      const em1=rowText.replace(/\s*@\s*/g,"@").replace(/\s*\.\s*/g,".").match(/[A-Z0-9._%+-]+@wolt\.com/i);
      const em2=tight.match(/[A-Z0-9._%+-]+@wolt\.com/i);
      if(em1||em2)email=String((em1||em2)![0]).toLowerCase();

      const hint=hints.find((h:any)=>compactRow.includes(h.key))||null;
      let picker=txt(r,112,160)||null;
      let display=txt(r,150,205)||null;

      // If the old layout shifted columns, prefer the exact known picker/name token
      // that is visibly present in this row.
      if(hint){
        if(!picker||compact(picker).length<3||/\d/.test(picker))picker=hint.alias_value;
        if(!display&&hint.display_name)display=hint.display_name;
      }

      const values:any={
        orders_picked:val(r,195,211),
        total_units_picked:val(r,214,231),
        missing_items_ratio:val(r,232,250),
        undelivered_items_ratio:val(r,254,272),
        scan_to_pick_ratio:val(r,273,292),
        bad_goods_rating_ratio:val(r,298,317),
        avg_goods_rating:val(r,328,346),
        venue_related_cs_tickets_ratio:val(r,362,383),
        average_accepted_time:val(r,393,410),
        average_collection_time:val(r,420,438),
        average_start_collection_time:val(r,451,469),
        inbound_total_units:val(r,471,488),
        inbound_icy_units:val(r,490,507),
        inbound_freeze_units:val(r,510,529),
        stock_count:val(r,531,545),
        team_rating:val(r,557,574),
        score_outbound:val(r,592,607),
        score_quality:val(r,620,634),
        score_speed:val(r,648,662),
        score_inbound_stock:val(r,675,689),
        score_people:val(r,702,716),
        total_points:val(r,730,746)
      };
      const numericCount=Object.values(values).filter((v:any)=>v!==null&&v!==undefined).length;
      if(!email&&!hint)continue;
      if(numericCount<2&&!email)continue;

      const identityKey=email||String(hint?.person_id||picker||display||rowText);
      if(seen.has(identityKey))continue;
      seen.add(identityKey);
      out.push({
        email,
        picker_login:picker||hint?.alias_value||null,
        display_name:display||hint?.display_name||picker||email,
        hint_person_id:hint?.person_id||null,
        ...values
      });
    }
    if(out.length)break;
  }
  return out;
}

function parseRewards(layout:any[],people:any[],period:any,knownPeople:any[]=[]){
  const p=layout[0]; if(!p)return {};
  const rows=groupRows(p,1.6);
  const key=(s:any)=>compact(String(s||""));

  // Build a canonical identity map from the people table, not from parsed Store Card
  // display strings. Old PDFs often append the first KPI value to the person's name
  // (e.g. "Pavel Kyselka 41"), which previously made every payout look unmatched.
  const canonical=new Map<string,Set<string>>();
  const add=(name:any,pid:any)=>{
    const k=key(name);if(!k||!pid)return;
    if(!canonical.has(k))canonical.set(k,new Set());
    canonical.get(k)!.add(String(pid));
  };
  for(const kp of knownPeople||[]){
    add(kp.display_name,kp.id);add(kp.full_name,kp.id);
  }
  for(const pp of people||[]){
    const pid=pp.hint_person_id||pp.person_id||null;
    add(pp.display_name,pid);add(pp.picker_login,pid);
    if(pp.email)add(String(pp.email).split("@")[0].replace(/[._-]+/g," "),pid);
  }
  const resolveName=(name:any)=>{
    const k=key(name);if(!k)return null;
    const exact=canonical.get(k);
    if(exact&&exact.size===1)return [...exact][0];
    // Historical layouts can glue medals, KPI values or payout amounts around the name.
    // Match a unique canonical identity anywhere in the row; never guess across people.
    const candidates=new Set<string>();
    for(const [ck,pids] of canonical){
      if(ck.length<5)continue;
      if(k.includes(ck)||ck.includes(k)){
        for(const pid of pids)candidates.add(pid);
      }
    }
    return candidates.size===1?[...candidates][0]:null;
  };

  const personById=new Map<string,any>();
  for(const pp of people||[]){
    const pid=pp.hint_person_id||pp.person_id||null;
    if(pid&&!personById.has(String(pid)))personById.set(String(pid),pp);
  }

  const colorAware=(p.items||[]).some((i:any)=>typeof i.red_bg==="boolean");
  const ineligiblePersonIds=new Set<string>();
  if(colorAware){
    for(const r of rows){
      const resultName=txt(r,75,185);
      const pid=resolveName(resultName);
      if(!pid)continue;
      const red=(r.items||[]).some((i:any)=>{
        const x=center(i);
        return x>=75&&x<185&&i.red_bg===true;
      });
      if(red)ineligiblePersonIds.add(String(pid));
    }
  }

  // Monetary rules are read from each PDF itself. Historical cards changed both
  // TOP amounts and Team Bonus thresholds/amounts, so nothing here is hard-coded by month.
  let top_bonus_czk:number[]=[];
  for(const r of rows){
    const all=r.items.map((i:any)=>String(i.text||"")).join(" ");
    const vals=r.items
      .filter((i:any)=>center(i)>=385&&center(i)<590)
      .map((i:any)=>n(i.text)).filter((x:any)=>x!=null&&Number.isFinite(Number(x)));
    if(vals.length>=5 && (/TOP\s*1/i.test(all)||vals[0]>=500)){
      top_bonus_czk=vals.slice(0,5).map((x:any)=>Number(x));
      if(top_bonus_czk.every((x:any)=>x>=0))break;
    }
  }

  let team_effort_pct:number|null=null;
  let team40:number[]|null=null,team30:number[]|null=null;
  let thresholdHigh:number|null=null,thresholdMid:number|null=null;

  const rowText=(r:any)=>(r.items||[]).map((i:any)=>String(i.text||"")).join(" ").replace(/\s+/g," ").trim();
  const findLabeledRow=(re:RegExp)=>rows.find((r:any)=>re.test(rowText(r)))||null;
  const rowNumbersAfterLabel=(r:any,labelRe:RegExp)=>{
    if(!r)return [];
    const label=(r.items||[]).find((i:any)=>labelRe.test(String(i.text||"")));
    const lx=label?center(label):-Infinity;
    return (r.items||[])
      .filter((i:any)=>center(i)>lx+4)
      .map((i:any)=>({x:center(i),v:n(i.text),t:String(i.text||"")}))
      .filter((q:any)=>q.v!=null&&Number.isFinite(Number(q.v))&&q.v>=0&&q.v<=20000)
      .sort((a:any,b:any)=>a.x-b.x)
      .map((q:any)=>Number(q.v));
  };

  for(const r of rows){
    const all=rowText(r);
    if(/Team effort AVG/i.test(all)){
      const perc=(all.match(/-?\d+(?:[.,]\d+)?\s*%/)||[])[0];
      team_effort_pct=perc?n(perc):null;
    }
  }

  const row40=findLabeledRow(/40h\s*\/\s*w/i);
  const row30=findLabeledRow(/30h\s*\/\s*w/i);
  if(row40){
    const vals=rowNumbersAfterLabel(row40,/40h\s*\/\s*w/i);
    if(vals.length>=3)team40=vals.slice(0,3);
  }
  if(row30){
    const vals=rowNumbersAfterLabel(row30,/30h\s*\/\s*w/i);
    if(vals.length>=3)team30=vals.slice(0,3);
  }

  // Pick the threshold row nearest the 40h row, then read only cells that actually
  // contain a comparison sign + percentage. This avoids KPI values like 8.5 being
  // mistaken for a bonus threshold on older cards.
  const thresholdCandidates=rows
    .filter((r:any)=>{
      const all=rowText(r);
      return /%/.test(all)&&(/[≥>]/.test(all)||/>=/.test(all))&&/</.test(all);
    })
    .sort((a:any,b:any)=>{
      const ay=row40?Math.abs(Number(a.y)-Number(row40.y)):0;
      const by=row40?Math.abs(Number(b.y)-Number(row40.y)):0;
      return ay-by;
    });
  const tr=thresholdCandidates[0]||null;
  if(tr){
    const its=[...(tr.items||[])].sort((a:any,b:any)=>center(a)-center(b));
    const thresholdVals:any[]=[];
    for(let i=0;i<its.length;i++){
      const v=n(its[i].text);
      if(v==null||v<0||v>100)continue;
      const x=center(its[i]);
      const near=its.filter((z:any)=>Math.abs(center(z)-x)<20).map((z:any)=>String(z.text||"")).join(" ");
      if(!/%/.test(near))continue;
      if(!(/[≥><]/.test(near)||/>=|<=/.test(near)))continue;
      thresholdVals.push({x,v:Number(v),near});
    }
    thresholdVals.sort((a:any,b:any)=>a.x-b.x);
    const unique:any[]=[];
    for(const q of thresholdVals){
      if(!unique.some((u:any)=>Math.abs(u.x-q.x)<8))unique.push(q);
    }
    if(unique.length>=2){
      thresholdHigh=unique[0].v;
      thresholdMid=unique[1].v;
    }
  }

  // Geometry fallback for the common Store Card template.
  if(thresholdHigh==null||thresholdMid==null){
    for(const r of rows){
      const left=txt(r,420,465),mid=txt(r,465,505),right=txt(r,505,545);
      if(/%/.test(left)&&/%/.test(mid)&&/%/.test(right)&&(/[≥>]/.test(left)||/>=/.test(left))&&(/[≥>]/.test(mid)||/>=/.test(mid))&&/</.test(right)){
        thresholdHigh=n(left);thresholdMid=n(mid);break;
      }
    }
  }

  // Second fallback: numbers in the 40h/30h rows by the three bonus-column centers.
  if((!team40||team40.length<3)&&row40){
    const vals=(row40.items||[]).map((i:any)=>({x:center(i),v:n(i.text)}))
      .filter((q:any)=>q.v!=null&&q.x>420&&q.x<545).sort((a:any,b:any)=>a.x-b.x);
    if(vals.length>=3)team40=vals.slice(0,3).map((q:any)=>Number(q.v));
  }
  if((!team30||team30.length<3)&&row30){
    const vals=(row30.items||[]).map((i:any)=>({x:center(i),v:n(i.text)}))
      .filter((q:any)=>q.v!=null&&q.x>420&&q.x<545).sort((a:any,b:any)=>a.x-b.x);
    if(vals.length>=3)team30=vals.slice(0,3).map((q:any)=>Number(q.v));
  }

  let teamTier:number|null=null;
  if(team_effort_pct!=null&&thresholdHigh!=null&&thresholdMid!=null){
    teamTier=team_effort_pct>=thresholdHigh?0:team_effort_pct>=thresholdMid?1:2;
  }
  const team_bonus_40h=teamTier!=null&&team40?team40[teamTier]??null:null;
  const team_bonus_30h=teamTier!=null&&team30?team30[teamTier]??null:null;
  const team_bonus_rules={
    thresholds:{
      high_min_pct:thresholdHigh,
      mid_min_pct:thresholdMid,
      low_below_pct:thresholdMid
    },
    columns:[
      {key:"high",label:thresholdHigh!=null?`>= ${thresholdHigh}%`:"high",index:0},
      {key:"mid",label:thresholdMid!=null?`>= ${thresholdMid}%`:"mid",index:1},
      {key:"low",label:thresholdMid!=null?`< ${thresholdMid}%`:"low",index:2}
    ],
    forty_h_czk:team40||[],
    thirty_h_czk:team30||[],
    selected_tier:teamTier==null?null:["high","mid","low"][teamTier],
    selected_40h_czk:team_bonus_40h,
    selected_30h_czk:team_bonus_30h,
    team_effort_pct
  };

  // The result table itself marks TOP 1-5 with medals. Use that as the
  // authoritative rank so bonus decomposition does not depend on amount ordering.
  // The visible Results table is already sorted by score. Red/struck rows are
  // disqualified for rewards and must not consume a TOP rank slot.
  const resultRows:any[]=[];
  for(const r of rows){
    const sourceName=txt(r,75,185);
    const score=val(r,185,215);
    if(!sourceName||score==null)continue;
    if(/GA name|Venue Name|Team effort|tablet|Exter\d*|restaurant-api/i.test(sourceName))continue;
    const pid=resolveName(sourceName);
    const red=(r.items||[]).some((i:any)=>{
      const x=center(i);
      return x>=75&&x<185&&i.red_bg===true;
    });
    resultRows.push({source_name:sourceName,person_id:pid,total_points:Number(score),ineligible:red});
  }

  const eligibleRanking=resultRows.filter((x:any)=>!x.ineligible).slice(0,5);
  const rankingTop5=eligibleRanking.map((x:any,i:number)=>({...x,rank:i+1}));
  const topRankByPerson=new Map<string,number>();
  for(const x of rankingTop5)if(x.person_id)topRankByPerson.set(String(x.person_id),Number(x.rank));

  // Official payout table on page 1. Match payout names to canonical person_id.
  // Keep coordinates broad enough for Jan-Aug layouts, then validate by canonical name.
  const payouts:any[]=[];
  const payoutSeen=new Set<string>();
  for(const r of rows){
    // Payout table lives in the middle of page 1, while the main ranking table is on
    // the left. Match a known person anywhere in that middle region.
    const nameCandidates=[
      txt(r,185,395),
      txt(r,200,380),
      txt(r,220,360)
    ].filter(Boolean);
    let pid:string|null=null,sourceName="";
    for(const nm of nameCandidates){
      const hit=resolveName(nm);
      if(hit){pid=hit;sourceName=nm;break}
    }
    if(!pid)continue;

    // Prefer integer-like CZK values in the payout amount band. Keep old windows as fallback.
    const middleNums=(r.items||[])
      .map((i:any)=>({x:center(i),v:n(i.text),t:String(i.text||"")}))
      .filter((q:any)=>q.v!=null&&Number.isFinite(Number(q.v))&&q.x>=285&&q.x<390&&q.v>=0&&q.v<=20000)
      .sort((a:any,b:any)=>a.x-b.x);
    const amountCandidates=[
      ...middleNums.map((q:any)=>Number(q.v)),
      val(r,295,350),val(r,300,365),val(r,315,385)
    ].filter((x:any)=>x!=null&&Number.isFinite(Number(x))) as number[];
    const plausible=amountCandidates.find((x:any)=>x>=0&&x<=20000);
    if(plausible==null)continue;

    const dedupeKey=String(pid)+"|"+String(plausible);
    if(payoutSeen.has(dedupeKey))continue;
    payoutSeen.add(dedupeKey);

    const pp=personById.get(String(pid))||{};
    const eligible=colorAware?!ineligiblePersonIds.has(String(pid)):null;
    const amount=Number(plausible);
    const knownRank=topRankByPerson.get(String(pid))||null;
    const topComponent=knownRank?Number(top_bonus_czk[knownRank-1]||0):0;
    const selectedTeam=[
      {hours_band:"40h",tier:teamTier,value:Number(team_bonus_40h??NaN)},
      {hours_band:"30h",tier:teamTier,value:Number(team_bonus_30h??NaN)},
      {hours_band:"none",tier:null,value:0}
    ].filter((x:any)=>Number.isFinite(x.value));
    const residual=amount-topComponent;
    const teamMatches=selectedTeam.filter((x:any)=>x.value===residual);
    const directDecomposition=teamMatches.length===1?{
      top_rank:knownRank,
      top_bonus_czk:topComponent,
      team_bonus_czk:teamMatches[0].value,
      hours_band:teamMatches[0].hours_band,
      team_tier:teamMatches[0].tier,
      rule_match:true
    }:null;

    const decomposition:any[]=[];
    if(directDecomposition)decomposition.push(directDecomposition);
    if(!knownRank){
      // Fallback for historical PDFs whose medal glyph was not extractable.
      for(let rank=0;rank<Math.min(5,top_bonus_czk.length);rank++){
        for(const tb of selectedTeam){
          if(Number(top_bonus_czk[rank]||0)+tb.value===amount){
            decomposition.push({top_rank:rank+1,top_bonus_czk:Number(top_bonus_czk[rank]||0),team_bonus_czk:tb.value,hours_band:tb.hours_band,team_tier:tb.tier,rule_match:true});
          }
        }
      }
      for(const tb of selectedTeam){
        if(tb.value===amount)decomposition.push({top_rank:null,top_bonus_czk:0,team_bonus_czk:tb.value,hours_band:tb.hours_band,team_tier:tb.tier,rule_match:true});
      }
    }

    payouts.push({
      person_id:String(pid),
      email:pp.email||null,
      display_name:(knownPeople||[]).find((x:any)=>String(x.id)===String(pid))?.full_name||pp.display_name||sourceName,
      source_name:sourceName,
      confirmed_bonus_czk:amount,
      bonus_eligible:eligible,
      eligibility_source:eligible===false?"official_store_card_red_cell":eligible===true?"official_store_card_color":"unknown",
      top_rank:knownRank,
      payout_decomposition:directDecomposition||(decomposition.length===1?decomposition[0]:null),
      payout_decomposition_candidates:decomposition,
      payout_rule_match:!!directDecomposition||decomposition.length>0
    });
  }

  let monthly_threshold_points:number|null=null;
  if(period){
    const en=Object.entries(MONTHS).find(([k,v])=>v===period.month&&/^[a-z]+$/.test(k))?.[0];
    if(en){
      for(const r of rows){
        const label=txt(r,645,715).toLowerCase();
        if(label===en){monthly_threshold_points=val(r,715,752);break}
      }
    }
  }

  return {
    top_bonus_czk,team_effort_pct,team_bonus_40h,team_bonus_30h,team_bonus_rules,monthly_threshold_points,payouts,
    ranking_top5:rankingTop5,
    result_rows:resultRows,
    color_eligibility_detected:colorAware,
    ineligible_people:payouts.filter((x:any)=>x.bonus_eligible===false).map((x:any)=>x.display_name),
    payout_match_count:payouts.length
  };
}

function parseRewardsText(rawText:string,people:any[],knownPeople:any[],base:any){
  const raw=String(rawText||"");
  if(!raw.trim())return null;
  const page1=raw.split(/\n\s*--- PAGE ---\s*\n/i)[0]||raw;
  const rawLines=page1.split(/\r?\n/).map(x=>String(x||"").trim()).filter(Boolean);
  const cellRows=rawLines.map(line=>line.split("|").map(x=>String(x||"").replace(/\s+/g," ").trim()).filter(Boolean));
  const clean=(s:any)=>String(s||"").replace(/\s+/g," ").trim();
  const folded=(s:any)=>clean(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const num=(s:any)=>{
    const m=String(s||"").replace(/\u00a0/g," ").match(/-?\d+(?:[.,]\d+)?/);
    if(!m)return null;
    const v=Number(m[0].replace(",","."));
    return Number.isFinite(v)?v:null;
  };
  const integerMoney=(s:any)=>{
    const t=String(s||"").replace(/\u00a0/g," ").trim();
    if(/[.,]\d/.test(t))return null;
    const m=t.match(/(?:^|\s)(\d{1,5})(?:\s*(?:Kč|czk))?(?:\s|$)/i);
    if(!m)return null;
    const v=Number(m[1]);
    return Number.isFinite(v)&&v>=0&&v<=20000?v:null;
  };

  let teamEffort:number|null=null,high:number|null=null,mid:number|null=null;
  let team40:number[]|null=null,team30:number[]|null=null;

  // Parse the Team Bonus table from actual PDF cells first. This is much more stable
  // than X coordinates because every monthly Store Card keeps the same visible table
  // but older PDFs encode the text geometry differently.
  for(const cells of cellRows){
    const joined=cells.join(" ");
    if(/Team effort AVG/i.test(joined)){
      const m=joined.match(/(-?\d+(?:[.,]\d+)?)\s*%/);
      if(m){const v=num(m[1]);if(v!=null)teamEffort=v}
    }

    const geVals:number[]=[];
    let lowVal:number|null=null;
    for(const cell of cells){
      const ge=cell.match(/(?:≥|>=|>)\s*(\d+(?:[.,]\d+)?)\s*%/);
      if(ge){const v=num(ge[1]);if(v!=null)geVals.push(v)}
      const lt=cell.match(/<\s*(\d+(?:[.,]\d+)?)\s*%/);
      if(lt){const v=num(lt[1]);if(v!=null)lowVal=v}
    }
    if(geVals.length>=2){
      high=geVals[0];
      mid=geVals[1];
    }else if(geVals.length===1&&lowVal!=null){
      high=geVals[0];
      mid=lowVal;
    }

    const parseHoursRow=(labelRe:RegExp)=>{
      const idx=cells.findIndex(x=>labelRe.test(x));
      if(idx<0)return null;
      const vals:number[]=[];
      // Include any amount in the same cell after the label, then following cells.
      const same=cells[idx].replace(labelRe," ");
      const sameMatches=same.match(/\b\d{1,5}\b/g)||[];
      for(const x of sameMatches){const v=Number(x);if(v>=0&&v<=20000)vals.push(v)}
      for(let j=idx+1;j<cells.length&&vals.length<3;j++){
        const t=cells[j];
        if(/czk|Kč/i.test(t)&&!/\d/.test(t))continue;
        const ms=t.match(/\b\d{1,5}\b/g)||[];
        for(const x of ms){
          const v=Number(x);
          if(v>=0&&v<=20000)vals.push(v);
          if(vals.length>=3)break;
        }
      }
      return vals.length>=3?vals.slice(0,3):null;
    };
    if(!team40&&/40h\s*\/\s*w/i.test(joined))team40=parseHoursRow(/40h\s*\/\s*w/i);
    if(!team30&&/30h\s*\/\s*w/i.test(joined))team30=parseHoursRow(/30h\s*\/\s*w/i);
  }

  const flat=cellRows.map(r=>r.join(" ")).join(" ");
  const flatFold=folded(flat);
  const teamBonusExists=/team\s+bonus/i.test(flat)||/40h\s*\/\s*w/i.test(flat)||/30h\s*\/\s*w/i.test(flat);

  // Fallback when comparator glyphs or cell boundaries were lost.
  if(teamBonusExists&&(high==null||mid==null)){
    const at=flatFold.indexOf("team bonus");
    const seg=at>=0?flat.slice(at,at+1600):flat;
    const ge=[...seg.matchAll(/(?:≥|>=|>)\s*(\d+(?:[.,]\d+)?)\s*%/g)]
      .map(m=>num(m[1])).filter((x:any)=>x!=null) as number[];
    const lt=seg.match(/<\s*(\d+(?:[.,]\d+)?)\s*%/);
    if(ge.length>=2){high=Number(ge[0]);mid=Number(ge[1])}
    else if(ge.length===1&&lt){high=Number(ge[0]);mid=Number(num(lt[1]))}
  }
  const fallbackHours=(label:string)=>{
    const re=new RegExp(label+"\\s*\\/\\s*w([\\s\\S]{0,120})","i");
    const m=flat.match(re);if(!m)return null;
    const vals=(m[1].match(/\b\d{1,5}\b/g)||[]).map(Number).filter(v=>v>=0&&v<=20000);
    return vals.length>=3?vals.slice(0,3):null;
  };
  if(teamBonusExists&&!team40)team40=fallbackHours("40h");
  if(teamBonusExists&&!team30)team30=fallbackHours("30h");
  if(!teamBonusExists){
    high=null;mid=null;team40=null;team30=null;
  }

  const top=Array.isArray(base?.top_bonus_czk)?base.top_bonus_czk.map(Number).filter(Number.isFinite):[];
  const tier=teamEffort!=null&&high!=null&&mid!=null?(teamEffort>=high?0:teamEffort>=mid?1:2):null;
  const selected40=tier!=null&&team40?team40[tier]??null:null;
  const selected30=tier!=null&&team30?team30[tier]??null:null;

  // Canonical full names / aliases.
  const ids=new Map<string,any>();
  const addName=(pid:any,name:any,extra:any={})=>{
    const id=String(pid||""),nm=clean(name);if(!id||!nm)return;
    if(!ids.has(id))ids.set(id,{person_id:id,names:[],...extra});
    const rec=ids.get(id);if(!rec.names.includes(nm))rec.names.push(nm);
    for(const [k,v] of Object.entries(extra||{})){if(rec[k]==null&&v!=null)rec[k]=v}
  };
  for(const kp of knownPeople||[]){
    addName(kp.id,kp.full_name,{display_name:kp.full_name||kp.display_name});
    addName(kp.id,kp.display_name,{display_name:kp.full_name||kp.display_name});
  }
  for(const pp of people||[]){
    const pid=pp.hint_person_id||pp.person_id||null;
    addName(pid,pp.display_name,{display_name:pp.display_name,email:pp.email,picker_login:pp.picker_login});
    addName(pid,pp.picker_login,{display_name:pp.display_name,email:pp.email,picker_login:pp.picker_login});
  }

  const allTeam=new Set<number>([0]);
  for(const arr of [team40||[],team30||[]])for(const v of arr)if(Number.isFinite(Number(v)))allTeam.add(Number(v));
  const possible=new Set<number>([0]);
  for(const t of allTeam)possible.add(t);
  for(const b of top){
    possible.add(Number(b));
    for(const t of allTeam)possible.add(Number(b)+Number(t));
  }

  const geomByPerson=new Map((base?.payouts||[]).filter((x:any)=>x.person_id).map((x:any)=>[String(x.person_id),x]));
  const payouts:any[]=[];

  // Read official payout from the PDF cells: a known person's name and an integer CZK
  // amount in the same cell or immediately following cells. Decimal score cells (e.g.
  // "12,0") are deliberately rejected.
  for(const rec of ids.values()){
    let best:any=null;
    for(const cells of cellRows){
      for(let ci=0;ci<cells.length;ci++){
        const cell=cells[ci],fc=folded(cell);
        for(const name of rec.names){
          const fn=folded(name);if(fn.length<5||!fc.includes(fn))continue;
          const tail=cell.slice(Math.max(0,folded(cell).indexOf(fn)+name.length));
          const candidates:any[]=[];
          const same=integerMoney(tail);if(same!=null)candidates.push({amount:same,distance:0,source:"same_cell"});
          for(let j=ci+1;j<Math.min(cells.length,ci+4);j++){
            const v=integerMoney(cells[j]);
            if(v!=null)candidates.push({amount:v,distance:j-ci,source:"next_cell"});
            // If another known full name starts before an amount, stop walking.
            if([...ids.values()].some((other:any)=>other.person_id!==rec.person_id&&other.names.some((nm:string)=>folded(cells[j]).includes(folded(nm)))))break;
          }
          for(const q of candidates){
            if(!possible.has(Number(q.amount)))continue;
            const score=100-q.distance;
            if(!best||score>best.score)best={...q,score,source_name:name};
          }
        }
      }
    }
    if(!best)continue;

    const amount=Number(best.amount),decomp:any[]=[];
    const selectedTeam=[
      {hours_band:"40h",value:selected40,tier},
      {hours_band:"30h",value:selected30,tier},
      {hours_band:"none",value:0,tier:null}
    ].filter((x:any)=>x.value!=null&&Number.isFinite(Number(x.value)));

    for(let rank=0;rank<Math.min(5,top.length);rank++){
      for(const tb of selectedTeam){
        if(Number(top[rank])+Number(tb.value)===amount){
          decomp.push({top_rank:rank+1,top_bonus_czk:Number(top[rank]),team_bonus_czk:Number(tb.value),hours_band:tb.hours_band,team_tier:tb.tier,rule_match:true});
        }
      }
    }
    for(const tb of selectedTeam){
      if(Number(tb.value)===amount)decomp.push({top_rank:null,top_bonus_czk:0,team_bonus_czk:Number(tb.value),hours_band:tb.hours_band,team_tier:tb.tier,rule_match:true});
    }

    const geom=geomByPerson.get(String(rec.person_id))||null;
    payouts.push({
      person_id:String(rec.person_id),
      email:rec.email||geom?.email||null,
      display_name:rec.display_name||geom?.display_name||best.source_name,
      source_name:best.source_name,
      confirmed_bonus_czk:amount,
      bonus_eligible:geom?.bonus_eligible??null,
      eligibility_source:geom?.eligibility_source||"text_cell_match",
      top_rank:decomp.length===1?decomp[0].top_rank:null,
      payout_decomposition:decomp.length===1?decomp[0]:null,
      payout_decomposition_candidates:decomp,
      payout_rule_match:decomp.length>0,
      payout_match_source:"pdf_cell_name_amount"
    });
  }

  return {
    team_bonus_exists:teamBonusExists,
    team_effort_pct:teamEffort,
    threshold_high:high,threshold_mid:mid,
    team40,team30,tier,selected40,selected30,payouts,
    diagnostics:{
      team_bonus_exists:teamBonusExists,
      row_count:cellRows.length,
      threshold_high:high,threshold_mid:mid,
      team40,team30,
      possible_amounts:[...possible].sort((a,b)=>a-b),
      matched_payouts:payouts.length,
      matched_names:payouts.map((p:any)=>p.display_name),
      known_people_available:ids.size,
      unknown_people_policy:"ignore_not_in_people_table"
    }
  };
}

function mergeRewards(base:any,textParsed:any){
  if(!textParsed)return {...base,reward_parse_source:"layout_only"};
  const teamBonusExists=textParsed.team_bonus_exists!==false;
  const useTextRules=teamBonusExists&&textParsed.threshold_high!=null&&textParsed.threshold_mid!=null&&
    Array.isArray(textParsed.team40)&&textParsed.team40.length>=3&&
    Array.isArray(textParsed.team30)&&textParsed.team30.length>=3;
  const teamEffort=textParsed.team_effort_pct??base.team_effort_pct??null;

  let high:any=null,mid:any=null,team40:any[]=[],team30:any[]=[],tier:any=null,selected40:any=null,selected30:any=null;
  if(teamBonusExists){
    high=useTextRules?textParsed.threshold_high:base?.team_bonus_rules?.thresholds?.high_min_pct??null;
    mid=useTextRules?textParsed.threshold_mid:base?.team_bonus_rules?.thresholds?.mid_min_pct??null;
    team40=useTextRules?textParsed.team40:(base?.team_bonus_rules?.forty_h_czk||[]);
    team30=useTextRules?textParsed.team30:(base?.team_bonus_rules?.thirty_h_czk||[]);
    tier=teamEffort!=null&&high!=null&&mid!=null?(teamEffort>=high?0:teamEffort>=mid?1:2):null;
    selected40=tier!=null&&team40?.length?team40[tier]??null:null;
    selected30=tier!=null&&team30?.length?team30[tier]??null:null;
  }else{
    selected40=0;selected30=0;
  }

  const rules={
    exists:teamBonusExists,
    thresholds:teamBonusExists?{high_min_pct:high,mid_min_pct:mid,low_below_pct:mid}:null,
    columns:teamBonusExists?[
      {key:"high",label:high!=null?`>= ${high}%`:"high",index:0},
      {key:"mid",label:mid!=null?`>= ${mid}%`:"mid",index:1},
      {key:"low",label:mid!=null?`< ${mid}%`:"low",index:2}
    ]:[],
    forty_h_czk:teamBonusExists?(team40||[]):[],
    thirty_h_czk:teamBonusExists?(team30||[]):[],
    selected_tier:teamBonusExists?(tier==null?null:["high","mid","low"][tier]):null,
    selected_40h_czk:selected40,
    selected_30h_czk:selected30,
    team_effort_pct:teamEffort
  };

  const payoutMap=new Map<string,any>();
  let historicalRankingPayouts:any[]=[];
  let ignoredHistoricalTopNames:any[]=[];

  if(!teamBonusExists&&Array.isArray(base?.ranking_top5)&&Array.isArray(base?.top_bonus_czk)){
    // Jan-Mar historical format: TOP 1-5 ranking IS the monetary payout.
    // Unknown/former workers are intentionally ignored, but still keep their rank slot.
    for(const row of base.ranking_top5.slice(0,5)){
      const rank=Number(row.rank||0);
      const amount=Number(base.top_bonus_czk[rank-1]||0);
      if(!rank||!Number.isFinite(amount))continue;
      if(!row.person_id){
        ignoredHistoricalTopNames.push({rank,source_name:row.source_name,total_points:row.total_points});
        continue;
      }
      const p={
        person_id:String(row.person_id),
        email:null,
        display_name:row.source_name,
        source_name:row.source_name,
        confirmed_bonus_czk:amount,
        bonus_eligible:true,
        eligibility_source:"historical_top5_ranking",
        top_rank:rank,
        payout_decomposition:{
          top_rank:rank,
          top_bonus_czk:amount,
          team_bonus_czk:0,
          hours_band:"not_applicable",
          team_tier:null,
          rule_match:true
        },
        payout_decomposition_candidates:[],
        payout_rule_match:true,
        payout_match_source:"historical_top5_ranking"
      };
      historicalRankingPayouts.push(p);
      payoutMap.set(String(row.person_id),p);
    }
  }else{
    for(const p of base?.payouts||[])if(p.person_id)payoutMap.set(String(p.person_id),p);
    for(const p of textParsed.payouts||[])if(p.person_id)payoutMap.set(String(p.person_id),p);
  }

  return {
    ...base,
    team_bonus_exists:teamBonusExists,
    team_effort_pct:teamEffort,
    team_bonus_40h:selected40,
    team_bonus_30h:selected30,
    team_bonus_rules:rules,
    payouts:[...payoutMap.values()],
    ineligible_people:[...payoutMap.values()].filter((x:any)=>x.bonus_eligible===false).map((x:any)=>x.display_name),
    payout_match_count:payoutMap.size,
    historical_ranking_payouts:historicalRankingPayouts,
    ignored_historical_top_names:ignoredHistoricalTopNames,
    reward_parse_source:!teamBonusExists?"historical_top5_ranking":useTextRules?"layout+text":"layout_text_payout_fallback",
    reward_text_diagnostics:{
      ...(textParsed.diagnostics||{}),
      ranking_top5:base?.ranking_top5||[],
      historical_ranking_matches:historicalRankingPayouts.length,
      ignored_historical_top_names:ignoredHistoricalTopNames
    }
  };
}

function monthDistance(a:any,b:any){
  const pa=String(a||"").slice(0,7).split("-").map(Number),pb=String(b||"").slice(0,7).split("-").map(Number);
  if(pa.length<2||pb.length<2||!pa[0]||!pb[0])return 9999;
  return Math.abs((pa[0]*12+pa[1])-(pb[0]*12+pb[1]));
}

async function applyFormulaPayoutFallback(db:any,rewards:any,knownPeople:any[],period:any){
  const teamExists=rewards?.team_bonus_exists!==false;
  if(!teamExists)return rewards;

  // If the PDF has a real person->amount payout table, keep it. April-style cards do
  // not have that table; the old parser used to false-match numbers from Team Bonus.
  const textMatches=Number(rewards?.reward_text_diagnostics?.matched_payouts||0);
  if(textMatches>=3)return rewards;

  const rows=(rewards?.result_rows||[]).filter((x:any)=>x.person_id);
  if(!rows.length)return rewards;

  const kpById=new Map((knownPeople||[]).map((p:any)=>[String(p.id),p]));
  const activeRows=rows.filter((x:any)=>{
    const kp=kpById.get(String(x.person_id));
    return kp&&kp.active===true;
  });
  if(!activeRows.length)return rewards;

  const ids=[...new Set(activeRows.map((x:any)=>String(x.person_id)))];
  const {data:history,error:he}=await db.from("bonus_ledger")
    .select("person_id,bonus_month,status,metadata")
    .in("person_id",ids)
    .in("status",["confirmed","paid"])
    .eq("source_type","store_card_monthly");
  if(he)throw new Error("Bonus band history lookup failed: "+he.message);

  const bandByPerson=new Map<string,{band:string,month:string,distance:number}>();
  for(const h of history||[]){
    const band=h?.metadata?.payout_decomposition?.hours_band;
    if(band!=="30h"&&band!=="40h")continue;
    const dist=monthDistance(h.bonus_month,period?.period_start);
    const key=String(h.person_id);
    const old=bandByPerson.get(key);
    if(!old||dist<old.distance||(dist===old.distance&&String(h.bonus_month)<old.month)){
      bandByPerson.set(key,{band,month:String(h.bonus_month),distance:dist});
    }
  }

  const rankByPerson=new Map((rewards?.ranking_top5||[])
    .filter((x:any)=>x.person_id)
    .map((x:any)=>[String(x.person_id),Number(x.rank)]));
  const top=Array.isArray(rewards?.top_bonus_czk)?rewards.top_bonus_czk.map(Number):[];
  const rules=rewards?.team_bonus_rules||{};
  const selected40=Number(rules.selected_40h_czk??rewards?.team_bonus_40h);
  const selected30=Number(rules.selected_30h_czk??rewards?.team_bonus_30h);
  const selectedTier=rules.selected_tier??null;

  const payouts:any[]=[];
  for(const row of activeRows){
    const pid=String(row.person_id),kp=kpById.get(pid)||{};
    const rank=rankByPerson.get(pid)||null;
    const topAmount=rank?Number(top[rank-1]||0):0;

    let band:string="none",teamAmount=0,eligible=false,bandSource="none";
    if(!row.ineligible&&kp.team_effort_eligible!==false&&String(kp.employment_type||"").toUpperCase()==="HPP"){
      const hist=bandByPerson.get(pid);
      if(hist){
        band=hist.band;bandSource="nearest_confirmed_store_card_"+hist.month;
      }else{
        // Safe fallback for HPP when no historical decomposition exists.
        band="40h";bandSource="hpp_default_40h";
      }
      teamAmount=band==="30h"?(Number.isFinite(selected30)?selected30:0):(Number.isFinite(selected40)?selected40:0);
      eligible=true;
    }

    const amount=topAmount+teamAmount;
    payouts.push({
      person_id:pid,
      email:null,
      display_name:kp.full_name||kp.display_name||row.source_name,
      source_name:row.source_name,
      confirmed_bonus_czk:amount,
      bonus_eligible:eligible,
      eligibility_source:row.ineligible?"official_store_card_red_cell":eligible?"computed_store_card_formula":"not_team_bonus_eligible",
      top_rank:rank,
      payout_decomposition:{
        top_rank:rank,
        top_bonus_czk:topAmount,
        team_bonus_czk:teamAmount,
        hours_band:band,
        team_tier:selectedTier,
        rule_match:true,
        hours_band_source:bandSource
      },
      payout_decomposition_candidates:[],
      payout_rule_match:true,
      payout_match_source:"store_card_formula_fallback"
    });
  }

  return {
    ...rewards,
    payouts,
    payout_match_count:payouts.length,
    computed_formula_fallback:true,
    reward_parse_source:"ranking+team_formula",
    reward_text_diagnostics:{
      ...(rewards.reward_text_diagnostics||{}),
      formula_fallback:true,
      formula_people:payouts.length,
      formula_names:payouts.map((p:any)=>p.display_name),
      ignored_inactive_people:rows.filter((x:any)=>kpById.get(String(x.person_id))?.active!==true).map((x:any)=>x.source_name)
    }
  };
}

function parseMaxima(layout:any[]){
  const page=layout.find((p:any)=>(p.items||[]).some((i:any)=>String(i.text).trim()==="AO-AS"));
  if(!page)return null;
  const rows=groupRows(page,1.2);
  for(const r of rows){
    const vals=r.items.filter((i:any)=>center(i)>=580&&center(i)<745).map((i:any)=>n(i.text)).filter((x:any)=>x!=null);
    if(vals.length>=6)return {outbound:vals[0],quality:vals[1],speed:vals[2],inbound_stock:vals[3],people:vals[4],total:vals[5]};
  }
  return null;
}

function parseStoreMetrics(layout:any[]){
  const page=layout.find((p:any)=>{
    const t=(p.items||[]).map((x:any)=>x.text).join(" ");
    return /Outercase scan/i.test(t)&&/TOTAL score/i.test(t)&&/Task completion/i.test(t);
  });
  if(!page)return [];
  const rows=groupRows(page,1.5),out:any[]=[];
  for(const r of rows){
    const left=txt(r,60,160);
    if(!/Wolt\s+Market/i.test(left))continue;
    const cv=canonicalVenue(left);

    // Outercase + POFR are sometimes one PDF text item; split numerics from the x=300–370 band.
    const op=(txt(r,300,370).match(/-?\d+(?:[.,]\d+)?%?/g)||[]).map(n).filter((x:any)=>x!=null);
    const outbound=val(r,155,295);
    const weighted=val(r,370,440);

    out.push({
      ...cv,
      outbound_seconds_per_unit:outbound,
      outercase_scan_ratio:op[0]??null,
      pofr:op[1]??null,
      weighted_availability:weighted,
      uph:val(r,440,490),
      missing_items_ratio:val(r,500,545),
      undelivered_items_ratio:val(r,575,625),
      task_completion_ratio:val(r,650,700),
      total_score:val(r,700,735)
    });
  }
  return out;
}

const personMetricDefs:any[]=[
 ["store_card_orders_picked","Store Card Orders Picked","count","store_card",false],
 ["store_card_total_units_picked","Store Card Total Units Picked","count","store_card",false],
 ["store_card_missing_items_ratio","Store Card Missing Items %","percent","store_card",true],
 ["store_card_undelivered_items_ratio","Store Card Undelivered Items %","percent","store_card",true],
 ["store_card_scan_to_pick_ratio","Store Card Scan to Pick %","percent","store_card",false],
 ["store_card_bad_goods_rating_ratio","Store Card Bad Goods Rating Ratio","percent","store_card",true],
 ["store_card_avg_goods_rating","Store Card Avg Goods Rating","number","store_card",false],
 ["store_card_venue_related_cs_tickets_ratio","Store Card Venue Related CS Tickets Ratio","percent","store_card",true],
 ["store_card_average_accepted_time","Store Card Average Accepted Time","number","store_card",true],
 ["store_card_average_collection_time","Store Card Average Collection Time","number","store_card",true],
 ["store_card_average_start_collection_time","Store Card Average Start Collection Time","number","store_card",true],
 ["store_card_inbound_total_units","Store Card Inbound Total Units","count","store_card",false],
 ["store_card_inbound_icy_units","Store Card ICY Inbound Units","count","store_card",false],
 ["store_card_inbound_freeze_units","Store Card FREEZE Inbound Units","count","store_card",false],
 ["store_card_stock_count","Store Card Stock Count","count","store_card",false],
 ["store_card_team_rating","Store Card Team Rating","number","store_card",false],
 ["store_card_score_outbound","Store Card Score — Outbound","points","store_card",false],
 ["store_card_score_quality","Store Card Score — Quality KPIs","points","store_card",false],
 ["store_card_score_speed","Store Card Score — Speed KPIs","points","store_card",false],
 ["store_card_score_inbound_stock","Store Card Score — IB + SC","points","store_card",false],
 ["store_card_score_people","Store Card Score — People","points","store_card",false],
 ["store_card_total_points","Store Card Total Points","points","store_card",false]
];

const storeDefs:any[]=[
 ["store_outbound_seconds_per_unit","Outbound seconds per unit","seconds","store",true],
 ["store_outercase_scan_ratio","Outercase scan","percent","store",false],
 ["store_pofr","POFR","percent","store",false],
 ["store_weighted_availability","Weighted Availability","percent","store",false],
 ["store_uph","UPH","number","store",false],
 ["store_missing_items_ratio","Missing items %","percent","store",true],
 ["store_undelivered_items_ratio","Undelivered items %","percent","store",true],
 ["store_task_completion_ratio","Task completion %","percent","store",false],
 ["store_total_score","TOTAL score","number","store",false]
];

const personFields:any={
 store_card_orders_picked:"orders_picked",
 store_card_total_units_picked:"total_units_picked",
 store_card_missing_items_ratio:"missing_items_ratio",
 store_card_undelivered_items_ratio:"undelivered_items_ratio",
 store_card_scan_to_pick_ratio:"scan_to_pick_ratio",
 store_card_bad_goods_rating_ratio:"bad_goods_rating_ratio",
 store_card_avg_goods_rating:"avg_goods_rating",
 store_card_venue_related_cs_tickets_ratio:"venue_related_cs_tickets_ratio",
 store_card_average_accepted_time:"average_accepted_time",
 store_card_average_collection_time:"average_collection_time",
 store_card_average_start_collection_time:"average_start_collection_time",
 store_card_inbound_total_units:"inbound_total_units",
 store_card_inbound_icy_units:"inbound_icy_units",
 store_card_inbound_freeze_units:"inbound_freeze_units",
 store_card_stock_count:"stock_count",
 store_card_team_rating:"team_rating",
 store_card_score_outbound:"score_outbound",
 store_card_score_quality:"score_quality",
 store_card_score_speed:"score_speed",
 store_card_score_inbound_stock:"score_inbound_stock",
 store_card_score_people:"score_people",
 store_card_total_points:"total_points"
};

const storeFields:any={
 store_outbound_seconds_per_unit:"outbound_seconds_per_unit",
 store_outercase_scan_ratio:"outercase_scan_ratio",
 store_pofr:"pofr",
 store_weighted_availability:"weighted_availability",
 store_uph:"uph",
 store_missing_items_ratio:"missing_items_ratio",
 store_undelivered_items_ratio:"undelivered_items_ratio",
 store_task_completion_ratio:"task_completion_ratio",
 store_total_score:"total_score"
};

const normAlias=(s:any)=>String(s||"").trim().toLowerCase();
const slug=(s:any)=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");

async function resolvePeople(db:any,people:any[]){
 const emails=[...new Set(people.map((p:any)=>normAlias(p.email)).filter(Boolean))];
 const pickers=[...new Set(people.map((p:any)=>normAlias(p.picker_login)).filter(Boolean))];
 const names=[...new Set(people.map((p:any)=>normAlias(p.display_name)).filter(Boolean))];

 const [{data:ea,error:ee},{data:pa,error:pe},{data:peopleRows,error:pde}]=await Promise.all([
  emails.length?db.from("person_aliases").select("person_id,alias_type,alias_value,normalized_value").eq("alias_type","email").in("normalized_value",emails):Promise.resolve({data:[],error:null}),
  pickers.length?db.from("person_aliases").select("person_id,alias_type,alias_value,normalized_value").eq("alias_type","picker_username").in("normalized_value",pickers):Promise.resolve({data:[],error:null}),
  db.from("people").select("id,display_name,full_name,active,employment_type,team_effort_eligible")
 ]);
 if(ee)throw new Error("Email alias lookup failed: "+ee.message);
 if(pe)throw new Error("Picker alias lookup failed: "+pe.message);
 if(pde)throw new Error("People lookup failed: "+pde.message);

 const em=new Map((ea||[]).map((x:any)=>[normAlias(x.normalized_value||x.alias_value),x.person_id]));
 const pm=new Map((pa||[]).map((x:any)=>[normAlias(x.normalized_value||x.alias_value),x.person_id]));
 const nameMap=new Map<string,string|null>();
 for(const p of peopleRows||[]){
   for(const v of [p.display_name,p.full_name]){
     const k=normAlias(v);if(!k)continue;
     if(!nameMap.has(k))nameMap.set(k,p.id);
     else if(nameMap.get(k)!==p.id)nameMap.set(k,null);
   }
 }

 return people.map((p:any)=>{
  const ep=em.get(normAlias(p.email))||null;
  const pp=pm.get(normAlias(p.picker_login))||null;
  const np=nameMap.get(normAlias(p.display_name))||null;
  const hp=p.hint_person_id||null;
  const ids=[ep,pp,np,hp].filter(Boolean);
  const unique=[...new Set(ids)];
  const conflict=unique.length>1;
  const resolved=conflict?null:(unique[0]||null);
  return {...p,person_id:resolved,identity_conflict:conflict,email_person_id:ep,picker_person_id:pp,name_person_id:np,hint_person_id:hp,
    identity_state:conflict?"conflict":resolved?"matched":"new_historical"};
 });
}

async function ensureHistoricalPeople(db:any,resolved:any[]){
 for(const p of resolved.filter((x:any)=>x.identity_state==="new_historical")){
  const base="historical-"+slug(String(p.email||p.picker_login||p.display_name||"person").replace("@","-"));
  let key=base||("historical-"+crypto.randomUUID());
  const {data:existing}=await db.from("people").select("id").eq("person_key",key).maybeSingle();
  if(existing?.id)key=key+"-"+crypto.randomUUID().slice(0,8);

  const {data:created,error:ce}=await db.from("people").insert({
   person_key:key,
   display_name:p.display_name||p.picker_login||p.email,
   full_name:p.display_name||null,
   active:false,
   mapping_confidence:"confirmed"
  }).select("id").single();
  if(ce)throw new Error("Historical person create failed for "+(p.email||p.picker_login||p.display_name||"unknown")+": "+ce.message);
  p.person_id=created.id;
  p.identity_state="created_historical";
 }

 const aliasRows:any[]=[];
 for(const p of resolved){
  if(!p.person_id)continue;
  if(p.email)aliasRows.push({person_id:p.person_id,alias_type:"email",alias_value:p.email,source:"store_card_monthly",confirmed:true});
  if(p.picker_login)aliasRows.push({person_id:p.person_id,alias_type:"picker_username",alias_value:p.picker_login,source:"store_card_monthly",confirmed:true});
 }
 for(const a of aliasRows){
  const {data:existing}=await db.from("person_aliases").select("id,person_id")
    .eq("alias_type",a.alias_type).eq("normalized_value",normAlias(a.alias_value)).maybeSingle();
  if(existing?.id){
   if(existing.person_id!==a.person_id)throw new Error("Alias conflict for "+a.alias_value);
   continue;
  }
  const {error:ae}=await db.from("person_aliases").insert(a);
  if(ae)throw new Error("Alias insert failed for "+a.alias_value+": "+ae.message);
 }
}

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("authorization")||"";
  if(!auth)return J({error:"Unauthorized"},401);

  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await uc.auth.getUser();
  if(!user)return J({error:"Unauthorized"},401);

  const db=createClient(url,service);
  const {data:admin}=await db.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(!admin)return J({error:"Forbidden"},403);

  const b=await req.json(),layout=b.layout_json||[],filename=b.filename||"",mode=b.mode||"preview",import_id=b.import_id,extractedText=String(b.extracted_text||"");
  if(!import_id)return J({error:"import_id is required"},400);
  if(!Array.isArray(layout)||!layout.length)return J({error:"layout_json is required"},400);

  const {data:imp,error:ie}=await db.from("imports").select("*").eq("id",import_id).single();
  if(ie||!imp)return J({error:"Import not found",detail:ie?.message},404);

  const period=inferMonth(filename||imp.filename||"",layout);
  if(!period)return J({error:"Could not infer Store Card month/year",diagnostics:{filename:filename||imp.filename||"",pages:layout.length}},422);

  const [{data:pickerHints,error:phErr},{data:knownPeople,error:kpErr}]=await Promise.all([
    db.from("person_aliases").select("person_id,alias_value").eq("alias_type","picker_username").eq("confirmed",true),
    db.from("people").select("id,display_name,full_name")
  ]);
  if(phErr)return J({error:"Picker hint lookup failed",detail:phErr.message},500);
  if(kpErr)return J({error:"People hint lookup failed",detail:kpErr.message},500);
  const displayById=new Map((knownPeople||[]).map((x:any)=>[x.id,x.display_name||x.full_name||null]));
  const identityHints=[
    ...(pickerHints||[]).map((x:any)=>({...x,display_name:displayById.get(x.person_id)||null})),
    ...(knownPeople||[]).flatMap((x:any)=>[
      x.display_name?{person_id:x.id,alias_value:x.display_name,display_name:x.display_name}:null,
      x.full_name?{person_id:x.id,alias_value:x.full_name,display_name:x.display_name}:null
    ].filter(Boolean))
  ];

  const people=parsePeople(layout,identityHints);
  if(!people.length){
    const diagnosticPages=(layout||[]).map((p:any)=>({
      page:p.page,
      item_count:(p.items||[]).length,
      sample:(p.items||[]).slice(0,220).map((x:any)=>x.text).join(" | ").slice(0,9000)
    }));
    await db.from("imports").update({
      metadata:{...(imp.metadata||{}),store_card_parse_debug:{parser:"v9",period_start:period.period_start,pages:diagnosticPages}}
    }).eq("id",import_id);
    return J({error:"No Store Card people rows parsed",diagnostics:{parser:"v9",pages:layout.length,period_start:period.period_start,period_end:period.period_end,page_samples:diagnosticPages}},422);
  }

  const rewardsLayout=parseRewards(layout,people,period,knownPeople||[]);
  const rewardsText=parseRewardsText(extractedText,people,knownPeople||[],rewardsLayout);
  let rewards=mergeRewards(rewardsLayout,rewardsText);
  const maxima=parseMaxima(layout);
  const stores=parseStoreMetrics(layout);

  const resolved=await resolvePeople(db,people);
  rewards=await applyFormulaPayoutFallback(db,rewards,knownPeople||[],period);
  const conflicts=resolved.filter((x:any)=>x.identity_conflict).map((x:any)=>({email:x.email,picker_login:x.picker_login,display_name:x.display_name}));
  const matched=resolved.filter((x:any)=>x.identity_state==="matched").length;
  const newHistorical=resolved.filter((x:any)=>x.identity_state==="new_historical").map((x:any)=>({email:x.email,picker_login:x.picker_login,display_name:x.display_name}));

  const common={
   ok:true,
   period_start:period.period_start,
   period_end:period.period_end,
   people_count:people.length,
   matched_count:matched,
   new_historical_count:newHistorical.length,
   new_historical_people:newHistorical,
   identity_conflicts:conflicts,
   store_count:stores.length,
   maxima,
   monthly_threshold_points:rewards.monthly_threshold_points,
   team_effort_pct:rewards.team_effort_pct,
   top_bonus_czk:rewards.top_bonus_czk,
   team_bonus_40h_czk:rewards.team_bonus_40h,
   team_bonus_30h_czk:rewards.team_bonus_30h,
   team_bonus_exists:rewards.team_bonus_exists!==false,
   bonus_rules:{
    top_bonus_czk:rewards.top_bonus_czk||[],
    team_bonus:rewards.team_bonus_rules||null
   },
   confirmed_bonus_total_czk:(rewards.payouts||[]).reduce((a:number,x:any)=>a+(x.confirmed_bonus_czk||0),0),
   bonus_color_eligibility_detected:rewards.color_eligibility_detected===true,
   bonus_ineligible_people:rewards.ineligible_people||[],
   payouts:rewards.payouts,
   reward_parse_source:rewards.reward_parse_source||"layout_only",
   reward_text_diagnostics:rewards.reward_text_diagnostics||null,
   unknown_people_ignored:true,
   historical_top_only:rewards.team_bonus_exists===false,
   historical_ranking_payouts:rewards.historical_ranking_payouts||[],
   ignored_historical_top_names:rewards.ignored_historical_top_names||[],
   people:resolved,
   store_metrics:stores
  };

  if(mode==="preview"){
   return J({...common,preview:true,parser_stage:"store-card-monthly-layout-v20",
    note:"Preview only. Existing identities are resolved by email/picker login. New historical people are shown before commit."});
  }

  if(mode!=="commit")return J({error:"Unsupported mode"},400);
  if(conflicts.length)return J({error:"Identity conflicts block commit",identity_conflicts:conflicts},409);

  // Verify the additive Store Card schema exists before making any writes.
  const {error:schemaErr}=await db.from("store_card_months").select("month").limit(1);
  if(schemaErr)return J({error:"Store Card schema missing",detail:schemaErr.message},409);

  await ensureHistoricalPeople(db,resolved);

  // Metric definitions are source-specific so official month-end figures never overwrite weekly semantics.
  const defs=personMetricDefs.map(d=>({
   metric_id:d[0],label:d[1],unit:d[2],category:d[3],lower_is_better:d[4],default_granularity:"month"
  }));
  const {error:mde}=await db.from("metric_definitions").upsert(defs,{onConflict:"metric_id"});
  if(mde)return J({error:"Metric definitions write failed",detail:mde.message},500);

  const obs:any[]=[];
  for(const p of resolved){
   if(!p.person_id)continue;
   for(const d of personMetricDefs){
    const metric_id=d[0],field=personFields[metric_id],value=p[field];
    if(value===null||value===undefined)continue;
    obs.push({
     person_id:p.person_id,
     metric_id,
     value,
     period_start:period.period_start,
     period_end:period.period_end,
     granularity:"month",
     source_type:"store_card_monthly",
     import_id,
     source_record_key:`mo|store_card_monthly|${p.person_id}|${metric_id}|${period.period_start}|${period.period_end}|month`,
     metadata:{source_email:p.email,picker_login:p.picker_login,display_name:p.display_name,official:true}
    });
   }
  }
  let obsWritten=0;
  if(obs.length){
   const {data:w,error:oe}=await db.from("metric_observations").upsert(obs,{onConflict:"source_record_key"}).select("id");
   if(oe)return J({error:"Monthly observations write failed",detail:oe.message},500);
   obsWritten=w?.length??0;
  }

  const {error:sde}=await db.from("metric_definitions").upsert(storeDefs.map(d=>({
   metric_id:d[0],label:d[1],unit:d[2],category:d[3],lower_is_better:d[4],default_granularity:"month"
  })),{onConflict:"metric_id"});
  if(sde)return J({error:"Store metric definitions write failed",detail:sde.message},500);

  const storeRows:any[]=[];
  for(const s of stores){
   const baseKey=`store_card:${period.period_start}:${s.venue_key}`;
   for(const d of storeDefs){
    const metric_id=d[0],field=storeFields[metric_id];
    storeRows.push({
     venue_key:s.venue_key,
     metric_id,
     value:s[field]??null,
     text_value:null,
     period_start:period.period_start,
     period_end:period.period_end,
     granularity:"month",
     import_id,
     source_record_key:baseKey,
     metadata:{venue_name:s.venue,source_type:"store_card_monthly",official:true}
    });
   }
  }
  let storeWritten=0;
  if(storeRows.length){
   const {data:sw,error:swe}=await db.from("store_metrics").upsert(storeRows,{onConflict:"venue_key,metric_id,period_start,period_end,granularity"}).select("id");
   if(swe)return J({error:"Store metrics write failed",detail:swe.message},500);
   storeWritten=sw?.length??0;
  }

  const monthRow={
   month:period.period_start,
   venue_key:"wolt_market_holesovice",
   threshold_points:rewards.monthly_threshold_points,
   max_points:maxima?.total??null,
   team_effort_percent:rewards.team_effort_pct,
   top_bonus_czk:rewards.top_bonus_czk||[],
   team_bonus_40h_czk:rewards.team_bonus_40h,
   team_bonus_30h_czk:rewards.team_bonus_30h,
   source_import_id:import_id,
   status:"official",
   metadata:{maxima:maxima||null,parser_version:"store-card-monthly-v20",filename:imp.filename,bonus_rules:{top_bonus_czk:rewards.top_bonus_czk||[],team_bonus:rewards.team_bonus_rules||null}},
   updated_at:new Date().toISOString()
  };
  const {error:sce}=await db.from("store_card_months").upsert(monthRow,{onConflict:"month"});
  if(sce)return J({error:"Store Card month write failed",detail:sce.message},500);

  const payoutByPerson=new Map((rewards.payouts||[]).filter((x:any)=>x.person_id).map((x:any)=>[String(x.person_id),x]));
  const payoutByEmail=new Map((rewards.payouts||[]).filter((x:any)=>x.email).map((x:any)=>[normAlias(x.email),x]));
  const historicalTopOnly=rewards.team_bonus_exists===false;
  const bonusRows=resolved.filter((p:any)=>p.person_id).map((p:any)=>{
   const payout:any=payoutByPerson.get(String(p.person_id))||payoutByEmail.get(normAlias(p.email))||null;
   const inferredZero=historicalTopOnly&&!payout;
   return {
   person_id:p.person_id,
   bonus_month:period.period_start,
   amount:Number(payout?.confirmed_bonus_czk??0),
   currency:"CZK",
   status:(payout||inferredZero)?"confirmed":"pending_unparsed",
   source_type:"store_card_monthly",
   import_id,
   source_record_key:`store_card_bonus:${period.period_start}:${normAlias(p.email||p.picker_login||p.person_id)}`,
   metadata:{
    source_email:p.email,
    picker_login:p.picker_login,
    display_name:p.display_name,
    total_points:p.total_points,
    team_effort_percent:rewards.team_effort_pct,
    official_payout_czk:payout?Number(payout.confirmed_bonus_czk):(inferredZero?0:null),
    bonus_eligible:payout?.bonus_eligible??(inferredZero?true:null),
    eligibility_source:payout?.eligibility_source??(inferredZero?"historical_top_only_no_payout_row":"unknown"),
    payout_decomposition:payout?.payout_decomposition??null,
    payout_decomposition_candidates:payout?.payout_decomposition_candidates??[],
    bonus_rules_snapshot:{top_bonus_czk:rewards.top_bonus_czk||[],team_bonus:rewards.team_bonus_rules||null},
    historical_top_only_inferred_zero:inferredZero,
    unknown_people_ignored:true,
    official:true
   },
   updated_at:new Date().toISOString()
  }});
  let bonusWritten=0;
  if(bonusRows.length){
   const {data:bw,error:be}=await db.from("bonus_ledger").upsert(bonusRows,{onConflict:"source_record_key"}).select("id");
   if(be)return J({error:"Bonus ledger write failed",detail:be.message},500);
   bonusWritten=bw?.length??0;
  }

  const previousPeriodStart=imp.period_start||null;
  const reparsedPeriod=previousPeriodStart&&previousPeriodStart!==period.period_start;
  let staleCleanup:any={metric_observations:0,store_metrics:0,bonus_ledger:0,store_card_months:0};
  if(reparsedPeriod){
   const {data:oldObs,error:oldObsErr}=await db.from("metric_observations")
     .delete().eq("import_id",import_id).eq("source_type","store_card_monthly")
     .neq("period_start",period.period_start).select("id");
   if(oldObsErr)return J({error:"Stale Store Card observation cleanup failed",detail:oldObsErr.message},500);
   staleCleanup.metric_observations=oldObs?.length??0;

   const {data:oldStore,error:oldStoreErr}=await db.from("store_metrics")
     .delete().eq("import_id",import_id).neq("period_start",period.period_start).select("id");
   if(oldStoreErr)return J({error:"Stale Store Card store-metric cleanup failed",detail:oldStoreErr.message},500);
   staleCleanup.store_metrics=oldStore?.length??0;

   const {data:oldBonus,error:oldBonusErr}=await db.from("bonus_ledger")
     .delete().eq("import_id",import_id).neq("bonus_month",period.period_start).select("id");
   if(oldBonusErr)return J({error:"Stale Store Card bonus cleanup failed",detail:oldBonusErr.message},500);
   staleCleanup.bonus_ledger=oldBonus?.length??0;

   const {data:oldMonth,error:oldMonthErr}=await db.from("store_card_months")
     .delete().eq("source_import_id",import_id).neq("month",period.period_start).select("month");
   if(oldMonthErr)return J({error:"Stale Store Card month cleanup failed",detail:oldMonthErr.message},500);
   staleCleanup.store_card_months=oldMonth?.length??0;
  }

  const totalRecords=obs.length+storeRows.length+bonusRows.length+1;
  const {error:ue}=await db.from("imports").update({
   report_type:"store_card_monthly",
   status:"imported",
   period_start:period.period_start,
   period_end:period.period_end,
   parser_version:"store-card-monthly-v20",
   record_count:totalRecords,
   metadata:{
    ...(imp.metadata||{}),
    month_end:true,
    reconciliation_month:period.period_start.slice(0,7),
    store_card_monthly:true,
    confirmed_bonus_total_czk:common.confirmed_bonus_total_czk,
    matched_people:matched,
    historical_people_created:newHistorical.length
   }
  }).eq("id",import_id);
  if(ue)return J({error:"Import status update failed",detail:ue.message},500);

  return J({
   ...common,
   preview:false,
   committed:true,
   parser_stage:"store-card-monthly-committed-v20",
   observations_attempted:obs.length,
   observations_inserted:obsWritten,
   store_metrics_attempted:storeRows.length,
   store_metrics_inserted:storeWritten,
   bonus_rows_attempted:bonusRows.length,
   bonus_rows_written:bonusWritten,
   historical_people_created:newHistorical.length,
   total_records:totalRecords,
   reparsed_from_period:reparsedPeriod?previousPeriodStart:null,
   stale_cleanup:staleCleanup
  });
 }catch(e){
  return J({error:String((e as any)?.message||e)},500);
 }
});