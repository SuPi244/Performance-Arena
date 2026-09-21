import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE='https://supi244.github.io/Performance-Arena/';
const OUT='arena-audit-artifacts';
fs.mkdirSync(OUT,{recursive:true});

const report={
  started_at:new Date().toISOString(),
  url:BASE,
  runs:[],
  global_errors:[]
};

function safeName(s){return String(s).replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()}
async function getPasswords(page){
  const html=await page.content();
  const admin=html.match(/profile==='Admin'\s*&&\s*pass==='([^']+)'/)?.[1]||null;
  const user=html.match(/profile!=='Admin'\s*&&\s*pass==='([^']+)'/)?.[1]||null;
  return {admin,user};
}
async function waitLoginReady(page){
  await page.waitForFunction(()=>document.querySelectorAll('#loginProfile option').length>=3,{timeout:60000});
}
async function waitApp(page){
  await page.waitForFunction(()=>{
    const login=document.querySelector('#loginOverlay');
    return login && getComputedStyle(login).display==='none';
  },{timeout:60000});
  await page.waitForFunction(()=>{
    const loading=document.querySelector('#loadingOverlay');
    return !loading || getComputedStyle(loading).display==='none' || loading.classList.contains('done');
  },{timeout:60000}).catch(()=>{});
  await page.locator('#rundownClose:visible').click({timeout:2500}).catch(()=>{});
  await page.locator('#seasonRecapClose:visible').click({timeout:1500}).catch(()=>{});
  await page.waitForTimeout(500);
}
async function login(page,profile,kind){
  await page.goto(BASE+'?e2e='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  await waitLoginReady(page);
  const pw=await getPasswords(page);
  const pass=kind==='admin'?pw.admin:pw.user;
  if(!pass)throw new Error('Could not discover '+kind+' login password from deployed source');
  const targetLabel=kind==='admin'?'Admin':profile;
  const optionLabels=await page.locator('#loginProfile option').allTextContents();
  if(!optionLabels.includes(targetLabel))throw new Error('PROFILE_MISSING: '+targetLabel+' · available='+optionLabels.join(','));
  await page.selectOption('#loginProfile',{label:targetLabel});
  await page.fill('#loginPassword',pass);
  await page.click('#loginSubmit');
  await waitApp(page);
}
async function inspectHomeMomentum(page){
  const out={presets:{},snapshot:null,season:{}};
  out.snapshot=await page.locator('#homeOpsSnapshot').innerText().catch(()=>null);
  for(const key of ['efficiency','output','quality','inbound','inbound_normal','inbound_icy','inbound_freeze','stock']){
    const btn=page.locator('[data-home-momentum="'+key+'"]');
    if(!await btn.count())continue;
    await btn.click();
    await page.waitForTimeout(350);
    out.presets[key]=await page.evaluate((key)=>{
      const canvas=document.getElementById('homeMomentumChart');
      const chart=canvas&&window.Chart?Chart.getChart(canvas):null;
      const personal=chart?.data?.datasets?.[0];
      const ys=(personal?.data||[]).map(p=>typeof p==='object'&&p!==null?p.y:p).filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))).map(Number);
      const xs=(personal?.data||[]).map(p=>typeof p==='object'&&p!==null?p.x:null).filter(v=>v!==null&&v!==undefined);
      return {
        key,
        value:document.getElementById('homeMomentumValue')?.textContent?.trim()||null,
        movement:document.getElementById('homeMomentumMovement')?.textContent?.trim()||null,
        explain:document.getElementById('homeMomentumExplain')?.textContent?.trim()||null,
        meta:document.getElementById('homeMomentumMeta')?.textContent?.trim()||null,
        y:ys,x:xs,
        datasetLabel:personal?.label||null
      };
    },key);
  }
  out.season=await page.evaluate(()=>{
    const read=(id)=>{
      const ch=window.Chart?Chart.getChart(document.getElementById(id)):null;
      const ds=ch?.data?.datasets?.[0];
      const pts=ds?.data||[];
      return {
        label:ds?.label||null,
        y:pts.map(p=>typeof p==='object'&&p!==null?p.y:p).filter(v=>v!=null&&Number.isFinite(Number(v))).map(Number),
        x:pts.map(p=>typeof p==='object'&&p!==null?p.x:null).filter(v=>v!=null)
      };
    };
    return {elo:read('homeSeasonEloChart'),performance:read('homeSeasonPerfChart')};
  });
  return out;
}

