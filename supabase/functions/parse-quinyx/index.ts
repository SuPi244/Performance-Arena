import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"content-type":"application/json"}});
const norm=(s:string)=>String(s||"").normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim();
const roster=[
 ["Jakub Vostradovský","jakub-v"],["Nataliia Hadiatska","nataliia-ha"],["Ondřej Chovanec","ondra"],
 ["Stanislav Masis","stanislav-m"],["Tereza Chýlová","tereza-ch"],["Stanislav Ganea","stanislav-g"],["Adam Maršík","adam-ma"],
 ["Martin Potoniec","martin-po"],["Michal Gajdoš","michal-g"],["Tomáš Palán","tomas-p"],["Filip Sochor","filip-s"],
 ["Pavel Kyselka","pavel-k"],["Daniel Sláma","daniel-s"],["Amir Uteshev","amir-u"]
];
const boundaryNames=[
 "Nick Schürrer","Miroslava Jaworská","Daniel Pešek","Proplusko Marketa","Adéla Růžičková","Alexandr Viola",
 "Danil Externí","Julie Husáková","Kateřina Bocková","Klára Absolonová","Kryštof Balhar",
 "Ladislav Čermák","Mia Traplová","Natália Rechtoríková","Patrik Dokladal","Sára Bendová",
 "David Doležel","Viktorie Elizabeth Truclová","Daniel Třeček","Kristína Szilvási","Markéta Weinertová","Šimon Císař"
];
const isTime=(s:string)=>/^\d{1,2}:\d{2}$/.test(s);
const MONTHS:any={
 january:1,jan:1,leden:1,ledna:1,
 february:2,feb:2,unor:2,unora:2,
 march:3,mar:3,brezen:3,brezna:3,
 april:4,apr:4,duben:4,dubna:4,
 may:5,kveten:5,kvetna:5,
 june:6,jun:6,cerven:6,cervna:6,
 july:7,jul:7,cervenec:7,cervence:7,
 august:8,aug:8,srpen:8,srpna:8,
 september:9,sep:9,sept:9,zari:9,
 october:10,oct:10,rijen:10,rijna:10,
 november:11,nov:11,listopad:11,listopadu:11,
 december:12,dec:12,prosinec:12,prosince:12
};
function isoDate(y:number,m:number,d:number){return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`}
function isoWeekStart(year:number,week:number){
 const jan4=new Date(Date.UTC(year,0,4)),dow=jan4.getUTCDay()||7;
 jan4.setUTCDate(jan4.getUTCDate()-(dow-1)+(week-1)*7);
 return jan4.toISOString().slice(0,10);
}
function headerLines(items:any[]){
 const sorted=[...(items||[])].filter((x:any)=>String(x.text||"").trim()).sort((a:any,b:any)=>b.y-a.y||a.x-b.x);
 const rows:any[]=[];
 for(const it of sorted){
  let r=rows.find((x:any)=>Math.abs(x.y-it.y)<1.8);
  if(!r){r={y:it.y,items:[]};rows.push(r)}
  r.items.push(it);
 }
 return rows.sort((a:any,b:any)=>b.y-a.y).map((r:any)=>r.items.sort((a:any,b:any)=>a.x-b.x).map((x:any)=>String(x.text||"").trim()).join(" ").replace(/\s+/g," ").trim()).filter(Boolean);
}
function parseNamedRange(raw:string){
 const s=norm(raw),names=Object.keys(MONTHS).sort((a,b)=>b.length-a.length).join("|");
 let m=s.match(new RegExp(`\\b(\\d{1,2})\\s+(${names})\\s+(20\\d{2})\\s+(?:to\\s+)?(\\d{1,2})\\s+(${names})(?:\\s+(20\\d{2}))?\\b`,"i"));
 if(!m)return null;
 const sm=MONTHS[m[2]],em=MONTHS[m[5]],sy=Number(m[3]),ey=m[6]?Number(m[6]):(em<sm?sy+1:sy);
 const start=isoDate(sy,sm,Number(m[1])),end=isoDate(ey,em,Number(m[4]));
 return end>=start?{start,end,raw}:null;
}
function parseNumericRange(raw:string){
 const s=String(raw||"").replace(/[–—]/g,"-");
 let m=s.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})\s*-\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})\b/);
 if(m){
  const start=isoDate(Number(m[3]),Number(m[2]),Number(m[1])),end=isoDate(Number(m[6]),Number(m[5]),Number(m[4]));
  return end>=start?{start,end,raw:m[0]}:null;
 }
 m=s.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\s*-\s*(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
 if(m){
  const start=isoDate(Number(m[1]),Number(m[2]),Number(m[3])),end=isoDate(Number(m[4]),Number(m[5]),Number(m[6]));
  return end>=start?{start,end,raw:m[0]}:null;
 }
 return null;
}
function weekFallback(raw:string){
 const s=norm(raw),wm=s.match(/\b(?:w|week)\s*(\d{1,2})\b/),ym=s.match(/\b(20\d{2})\b/);
 if(!wm||!ym)return null;
 const week=Number(wm[1]),year=Number(ym[1]);if(week<1||week>53)return null;
 const start=isoWeekStart(year,week);
 return {start,end:addDays(start,6),raw:`W ${week} / ${year}`};
}
function pagePeriod(items:any[]){
 const lines=headerLines(items);
 const candidates=[...lines,lines.slice(0,12).join(" "),items.map((x:any)=>String(x.text||"")).join(" ")];
 for(const s of candidates){const p=parseNamedRange(s)||parseNumericRange(s);if(p)return {...p,source:"range"}}
 for(const s of candidates){const p=weekFallback(s);if(p)return {...p,source:"iso_week"}}
 return null;
}
function dateDebug(items:any[]){
 const lines=headerLines(items);
 return lines.filter((s:string)=>/20\d{2}|\bW\s*\d{1,2}\b|\bWeek\s*\d{1,2}\b|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Hole|Prague/i.test(s)).slice(0,12);
}
function dateForDay(period:any,day:number){
 if(!period)return null;
 const hits:string[]=[];
 for(let d=period.start;d<=period.end;d=addDays(d,1)){
  if(Number(d.slice(8,10))===Number(day))hits.push(d);
  if(hits.length>1)break;
 }
 return hits.length===1?hits[0]:null;
}
function days(items:any[]){
 const direct=items.filter((x:any)=>/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}$/i.test(String(x.text||"").trim()))
   .map((x:any)=>({day:+String(x.text).match(/(\d{1,2})$/)![1],x:x.x,source:"combined"})).sort((a:any,b:any)=>a.x-b.x);
 if(direct.length)return direct;

 // Older Quinyx PDFs can split "Mon" and "1" into separate text items.
 const out:any[]=[];
 const dayOnly=items.filter((x:any)=>/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i.test(String(x.text||"").trim()));
 for(const d of dayOnly){
   const nums=items.filter((z:any)=>{
     const m=String(z.text||"").trim().match(/^\d{1,2}$/);
     return !!m&&Number(m[0])>=1&&Number(m[0])<=31&&Math.abs(Number(z.y)-Number(d.y))<2.8&&Number(z.x)>=Number(d.x)-4&&Number(z.x)<=Number(d.x)+38;
   }).sort((a:any,b:any)=>Math.abs(Number(a.x)-Number(d.x))-Math.abs(Number(b.x)-Number(d.x)));
   if(nums.length)out.push({day:Number(nums[0].text),x:Number(d.x),source:"split"});
 }
 const uniq=new Map<string,any>();
 for(const x of out)uniq.set(String(x.day)+"|"+Number(x.x).toFixed(1),x);
 return [...uniq.values()].sort((a:any,b:any)=>a.x-b.x);
}
function findNameAnchor(items:any[], name:string){
 const nn=norm(name), parts=nn.split(" "), first=parts[0], last=parts[parts.length-1];
 const candidates=items.filter((a:any)=>a.x<165);
 for(const a of candidates){ const na=norm(a.text); if(na===nn||na.includes(nn)) return a; }
 for(const a of candidates){
   const na=norm(a.text);
   if(!(na===first||na.endsWith(" "+first)||na.includes(first)))continue;
   const nearby=candidates.filter((b:any)=>Math.abs(b.y-a.y)<28).map((b:any)=>norm(b.text)).join(" ");
   if(nearby.includes(first)&&nearby.includes(last))return a;
 }
 return null;
}
function personAnchors(items:any[]){
 const out:any[]=[];
 for(const [name,key] of roster){const hit=findNameAnchor(items,name);if(hit)out.push({name,key,y:hit.y,roster:true});}
 // Non-roster workers must still terminate the previous roster person's vertical band.
 for(const name of boundaryNames){const hit=findNameAnchor(items,name);if(hit)out.push({name,key:null,y:hit.y,roster:false});}
 // Also use obvious contingent/new-worker labels as blockers when present.
 for(const a of items.filter((z:any)=>z.x<165)){
   if(/^(?:C\d\s*)?Contingent Worker|^New GA\b|^Quinix Bot\b/i.test(String(a.text||"")))
     out.push({name:String(a.text),key:null,y:a.y,roster:false});
 }
 const uniq=new Map<string,any>(); for(const x of out)uniq.set(`${x.y.toFixed(1)}|${x.name}`,x);
 return [...uniq.values()].sort((a:any,b:any)=>b.y-a.y);
}
function nearestDay(ds:any[],x:number){return ds.reduce((a:any,b:any)=>Math.abs(b.x-x)<Math.abs(a.x-x)?b:a)}
function colBounds(ds:any[],d:any){
 const i=ds.indexOf(d);
 // Use half of the neighbouring day-column spacing also at the outer edges.
 // The shortened 28–30 Sep block has much wider columns: header Mon 28 is at x≈212.7
 // while its cell content starts around x≈160.7. The old fixed ±42 edge clipped it.
 const left=i ? (ds[i-1].x+d.x)/2
   : d.x-(ds.length>1 ? (ds[1].x-d.x)/2 : 60);
 const right=i<ds.length-1 ? (d.x+ds[i+1].x)/2
   : d.x+(ds.length>1 ? (d.x-ds[i-1].x)/2 : 60);
 return [left,right];
}
function roleCandidates(items:any[],dayAnchors:any[]=[]){
 const out:any[]=[];
 for(const z of items||[]){
   const s=String(z.text||"").replace(/\s+/g," ").trim();
   const m=s.match(/\b(GA|SL)\s+(Morning|Afternoon|Shift\s+Middle)\b/i);
   if(m)out.push({...z,text:`${m[1].toUpperCase()} ${m[2].replace(/\s+/g," ")}`,raw_text:s,synthetic:false});
 }

 // Split text fallback. Older exports often emit GA / Morning / venue as separate
 // PDF text items. Build the phrase per day-column, never across the whole page row.
 const ys:any[]=[];
 for(const z of items||[]){
   let row=ys.find((r:any)=>Math.abs(Number(r.y)-Number(z.y))<1.8);
   if(!row){row={y:Number(z.y),items:[]};ys.push(row)}
   row.items.push(z);
 }
 for(const r of ys){
   const groups:any[]=[];
   if(dayAnchors&&dayAnchors.length){
     for(const d of dayAnchors){
       const cell=r.items.filter((z:any)=>nearestDay(dayAnchors,Number(z.x))===d);
       if(cell.length)groups.push(cell);
     }
   }else groups.push(r.items);

   for(const cell of groups){
     cell.sort((a:any,b:any)=>Number(a.x)-Number(b.x));
     const joined=cell.map((z:any)=>String(z.text||"").trim()).join(" ").replace(/\s+/g," ").trim();
     const m=joined.match(/\b(GA|SL)\s+(Morning|Afternoon|Shift\s+Middle)\b/i);
     if(!m)continue;
     const ga=cell.find((z:any)=>/^(GA|SL)$/i.test(String(z.text||"").trim()))
       ||cell.find((z:any)=>/\b(GA|SL)\b/i.test(String(z.text||"")))
       ||cell[0];
     out.push({
       x:Number(ga.x),y:Number(r.y),
       text:`${m[1].toUpperCase()} ${m[2].replace(/\s+/g," ")}`,
       raw_text:joined,synthetic:true
     });
   }
 }
 const uniq=new Map<string,any>();
 for(const z of out){
   const k=Number(z.x).toFixed(1)+"|"+Number(z.y).toFixed(1)+"|"+String(z.text);
   if(!uniq.has(k))uniq.set(k,z);
 }
 return [...uniq.values()];
}

function pairAtY(items:any[], y:number){
 const ts=items.filter((z:any)=>isTime(z.text)&&Math.abs(z.y-y)<1.1).sort((a:any,b:any)=>a.x-b.x);
 return ts.length>=2?[ts[0].text,ts[ts.length-1].text]:null;
}
function reportCutoff(items:any[]){
 for(const z of items){
   const m=String(z.text||"").match(/^(\d{2})\.(\d{2})\.(\d{2})(?:\s|$)/);
   if(m)return `20${m[3]}-${m[2]}-${m[1]}`;
 }
 return null;
}
function parse(pages:any[]){
 const rows:any[]=[],missingDatePages:number[]=[],pagePeriods:any[]=[],missingDateDebug:any[]=[],inferredDatePages:any[]=[];
 let rosterBandsExamined=0,rolesInsideRosterBands=0,skippedMichleRoles=0,pagesWithUsablePeriod=0;
 const contexts=(pages||[]).map((pg:any)=>{
   const it=pg.items||[],baseDays=days(it),ps=personAnchors(it),cutoff=reportCutoff(it),roles=roleCandidates(it,baseDays);
   return {pg,it,baseDays,ps,roles,cutoff,period:pagePeriod(it)};
 });
 const pageScan=contexts.map((x:any)=>({
   page:Number(x.pg.page),
   items:(x.it||[]).length,
   day_anchors:(x.baseDays||[]).length,
   person_anchors:(x.ps||[]).filter((p:any)=>p.roster).length,
   boundary_anchors:(x.ps||[]).filter((p:any)=>!p.roster).length,
   role_candidates:(x.roles||[]).length,
   period:x.period?{start:x.period.start,end:x.period.end,source:x.period.source||"range"}:null
 }));
 const signature=(ds:any[])=>ds.map((d:any)=>d.day).join(",");
 const periodBySignature=new Map<string,Map<string,any>>();
 for(const x of contexts){
   if(!x.period||!x.baseDays.length)continue;
   const sig=signature(x.baseDays),key=x.period.start+"|"+x.period.end;
   if(!periodBySignature.has(sig))periodBySignature.set(sig,new Map());
   periodBySignature.get(sig)!.set(key,x.period);
 }
 for(const x of contexts){
  const {pg,it,baseDays,ps,cutoff}=x;
  if(!baseDays.length||!ps.length)continue;
  let period=x.period;
  if(!period){
    const opts=periodBySignature.get(signature(baseDays));
    if(opts&&opts.size===1){
      const hit=[...opts.values()][0];
      period={...hit,source:"matched_day_signature",raw:"inferred from matching Quinyx day header"};
      inferredDatePages.push({page:Number(pg.page),period_start:period.start,period_end:period.end,method:"matching_day_signature"});
    }
  }
  if(!period){missingDatePages.push(Number(pg.page));missingDateDebug.push({page:Number(pg.page),header_candidates:dateDebug(it)});continue}
  const ds=baseDays.map((d:any)=>({...d,date:dateForDay(period,d.day)}));
  if(ds.some((d:any)=>!d.date)){missingDatePages.push(Number(pg.page));missingDateDebug.push({page:Number(pg.page),header_candidates:dateDebug(it)});continue}
  pagePeriods.push({page:Number(pg.page),period_start:period.start,period_end:period.end,header:period.raw,source:period.source||"range"});
  pagesWithUsablePeriod++;

  for(let pi=0;pi<ps.length;pi++){
   const p=ps[pi]; if(!p.roster)continue;
   rosterBandsExamined++;
   const bottom=pi+1<ps.length?ps[pi+1].y:p.y-95,band=it.filter((z:any)=>z.y<=p.y+5&&z.y>bottom+1);
   const bandRoles=roleCandidates(band,ds);
   rolesInsideRosterBands+=bandRoles.length;
   for(const role of bandRoles){
    const d=nearestDay(ds,role.x),[left,right]=colBounds(ds,d);
    const ownsDay=(z:any)=>nearestDay(ds,z.x)===d;
    const c=band.filter(ownsDay);
    const pageCol=it.filter(ownsDay);
    // Quinyx may print Michle either inside the same text item or as a neighbour.
    const roleIsMichle=norm(role.raw_text||"").includes("michle prague")||
       pageCol.some((z:any)=>norm(z.text).includes("michle prague")&&Math.abs(z.y-role.y)<2.8);
    if(roleIsMichle){skippedMichleRoles++;continue;}
    const ys=[...new Set(c.filter((z:any)=>isTime(z.text)).map((z:any)=>z.y))].sort((x:any,y:any)=>y-x);
    const pairs=ys.map((y:any)=>({y,pair:pairAtY(c,y)})).filter((q:any)=>q.pair);
    const above=pairs.filter((q:any)=>q.y>role.y+2).sort((x:any,y:any)=>x.y-y.y);
    const below=pairs.filter((q:any)=>q.y<role.y-3).sort((x:any,y:any)=>y.y-x.y);
    const breakPairs=below.filter((q:any)=>["11:00-11:30","20:00-20:30","18:00-18:30","14:15-14:45"].includes(q.pair.join("-")));
    const actualPairs=below.filter((q:any)=>!breakPairs.includes(q)&&!(q.pair[0]==="00:00"&&q.pair[1]==="00:00")).sort((x:any,y:any)=>x.y-y.y);
    // Planned block: right-edge Sunday cells and older PDFs often wrap the start/end
    // farther apart than normal. Own tokens by the nearest day header and inspect up to 60 pt above role.
    const plannedTokens=pageCol.filter((z:any)=>isTime(z.text)&&z.y>role.y+1.2&&z.y-role.y<60)
      .sort((a:any,b:any)=>(a.y-role.y)-(b.y-role.y)||a.x-b.x);
    const combinedRanges=pageCol.filter((z:any)=>z.y>role.y+1.2&&z.y-role.y<60)
      .map((z:any)=>{
        const m=String(z.text||"").match(/\b(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\b/);
        return m?{start:m[1],end:m[2],y:z.y,x:z.x}:null;
      }).filter(Boolean)
      .sort((a:any,b:any)=>(a.y-role.y)-(b.y-role.y)||a.x-b.x);
    let planned:any=null, scheduledPaidHours:any=null, plannedPicked:any[]=[];
    if(combinedRanges.length){
      const q:any=combinedRanges[0],k=`${q.start}-${q.end}`;
      if(!(q.start==="00:00"&&q.end==="00:00") &&
         !["11:00-11:30","20:00-20:30","18:00-18:30","14:15-14:45"].includes(k)){
        planned=[q.start,q.end];plannedPicked=[q];
        const nums=pageCol.filter((z:any)=>/^\d+(?:\.\d+)?$/.test(z.text)&&Math.abs(z.y-q.y)<1.6)
          .sort((x:any,y:any)=>x.x-y.x);
        if(nums.length)scheduledPaidHours=+nums[nums.length-1].text;
      }
    }
    if(!planned&&plannedTokens.length>=2){
      // Prefer a plausible pair close to the role; don't accidentally take a meal break.
      for(let aidx=0;aidx<Math.min(plannedTokens.length,6)&&!planned;aidx++){
        for(let bidx=aidx+1;bidx<Math.min(plannedTokens.length,6)&&!planned;bidx++){
          let picked=[plannedTokens[aidx],plannedTokens[bidx]];
          if(Math.abs(picked[0].y-picked[1].y)>22)continue;
          picked=Math.abs(picked[0].y-picked[1].y)<1.1
            ? picked.sort((a:any,b:any)=>a.x-b.x)
            : picked.sort((a:any,b:any)=>b.y-a.y);
          const a=picked[0].text,b=picked[1].text,k=`${a}-${b}`;
          if((a==="00:00"&&b==="00:00") ||
             ["11:00-11:30","20:00-20:30","18:00-18:30","14:15-14:45"].includes(k))continue;
          planned=[a,b];plannedPicked=picked;
          const py=Math.min(...picked.map((z:any)=>z.y));
          const nums=pageCol.filter((z:any)=>/^\d+(?:\.\d+)?$/.test(z.text)&&Math.abs(z.y-py)<1.6)
            .sort((x:any,y:any)=>x.x-y.x);
          if(nums.length)scheduledPaidHours=+nums[nums.length-1].text;
        }
      }
    }
    // Actual clock row is the FIRST non-break pair below the role, not the lowest pair in the person's band.
    const breakY=breakPairs.length?Math.min(...breakPairs.map((q:any)=>q.y)):null;
    const actualCandidates=actualPairs.filter((q:any)=>breakY==null?q.y<role.y-3:q.y<breakY-1.5)
      .sort((x:any,y:any)=>y.y-x.y);
    let actualCandidate:any=null, worked:any=null;
    for(const q of actualCandidates){
      const nums=c.filter((z:any)=>/^\d+(?:\.\d+)?$/.test(z.text)&&Math.abs(z.y-q.y)<1.1).sort((x:any,y:any)=>x.x-y.x);
      if(nums.length){actualCandidate=q;worked=+nums[nums.length-1].text;break;}
    }
    let actual=actualCandidate?.pair||null;
    const actualY=actualCandidate?.y;
    const m=role.text.match(/^(GA|SL)\s+(.+)$/i)!;
    const rowDate=d.date;
    if(cutoff&&rowDate>cutoff){actual=null;worked=null;}
    // Only call it verified when both scheduled and actual are present in the expected geometry.
    rows.push({person_key:p.key,name:p.name,date:rowDate,
      scheduled_start:planned?.[0]||null,scheduled_end:planned?.[1]||null,scheduled_hours:scheduledPaidHours,
      actual_start:actual?.[0]||null,actual_end:actual?.[1]||null,actual_worked_hours:worked,
      role:m[1].toUpperCase(),shift_type:m[2],page:pg.page,
      page_period_start:period.start,page_period_end:period.end,
      confidence:planned&&actual&&worked!=null?"verified_geometry":planned?"scheduled_only":"needs_review",
      observed_pairs:pairs.map((q:any)=>({y:q.y,start:q.pair[0],end:q.pair[1]})),
      role_x:role.x,role_y:role.y,day_x:d.x,column_left:left,column_right:right,
      planned_time_tokens:plannedTokens.slice(0,8).map((z:any)=>({text:z.text,x:z.x,y:z.y}))});
   }
  }
 }
 const score=(r:any)=>
   (r.scheduled_start&&r.scheduled_end?20:0)+
   (r.actual_start&&r.actual_end?8:0)+
   (r.actual_worked_hours!=null?4:0)+
   (r.scheduled_hours!=null?2:0)+
   (r.confidence==="verified_geometry"?3:r.confidence==="scheduled_only"?1:0);
 const best=new Map<string,any>();
 for(const r of rows){
   const k=`${r.person_key}|${r.date}|${r.role}|${r.shift_type}`;
   const old=best.get(k);
   if(!old||score(r)>score(old))best.set(k,r);
 }
 const deduped=[...best.values()];
 const periodEnds=pagePeriods.map((p:any)=>p.period_end).filter(Boolean).sort();
 const targetMonth=periodEnds.length?String(periodEnds[periodEnds.length-1]).slice(0,7):null;
 const monthRows=targetMonth?deduped.filter((r:any)=>String(r.date||"").startsWith(targetMonth)):deduped;
 return {
   rows:monthRows,
   targetMonth,
   excluded_adjacent_month_rows:deduped.length-monthRows.length,
   missingDatePages:[...new Set(missingDatePages)].sort((a,b)=>a-b),
   pagePeriods,missingDateDebug,inferredDatePages,pageScan,
   pages_with_usable_period:pagesWithUsablePeriod,
   roster_bands_examined:rosterBandsExamined,
   roles_inside_roster_bands:rolesInsideRosterBands,
   skipped_michle_roles:skippedMichleRoles,
   candidate_row_count:rows.length,deduped_row_count:deduped.length,month_row_count:monthRows.length
 };
}
function addDays(date:string,n:number){
 const d=new Date(date+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10);
}
function ts(date:string,time:string|null,endOf:string|null=null){
 if(!time)return null;
 let dd=date;
 if(endOf){
   const [sh,sm]=endOf.split(":").map(Number),[eh,em]=time.split(":").map(Number);
   if(eh*60+em<=sh*60+sm)dd=addDays(date,1);
 }
 const [y,m,d]=dd.split("-").map(Number),[hh,mi]=time.split(":").map(Number);
 const wanted=Date.UTC(y,m-1,d,hh,mi,0);
 let utc=wanted;
 const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 for(let i=0;i<2;i++){
  const p:any={};for(const x of fmt.formatToParts(new Date(utc)))p[x.type]=x.value;
  const seen=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));
  utc+=wanted-seen;
 }
 return new Date(utc).toISOString();
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("authorization")||"",url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}}}),{data:{user}}=await uc.auth.getUser();if(!user)return J({error:"Unauthorized"},401);
  const db=createClient(url,service),{data:adm}=await db.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();if(!adm)return J({error:"Forbidden"},403);

  const b=await req.json(),mode=b.mode||"preview",import_id=b.import_id||null,parsed=parse(b.layout_json||[]),rows=parsed.rows;
  let imp:any=null;
  if(import_id){
    const {data:impRow,error:impErr}=await db.from("imports").select("id,filename,status,report_type,metadata").eq("id",import_id).maybeSingle();
    if(impErr)return J({error:impErr.message},500);
    imp=impRow||null;
  }
  if(!rows.length){
    const scan=parsed.pageScan||[];
    const ds=scan.reduce((a:number,x:any)=>a+Number(x.day_anchors||0),0);
    const ps=scan.reduce((a:number,x:any)=>a+Number(x.person_anchors||0),0);
    const rs=scan.reduce((a:number,x:any)=>a+Number(x.role_candidates||0),0);
    const diagnostics={
      pages:b.layout_json?.length||0,
      day_anchors:ds,person_anchors:ps,role_candidates:rs,
      pages_with_usable_period:parsed.pages_with_usable_period||0,
      roster_bands_examined:parsed.roster_bands_examined||0,
      roles_inside_roster_bands:parsed.roles_inside_roster_bands||0,
      skipped_michle_roles:parsed.skipped_michle_roles||0,
      page_scan:scan,missing_date_pages:parsed.missingDatePages,
      page_periods:parsed.pagePeriods,date_debug:parsed.missingDateDebug
    };
    await db.from("imports").update({
      metadata:{...(imp.metadata||{}),quinyx_parse_debug:{parser:"v29",...diagnostics,at:new Date().toISOString()}}
    }).eq("id",import_id);
    return J({
      error:`No Quinyx shifts parsed · pages ${diagnostics.pages} · usable period ${diagnostics.pages_with_usable_period} · day anchors ${ds} · people ${ps} · roles page ${rs} · roles in person bands ${diagnostics.roles_inside_roster_bands} · skipped Michle ${diagnostics.skipped_michle_roles}`,
      diagnostics
    },422);
  }
  const dates=rows.map((r:any)=>r.date).sort(),period_start=dates[0],period_end=dates[dates.length-1];
  const missingPlan=rows.filter((r:any)=>!r.scheduled_start||!r.scheduled_end);
  const dup=new Map<string,number>();
  for(const r of rows){const k=`${r.person_key}|${r.date}|${r.role}|${r.shift_type}`;dup.set(k,(dup.get(k)||0)+1)}
  const duplicateKeys=[...dup.entries()].filter(([,n])=>n>1).map(([k])=>k);
  const futureActualRows=rows.filter((r:any)=>r.date>new Date().toISOString().slice(0,10)&&r.actual_start);
  const validation={
    period_start,period_end,row_count:rows.length,
    target_month:parsed.targetMonth||period_start.slice(0,7),
    excluded_adjacent_month_rows:parsed.excluded_adjacent_month_rows||0,
    candidate_row_count:parsed.candidate_row_count??rows.length,
    people_count:new Set(rows.map((x:any)=>x.person_key)).size,
    missing_planned:missingPlan.length,
    missing_planned_rows:missingPlan.slice(0,30).map((r:any)=>({person:r.name,date:r.date,role:r.role,shift_type:r.shift_type,page:r.page,confidence:r.confidence,role_x:r.role_x,role_y:r.role_y,day_x:r.day_x,column_left:r.column_left,column_right:r.column_right,planned_time_tokens:r.planned_time_tokens||[],observed_pairs:r.observed_pairs||[]})),
    duplicate_keys:duplicateKeys.length,
    future_actuals:futureActualRows.length,
    future_actual_rows:futureActualRows.slice(0,20).map((r:any)=>({person:r.name,date:r.date,role:r.role,shift_type:r.shift_type,page:r.page})),
    missing_date_pages:parsed.missingDatePages,
    inferred_date_pages:parsed.inferredDatePages||[],
    page_periods:parsed.pagePeriods,
    date_debug:parsed.missingDateDebug
  };

  if(mode==="preview")return J({ok:true,preview:true,parser_stage:"quinyx-layout-v30",shift_count:rows.length,
    people_count:validation.people_count,period_start,period_end,validation,rows,
    note:"Preview only. V30 opravuje diagnostický pád při nulovém počtu směn a zachovává V29 day-column parsing. Nic se ještě nezapisuje."});

  if(mode!=="commit")return J({error:"Unsupported mode"},400);
  if(!import_id)return J({error:"Missing import_id"},400);
  if(!period_start||!period_end||!rows.length||!validation.people_count||missingPlan.length||duplicateKeys.length||validation.future_actuals||parsed.missingDatePages.length)
    return J({error:"Quinyx validation failed; commit blocked",validation},409);

  if(!imp)return J({error:"Import not found"},400);

  const keys=[...new Set(rows.map((r:any)=>r.person_key))];
  const {data:people,error:pe}=await db.from("people").select("id,person_key").in("person_key",keys);
  if(pe)return J({error:pe.message},500);
  const pmap=new Map((people||[]).map((p:any)=>[p.person_key,p.id]));
  const unresolved=keys.filter(k=>!pmap.get(k));
  if(unresolved.length)return J({error:"Unresolved Quinyx roster people",unresolved},409);

  const payload=rows.map((r:any)=>({
    person_id:pmap.get(r.person_key),
    shift_date:r.date,
    role:r.role,
    shift_type:r.shift_type,
    scheduled_start:ts(r.date,r.scheduled_start),
    scheduled_end:ts(r.date,r.scheduled_end,r.scheduled_start),
    actual_start:ts(r.date,r.actual_start),
    actual_end:ts(r.date,r.actual_end,r.actual_start),
    scheduled_hours:r.scheduled_hours,
    worked_hours:r.actual_worked_hours,
    import_id,
    source_record_key:`shift|${pmap.get(r.person_key)}|${r.date}|${norm(r.role).replace(/\s+/g," ")}|${norm(r.shift_type).replace(/\s+/g," ")}`,
    metadata:{
      source_type:"quinyx",parser_version:"quinyx-v30",source_name:r.name,page:r.page,
      page_period_start:r.page_period_start,page_period_end:r.page_period_end,
      confidence:r.confidence,venue:"Holešovice, Prague",export_cutoff:new Date().toISOString().slice(0,10)
    }
  }));

  const {data:w,error:we}=await db.from("shifts")
    .upsert(payload,{onConflict:"source_record_key"}).select("id");
  if(we)return J({error:we.message},500);

  await db.from("imports").update({
    status:"imported",period_start,period_end,parser_version:"quinyx-v30"
  }).eq("id",import_id);

  return J({ok:true,committed:true,inserted_count:w?.length??0,attempted_count:payload.length,
    period_start,period_end,people_count:validation.people_count,validation,merge_guard:"canonical-v152"});
 }catch(e){return J({error:String(e?.message||e)},500)}
});
