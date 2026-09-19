import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"content-type":"application/json"}});
const norm=(v:any)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[%]/g," ").replace(/[^a-z0-9@._+\-]+/g," ").replace(/\s+/g," ").trim();
const normWords=(v:any)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
const addDays=(iso:string,n:number)=>{const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const monthEnd=(y:number,m:number)=>new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
const months:any={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,leden:1,unor:2,brezen:3,duben:4,kveten:5,cerven:6,cervenec:7,srpen:8,zari:9,rijen:10,listopad:11,prosinec:12};

function isoWeekStart(year:number,week:number){
  const jan4=new Date(Date.UTC(year,0,4));
  const dow=jan4.getUTCDay()||7;
  jan4.setUTCDate(jan4.getUTCDate()-(dow-1)+(week-1)*7);
  return jan4.toISOString().slice(0,10);
}
function datePeriodFromText(raw:string){
  const s=String(raw||"");
  let m=s.match(/\b(20\d{2}-\d{2}-\d{2})\b\s*(?:to|through|thru|–|—|-|→)\s*\b(20\d{2}-\d{2}-\d{2})\b/i);
  if(m)return {start:m[1],end:m[2],granularity:granularityFor(m[1],m[2]),evidence:m[0]};
  m=s.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b\s*(?:to|through|thru|–|—|-|→)\s*\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/i);
  if(m){
    const a=`${m[3]}-${String(+m[2]).padStart(2,"0")}-${String(+m[1]).padStart(2,"0")}`;
    const b=`${m[6]}-${String(+m[5]).padStart(2,"0")}-${String(+m[4]).padStart(2,"0")}`;
    return {start:a,end:b,granularity:granularityFor(a,b),evidence:m[0]};
  }
  m=s.match(/\b(20\d{2})[- ]?W(\d{1,2})\b/i)||s.match(/\b(?:week|wk|w)\s*(\d{1,2})\D{0,10}(20\d{2})\b/i);
  if(m){
    let y:number,w:number;
    if(/^20/.test(m[1])){y=+m[1];w=+m[2]}else{w=+m[1];y=+m[2]}
    if(w>=1&&w<=53){const a=isoWeekStart(y,w);return {start:a,end:addDays(a,6),granularity:"week",evidence:m[0]}}
  }
  m=s.match(/\b(20\d{2})-(\d{2})\b(?!-\d{2})/);
  if(m&&+m[2]>=1&&+m[2]<=12){const a=`${m[1]}-${m[2]}-01`;return {start:a,end:monthEnd(+m[1],+m[2]),granularity:"month",evidence:m[0]}}
  const ns=normWords(s);
  const ym=ns.match(/\b(20\d{2})\b/);
  if(ym){
    for(const [name,numv] of Object.entries(months)){
      if((" "+ns+" ").includes(" "+normWords(name)+" ")){
        const mm=Number(numv),a=`${ym[1]}-${String(mm).padStart(2,"0")}-01`;
        return {start:a,end:monthEnd(+ym[1],mm),granularity:"month",evidence:name+" "+ym[1]};
      }
    }
  }
  m=s.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if(m)return {start:m[1],end:m[1],granularity:"day",evidence:m[0]};
  m=s.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  if(m){const a=`${m[3]}-${String(+m[2]).padStart(2,"0")}-${String(+m[1]).padStart(2,"0")}`;return {start:a,end:a,granularity:"day",evidence:m[0]}}
  m=s.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if(m){
    const a=+m[1],b=+m[2],y=+m[3];
    if(a>12&&b<=12){const d=`${y}-${String(b).padStart(2,"0")}-${String(a).padStart(2,"0")}`;return {start:d,end:d,granularity:"day",evidence:m[0]}}
    if(b>12&&a<=12){const d=`${y}-${String(a).padStart(2,"0")}-${String(b).padStart(2,"0")}`;return {start:d,end:d,granularity:"day",evidence:m[0]}}
  }
  return null;
}
function granularityFor(a:string,b:string){
  if(a===b)return "day";
  const da=new Date(a+"T12:00:00Z"),db=new Date(b+"T12:00:00Z"),days=Math.round((db.getTime()-da.getTime())/86400000)+1;
  if(days<=7)return "week";
  if(a.slice(8)==="01"&&b===monthEnd(+a.slice(0,4),+a.slice(5,7)))return "month";
  return "other";
}
function numberTokens(raw:string){
  const out:any[]=[];
  const re=/-?\d(?:[\d\s]*\d)?(?:[.,]\d+)?%?/g;let m;
  while((m=re.exec(String(raw||"")))){
    const token=m[0].trim();
    if(/^20\d{2}$/.test(token))continue;
    if(/^\d{1,2}[./]\d{1,2}/.test(String(raw).slice(Math.max(0,m.index-1),m.index+token.length+6)))continue;
    out.push({raw:token,index:m.index});
    if(re.lastIndex===m.index)re.lastIndex++;
  }
  return out;
}
function parseNumber(raw:string,unit:string){
  let s=String(raw||"").trim(),hadPercent=s.includes("%");
  s=s.replace(/%/g,"").replace(/\s/g,"");
  if(unit==="count"&&/^-?\d{1,3}([,.]\d{3})+$/.test(s))s=s.replace(/[,.]/g,"");
  else if(s.includes(",")&&s.includes(".")){
    if(s.lastIndexOf(",")>s.lastIndexOf("."))s=s.replace(/\./g,"").replace(",",".");
    else s=s.replace(/,/g,"");
  }else if(s.includes(","))s=s.replace(",",".");
  const value=Number(s);
  return {value,hadPercent,raw};
}
function validateValue(parsed:any,def:any){
  const warnings:string[]=[],conflicts:string[]=[];
  let value=parsed.value;
  if(!Number.isFinite(value)){conflicts.push("Hodnota není číslo");return {value:null,warnings,conflicts}}
  if(def.unit==="percent"){
    if(!parsed.hadPercent&&Math.abs(value)<=1){
      conflicts.push(`Nejasná procentní škála: ${parsed.raw}. Potvrď, zda znamená ${value} % nebo ${value*100} %.`);
    }else if(value<0||value>100){
      conflicts.push(`Procento mimo rozsah 0–100: ${parsed.raw}`);
    }else if(!parsed.hadPercent)warnings.push("Procentní hodnota nemá znak %; ponechána 1:1.");
  }
  if(def.unit==="count"){
    if(value<0)warnings.push("Záporný count.");
    if(Math.abs(value-Math.round(value))>1e-9)warnings.push("Count není celé číslo.");
  }
  return {value,warnings,conflicts};
}
function paddedIncludes(text:string,needle:string){return (" "+normWords(text)+" ").includes(" "+normWords(needle)+" ")}
function uniqueById(matches:any[]){
  const m=new Map<string,any>();for(const x of matches)m.set(String(x.id),x);return [...m.values()];
}
function findEntities(text:string,entities:any[]){
  const n=" "+normWords(text)+" ",hits:any[]=[];
  for(const e of entities){
    for(const a of e.aliases||[]){
      const aa=normWords(a);if(aa.length<3)continue;
      if(n.includes(" "+aa+" ")){hits.push(e);break}
    }
  }
  return uniqueById(hits);
}
function scopeCue(text:string){
  const n=normWords(text);
  if(/\b(store average|venue average|store avg|venue avg|wolt market|prodejna|obchod)\b/.test(n))return "store";
  if(/\b(picker|employee|worker|personal|individual|individualni|zamestnanec|ga)\b/.test(n))return "person";
  if(/\b(team average|team avg|tym(?:ovy)? prumer)\b/.test(n))return "aggregate";
  return null;
}
function detectSubject(row:string,context:string,people:any[],venues:any[],docVenues:any[]){
  const rp=findEntities(row,people),rv=findEntities(row,venues),cue=scopeCue(row);
  if(rp.length===1)return {scope:"person",person_id:rp[0].id,label:rp[0].display_name,confidence:1,evidence:"row-person"};
  if(rp.length>1)return {error:"Více osob na stejném řádku: "+rp.map(x=>x.display_name).join(", ")};
  if(rv.length===1)return {scope:"store",venue_key:rv[0].venue_key,label:rv[0].venue_name,confidence:1,evidence:"row-store"};
  if(rv.length>1)return {error:"Více stores na stejném řádku: "+rv.map(x=>x.venue_name).join(", ")};
  if(cue==="aggregate")return {error:"Team average není bezpečně PERSON ani STORE scope."};
  if(cue==="store"&&docVenues.length===1)return {scope:"store",venue_key:docVenues[0].venue_key,label:docVenues[0].venue_name,confidence:.9,evidence:"store-cue"};
  const cp=findEntities(context,people),cv=findEntities(context,venues),cc=scopeCue(context);
  if(cp.length===1&&cc!=="store")return {scope:"person",person_id:cp[0].id,label:cp[0].display_name,confidence:.88,evidence:"nearby-person"};
  if(cv.length===1)return {scope:"store",venue_key:cv[0].venue_key,label:cv[0].venue_name,confidence:.88,evidence:"nearby-store"};
  if(cc==="store"&&docVenues.length===1)return {scope:"store",venue_key:docVenues[0].venue_key,label:docVenues[0].venue_name,confidence:.78,evidence:"document-store"};
  return {error:"Scope/subjekt není jednoznačný (PERSON vs STORE)."};
}
function buildMappings(defs:any[],aliases:any[]){
  const dm=new Map(defs.map(d=>[d.metric_id,d])),rows:any[]=[];
  for(const a of aliases){
    const d=dm.get(a.metric_id);if(!d)continue;
    rows.push({...a,label:d.label,unit:d.unit,category:d.category,default_granularity:d.default_granularity,normalized_alias:normWords(a.normalized_alias||a.alias)});
  }
  for(const d of defs){
    const scope=d.category==="store"?"store":"person",g=d.default_granularity||"any";
    const auto=[
      {alias:d.label,priority:120},
      {alias:String(d.metric_id).replace(/_/g," "),priority:45}
    ];
    for(const a of auto){
      const na=normWords(a.alias);if(na.length<3)continue;
      rows.push({alias:a.alias,normalized_alias:na,metric_id:d.metric_id,scope,granularity:g,priority:a.priority,confirmed:true,label:d.label,unit:d.unit,category:d.category,default_granularity:g,source:"definition"});
    }
  }
  return rows;
}
function hitGroups(cell:string,mappings:any[]){
  const n=normWords(cell),found:any[]=[];
  if(!n)return found;
  for(const m of mappings){
    const a=m.normalized_alias;if(!a||a.length<3)continue;
    let at=(" "+n+" ").indexOf(" "+a+" ");if(at<0)continue;
    found.push({alias:a,at:Math.max(0,at-1),end:Math.max(0,at-1)+a.length,mapping:m});
  }
  found.sort((a,b)=>(b.alias.length-a.alias.length)||(b.mapping.priority-a.mapping.priority));
  const accepted:any[]=[];
  for(const h of found){
    if(accepted.some(x=>h.at>=x.at&&h.end<=x.end&&h.alias!==x.alias))continue;
    accepted.push(h);
  }
  const by=new Map<string,any[]>();
  for(const h of accepted){const k=h.alias+"|"+h.at;const arr=by.get(k)||[];arr.push(h.mapping);by.set(k,arr)}
  return [...by.entries()].map(([k,maps])=>({alias:k.split("|")[0],mappings:maps}));
}
function resolveMapping(group:any,scope:string,granularity:string){
  let rows=(group?.mappings||[]).filter((m:any)=>m.scope===scope);
  const exact=rows.filter((m:any)=>m.granularity===granularity);
  if(exact.length)rows=exact;else rows=rows.filter((m:any)=>m.granularity==="any");
  if(!rows.length)return {error:`Název "${group?.alias}" nemá mapping pro ${scope.toUpperCase()}/${granularity}.`};
  const max=Math.max(...rows.map((m:any)=>Number(m.priority||0)));rows=rows.filter((m:any)=>Number(m.priority||0)===max);
  const ids=[...new Set(rows.map((m:any)=>m.metric_id))];
  if(ids.length!==1)return {error:`Název "${group?.alias}" je nejednoznačný: ${ids.join(", ")}`};
  return {mapping:rows.find((m:any)=>m.metric_id===ids[0])};
}
function personSource(metric_id:string,granularity:string,category:string){
  if(metric_id.startsWith("daily_"))return "daily_picking";
  if(metric_id.startsWith("inbound_"))return "inbound";
  if(metric_id==="stock_count_adjustment_count")return "stock_count";
  if(metric_id.startsWith("team_rating_"))return "team_rating";
  if(metric_id.startsWith("store_card_")||category==="store_card")return "store_card_monthly";
  if(granularity==="week")return "ga_metrics";
  if(granularity==="day")return "daily_picking";
  return "universal_metrics";
}
function subjectContext(lines:string[],i:number){return lines.slice(Math.max(0,i-2),Math.min(lines.length,i+3)).join(" | ")}
function periodContext(lines:string[],i:number,docPeriod:any){
  for(let d=0;d<=3;d++){
    for(const j of [i-d,i+d]){
      if(j<0||j>=lines.length)continue;
      const p=datePeriodFromText(lines[j]);if(p)return p;
    }
  }
  return docPeriod;
}
function metricValueFromCell(cells:string[],idx:number,unit:string){
  const own=numberTokens(cells[idx]||"");
  if(own.length===1)return parseNumber(own[0].raw,unit);
  if(own.length>1)return {error:"Více čísel ve stejné buňce: "+own.map(x=>x.raw).join(", ")};
  for(const j of [idx+1,idx-1]){
    if(j<0||j>=cells.length)continue;
    const t=numberTokens(cells[j]||"");
    if(t.length===1&&hitGroups(cells[j],[]).length===0)return parseNumber(t[0].raw,unit);
  }
  return {error:"U metriky nebyla jednoznačná číselná hodnota."};
}
function canonicalKey(x:any){
  return x.scope==="person"
    ? ["mo",x.source_type,x.person_id,x.metric_id,x.period_start,x.period_end,x.granularity].join("|")
    : ["store",x.venue_key,x.metric_id,x.period_start,x.period_end,x.granularity].join("|");
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
async function refs(db:any){
  const rs=await Promise.all([
    db.from("metric_definitions").select("metric_id,label,unit,category,lower_is_better,default_granularity"),
    db.from("metric_aliases").select("alias,normalized_alias,metric_id,scope,granularity,priority,confirmed,source").eq("active",true).eq("confirmed",true),
    db.from("people").select("id,person_key,display_name,full_name,active").eq("active",true),
    db.from("person_aliases").select("person_id,alias_value,normalized_value,confirmed").eq("confirmed",true),
    db.from("store_metrics").select("venue_key,metadata").limit(5000)
  ]);
  for(const r of rs)if(r.error)throw r.error;
  const defs=rs[0].data||[],mappings=buildMappings(defs,rs[1].data||[]);
  const pa=new Map<string,string[]>();for(const a of rs[3].data||[]){const k=String(a.person_id),arr=pa.get(k)||[];arr.push(a.alias_value,a.normalized_value);pa.set(k,arr)}
  const people=(rs[2].data||[]).map((p:any)=>({id:p.id,display_name:p.display_name,aliases:[p.display_name,p.full_name,p.person_key,...(pa.get(String(p.id))||[])].filter(Boolean)}));
  const vm=new Map<string,any>();
  for(const r of rs[4].data||[]){
    const k=String(r.venue_key);if(!vm.has(k))vm.set(k,{venue_key:k,venue_name:r.metadata?.venue_name||k,aliases:new Set<string>()});
    const v=vm.get(k);v.aliases.add(k.replace(/_/g," "));v.aliases.add(r.metadata?.venue_name||"");
    const suffix=k.replace(/^wolt_market_/,"").replace(/_/g," ");v.aliases.add(suffix);v.aliases.add("wolt market "+suffix);
  }
  const venues=[...vm.values()].map((v:any)=>({...v,aliases:[...v.aliases].filter(Boolean)}));
  return {defs,mappings,people,venues};
}
function parseAll(filename:string,text:string,r:any){
  const lines=String(text||"").replace(/\u00a0/g," ").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const docPeriod=datePeriodFromText(filename+"\n"+text);
  const docVenues=findEntities(filename+"\n"+text,r.venues);
  const detections:any[]=[],conflicts:any[]=[],warnings:any[]=[];
  const consumed=new Set<number>();

  // Table mode: metric names in a header row, subjects/values in following rows.
  let header:any=null;
  for(let i=0;i<lines.length;i++){
    if(/^---\s*(PAGE|SHEET)/i.test(lines[i])){header=null;continue}
    const cells=lines[i].split(/\s*\|\s*/);
    const cols:any[]=[];
    cells.forEach((cell,idx)=>{
      const hg=hitGroups(cell,r.mappings);
      if(hg.length===1)cols.push({idx,group:hg[0]});
    });
    const numericCells=cells.filter(x=>numberTokens(x).length).length;
    if(cols.length>=2&&numericCells<=1){header={line:i,cols,max:Math.max(...cols.map(x=>x.idx)),age:0};continue}
    if(header){
      header.age++;
      if(header.age>80){header=null;continue}
      if(cells.length<=header.max)continue;
      const p=periodContext(lines,i,docPeriod);
      const sub=detectSubject(lines[i],subjectContext(lines,i),r.people,r.venues,docVenues);
      let rowUsed=false;
      for(const col of header.cols){
        const tentative=(col.group.mappings||[]).find((m:any)=>m.scope===(sub.scope||"person"));
        const unit=tentative?.unit||"number";
        const nv=metricValueFromCell(cells,col.idx,unit);
        if(nv?.error)continue;
        rowUsed=true;
        handleCandidate({line:i,raw_line:lines[i],alias:col.group.alias,group:col.group,parsed:nv,period:p,subject:sub,method:"table"},r,detections,conflicts,warnings);
      }
      if(rowUsed)consumed.add(i);
    }
  }

  // Direct mode: subject | metric | value, or metric + value on one row.
  for(let i=0;i<lines.length;i++){
    if(consumed.has(i)||/^---\s*(PAGE|SHEET)/i.test(lines[i]))continue;
    const cells=lines[i].split(/\s*\|\s*/);
    for(let ci=0;ci<cells.length;ci++){
      const groups=hitGroups(cells[ci],r.mappings);
      if(!groups.length)continue;
      if(groups.length>1){
        conflicts.push({type:"metric_ambiguous_line",line:i+1,raw_line:lines[i],reason:"Více názvů metrik v jedné buňce bez jednoznačného sloupcového mapování."});
        continue;
      }
      const p=periodContext(lines,i,docPeriod);
      const sub=detectSubject(lines[i],subjectContext(lines,i),r.people,r.venues,docVenues);
      const tentative=(groups[0].mappings||[]).sort((a:any,b:any)=>Number(b.priority||0)-Number(a.priority||0))[0];
      const nv=metricValueFromCell(cells,ci,tentative?.unit||"number");
      if(nv?.error){
        // A header row with only one metric is not a data conflict by itself.
        if(numberTokens(lines[i]).length)conflicts.push({type:"value",line:i+1,raw_line:lines[i],reason:nv.error});
        continue;
      }
      handleCandidate({line:i,raw_line:lines[i],alias:groups[0].alias,group:groups[0],parsed:nv,period:p,subject:sub,method:"direct"},r,detections,conflicts,warnings);
    }
  }

  const by=new Map<string,any>();
  for(const d of detections){
    const k=canonicalKey(d),old=by.get(k);
    if(!old){by.set(k,d);continue}
    if(Math.abs(Number(old.value)-Number(d.value))>1e-9)conflicts.push({type:"duplicate_value",key:k,reason:"Stejná canonical metrika má v souboru různé hodnoty.",old_value:old.value,new_value:d.value});
  }
  const unique=[...by.values()];
  return {detections:unique,conflicts,warnings,docPeriod,line_count:lines.length};
}
function handleCandidate(x:any,r:any,detections:any[],conflicts:any[],warnings:any[]){
  if(!x.period||x.period.granularity==="other"){
    conflicts.push({type:"period",line:x.line+1,raw_line:x.raw_line,reason:"Období není jednoznačné jako den / týden / měsíc."});return;
  }
  if(x.subject?.error){
    conflicts.push({type:"scope",line:x.line+1,raw_line:x.raw_line,alias:x.alias,reason:x.subject.error});return;
  }
  const resolved=resolveMapping(x.group,x.subject.scope,x.period.granularity);
  if(resolved.error){conflicts.push({type:"mapping",line:x.line+1,raw_line:x.raw_line,alias:x.alias,reason:resolved.error});return}
  const m=resolved.mapping,checked=validateValue(x.parsed,m);
  for(const w of checked.warnings)warnings.push({type:"value_warning",line:x.line+1,metric_id:m.metric_id,reason:w,raw_line:x.raw_line});
  if(checked.conflicts.length){for(const reason of checked.conflicts)conflicts.push({type:"value_scale",line:x.line+1,metric_id:m.metric_id,reason,raw_line:x.raw_line});return}
  const d:any={
    scope:x.subject.scope,metric_id:m.metric_id,metric_label:m.label,unit:m.unit,value:checked.value,
    period_start:x.period.start,period_end:x.period.end,granularity:x.period.granularity,
    detected_alias:x.alias,raw_line:x.raw_line,line:x.line+1,method:x.method,
    confidence:Math.round((x.subject.confidence||.7)*100),
    metadata:{universal_parser:true,detected_alias:x.alias,scope_evidence:x.subject.evidence,period_evidence:x.period.evidence,raw_line:x.raw_line}
  };
  if(d.scope==="person"){d.person_id=x.subject.person_id;d.source_identity=x.subject.label;d.source_type=personSource(m.metric_id,d.granularity,m.category)}
  else{d.venue_key=x.subject.venue_key;d.venue=x.subject.label}
  detections.push(d);
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const db=await requireAdmin(req),b=await req.json().catch(()=>({}));
    const import_id=String(b.import_id||""),mode=String(b.mode||"preview"),text=String(b.extracted_text||"");
    if(!import_id||!text)return J({error:"Missing import_id or extracted_text"},400);
    const ir=await db.from("imports").select("id,filename,metadata,status").eq("id",import_id).single();
    if(ir.error||!ir.data)return J({error:ir.error?.message||"Import not found"},400);
    const r=await refs(db),parsed=parseAll(ir.data.filename,text,r);
    const observations=parsed.detections.filter((x:any)=>x.scope==="person");
    const store_metrics=parsed.detections.filter((x:any)=>x.scope==="store");
    const periods=parsed.detections.map((x:any)=>[x.period_start,x.period_end]).flat().filter(Boolean).sort();
    const out:any={
      ok:true,preview:mode==="preview",parser_stage:"universal-metrics-v1",import_id,filename:ir.data.filename,
      period_start:periods[0]||parsed.docPeriod?.start||null,period_end:periods.at(-1)||parsed.docPeriod?.end||null,
      detection_count:parsed.detections.length,person_observation_count:observations.length,store_observation_count:store_metrics.length,
      observation_count:parsed.detections.length,observations,store_metrics,
      conflicts:parsed.conflicts,warnings:parsed.warnings,
      diagnostics:{line_count:parsed.line_count,document_period:parsed.docPeriod}
    };
    if(mode==="preview")return J(out);
    if(mode!=="commit")return J({error:"Unsupported mode"},400);
    if(parsed.conflicts.length)return J({error:"Universal import blocked by conflicts",conflicts:parsed.conflicts,warnings:parsed.warnings},409);
    if(!parsed.detections.length)return J({error:"Universal parser found no safe metric observations."},422);

    if(observations.length){
      const rows=observations.map((x:any)=>({
        person_id:x.person_id,metric_id:x.metric_id,value:x.value,period_start:x.period_start,period_end:x.period_end,
        granularity:x.granularity,source_type:x.source_type,import_id,
        source_record_key:["mo",x.source_type,x.person_id,x.metric_id,x.period_start,x.period_end,x.granularity].join("|"),
        metadata:{...x.metadata,parser:"universal-metrics-v1",source_filename:ir.data.filename,confidence:x.confidence}
      }));
      const wr=await db.from("metric_observations").upsert(rows,{onConflict:"source_record_key"});if(wr.error)throw wr.error;
    }
    if(store_metrics.length){
      const rows=store_metrics.map((x:any)=>({
        venue_key:x.venue_key,metric_id:x.metric_id,value:x.value,period_start:x.period_start,period_end:x.period_end,
        granularity:x.granularity,import_id,
        source_record_key:["store",x.venue_key,x.metric_id,x.period_start,x.period_end,x.granularity].join("|"),
        metadata:{...x.metadata,parser:"universal-metrics-v1",source_type:"universal_metrics",source_filename:ir.data.filename,venue_name:x.venue,confidence:x.confidence}
      }));
      const wr=await db.from("store_metrics").upsert(rows,{onConflict:"venue_key,metric_id,period_start,period_end,granularity"});if(wr.error)throw wr.error;
    }
    const iu=await db.from("imports").update({
      report_type:"universal_metrics",status:"imported",period_start:out.period_start,period_end:out.period_end,
      parser_version:"universal-metrics-v1",record_count:parsed.detections.length,warning_count:parsed.warnings.length,
      metadata:{...(ir.data.metadata||{}),universal_metric_import:true,person_observations:observations.length,store_observations:store_metrics.length}
    }).eq("id",import_id);
    if(iu.error)throw iu.error;
    return J({...out,preview:false,committed:true,inserted_count:parsed.detections.length});
  }catch(e:any){
    const m=String(e?.message||e),s=m==="Unauthorized"?401:m==="Forbidden"?403:500;
    return J({error:m},s);
  }
});