async function inspect(page,scope,pageName,label){
  const runErrors=[];
  try{
    await page.evaluate(async(pageName)=>{
      if(typeof openPage!=='function')throw new Error('openPage is not available');
      await openPage(pageName);
    },pageName);
  }catch(e){runErrors.push('openPage: '+e.message)}
  await page.waitForTimeout(900);
  const state=await page.evaluate(({pageName})=>{
    const visible=(el)=>{
      if(!el)return false;
      const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0;
    };
    const root=document.querySelector('#page-'+pageName);
    const rootVisible=!!root&&visible(root);
    const fatal=document.querySelector('#fatal');
    const fatalVisible=!!fatal&&visible(fatal)&&fatal.textContent.trim();
    const visibleErrors=[...document.querySelectorAll('.notice.error')].filter(visible).map(x=>x.textContent.trim()).filter(Boolean);
    const loading=[...document.querySelectorAll('#page-'+pageName+' *')].filter(el=>visible(el)&&/Načítám|Čekám na data|čekám na data/i.test(el.textContent||'')).slice(0,12).map(x=>x.textContent.trim().slice(0,180));
    const canvases=[...document.querySelectorAll('#page-'+pageName+' canvas')].filter(visible).map(x=>{
      const r=x.getBoundingClientRect();return {id:x.id||null,w:Math.round(r.width),h:Math.round(r.height)};
    });
    const badCanvas=canvases.filter(x=>x.w<30||x.h<30);
    const buttons=[...document.querySelectorAll('#page-'+pageName+' button')].filter(visible).length;
    const selects=[...document.querySelectorAll('#page-'+pageName+' select')].filter(visible).map(x=>({id:x.id,options:x.options.length,value:x.value}));
    const text=(root?.innerText||'').replace(/\s+/g,' ').trim();
    const viewportOverflow=document.documentElement.scrollWidth-window.innerWidth;
    const overflowing=[...document.querySelectorAll('#page-'+pageName+' *')].filter(visible).map(el=>{
      const r=el.getBoundingClientRect();
      return {tag:el.tagName,id:el.id||null,cls:String(el.className||'').slice(0,120),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
    }).filter(x=>x.right>window.innerWidth+8||x.left<-8).sort((a,b)=>b.right-a.right).slice(0,20);
    const emptyMajor=[...document.querySelectorAll('#page-'+pageName+' .metric-grid, #page-'+pageName+' .cards, #page-'+pageName+' .enhanced-kpi-grid')].filter(visible).filter(el=>!el.children.length).map(x=>x.id||x.className);
    return {
      rootVisible,fatal:fatalVisible||null,visibleErrors,loading,canvases,badCanvas,buttons,selects,
      viewportOverflow,overflowing,emptyMajor,textSample:text.slice(0,800),
      version:[...document.scripts].map(s=>s.textContent||'').join('\n').match(/Wolt Performance Dashboard · V\d+/)?.[0]||null,
      worker:document.querySelector('#workerSelect')?.value||null
    };
  },{pageName});
  const shot=path.join(OUT,safeName(scope+'-'+label+'-'+pageName)+'.png');
  await page.screenshot({path:shot,fullPage:true});
  return {...state,runErrors,screenshot:shot};
}
async function runRole(browser,{scope,kind,profile,pages,viewport}){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const consoleErrors=[],pageErrors=[],requestFails=[];
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,500))});
  page.on('pageerror',e=>pageErrors.push(String(e).slice(0,500)));
  page.on('requestfailed',r=>{
    const url=r.url();
    if(!/google-analytics|doubleclick|fonts\.googleapis/i.test(url))requestFails.push({url:url.slice(0,250),error:r.failure()?.errorText||''});
  });
  const result={scope,kind,profile,viewport,pages:{},consoleErrors,pageErrors,requestFails,login_ok:false};
  try{
    await login(page,profile,kind);
    result.login_ok=true;
    for(const p of pages){
      result.pages[p]=await inspect(page,scope,p,profile);
      if(p==='home'&&profile==='MartinPo')result.homeMomentum=await inspectHomeMomentum(page);
    }
  }catch(e){
    result.fatal=String(e);
    await page.screenshot({path:path.join(OUT,safeName(scope+'-'+profile+'-fatal')+'.png'),fullPage:true}).catch(()=>{});
  }
  report.runs.push(result);
  await context.close();
}

const browser=await chromium.launch({headless:true});
try{
  const employeePages=['home','bonuses','personal','efficiency','achievements','team','bottlenecks','leaderboard','store'];
  await runRole(browser,{scope:'desktop-martin',kind:'user',profile:'MartinPo',pages:employeePages,viewport:{width:1440,height:1100}});
  await runRole(browser,{scope:'desktop-pavel',kind:'user',profile:'PavelK',pages:['home','personal','leaderboard'],viewport:{width:1440,height:1100}});
  await runRole(browser,{scope:'desktop-nataliia',kind:'user',profile:'NataliiaHa',pages:['home','personal','leaderboard'],viewport:{width:1440,height:1100}});
  await runRole(browser,{scope:'mobile-martin',kind:'user',profile:'MartinPo',pages:employeePages,viewport:{width:390,height:844}});
  await runRole(browser,{scope:'admin',kind:'admin',profile:'Admin',pages:['admin','bonuses','team','leaderboard','bottlenecks','correlation','store','home'],viewport:{width:1440,height:1100}});
} finally {
  await browser.close();
}

const issues=[];
for(const run of report.runs){
  if(!run.login_ok)issues.push(run.scope+': login failed: '+(run.fatal||'unknown'));
  for(const [name,p] of Object.entries(run.pages||{})){
    if(!p.rootVisible)issues.push(run.scope+'/'+name+': page not visible');
    if(p.fatal)issues.push(run.scope+'/'+name+': fatal '+p.fatal);
    if(p.visibleErrors?.length)issues.push(run.scope+'/'+name+': visible errors: '+p.visibleErrors.join(' | '));
    if(p.badCanvas?.length)issues.push(run.scope+'/'+name+': zero/tiny canvases '+JSON.stringify(p.badCanvas));
    if(p.viewportOverflow>8)issues.push(run.scope+'/'+name+': body horizontal overflow '+p.viewportOverflow+'px');
    if(p.emptyMajor?.length)issues.push(run.scope+'/'+name+': empty major containers '+p.emptyMajor.join(', '));
  }
  for(const e of run.pageErrors||[])issues.push(run.scope+': pageerror '+e);
  for(const e of run.consoleErrors||[])issues.push(run.scope+': console.error '+e);
}
for(const run of report.runs){
  if(run.profile!=='MartinPo'||!run.homeMomentum)continue;
  const p=run.homeMomentum.presets||{};
  if(p.efficiency?.value&&/min/i.test(p.efficiency.value))issues.push(run.scope+'/home: Efficiency still rendered as minutes: '+p.efficiency.value);
  const icy=p.inbound_icy?.y||[];
  if(!icy.some(v=>Math.round(v)===1780)||!icy.some(v=>Math.round(v)===1016))issues.push(run.scope+'/home: ICY closed-month history missing; y='+JSON.stringify(icy));
  const stock=p.stock?.y||[];
  if(!stock.some(v=>Math.round(v)===2905)||!stock.some(v=>Math.round(v)===1631))issues.push(run.scope+'/home: Stock closed-month history missing; y='+JSON.stringify(stock));
  if(stock.at(-1)===0)issues.push(run.scope+'/home: Stock missing MTD is rendered as zero');
  const eloX=run.homeMomentum.season?.elo?.x||[];
  const perfX=run.homeMomentum.season?.performance?.x||[];
  if(eloX.length&&Math.max(...eloX)<65)issues.push(run.scope+'/home: Season ELO appears stale before September; last day offset='+Math.max(...eloX));
  if(perfX.length&&Math.max(...perfX)<65)issues.push(run.scope+'/home: Season Performance appears stale before September; last day offset='+Math.max(...perfX));
}
report.issues=issues;
report.finished_at=new Date().toISOString();
fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
const md=['# Performance Arena production smoke audit','',
'Run: '+report.finished_at,'URL: '+BASE,'',
'## Summary','',
'- Runs: '+report.runs.length,
'- Issues: '+issues.length,'',
'## Issues','',
...(issues.length?issues.map(x=>'- '+x):['- No automated smoke-test issues detected.']),'',
'## Coverage','',
...report.runs.map(r=>'- '+r.scope+' · '+r.profile+' · '+r.viewport.width+'×'+r.viewport.height+' · '+Object.keys(r.pages||{}).join(', '))
];
fs.writeFileSync(path.join(OUT,'report.md'),md.join('\n'));
console.log(md.join('\n'));
if(report.runs.some(r=>!r.login_ok))process.exitCode=2;
