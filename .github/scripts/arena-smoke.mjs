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
function visible(el){
  const s=getComputedStyle(el),r=el.getBoundingClientRect();
  return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0;
}
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
  await page.waitForTimeout(2500);
}
async function login(page,profile,kind){
  await page.goto(BASE+'?e2e='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  await waitLoginReady(page);
  const pw=await getPasswords(page);
  const pass=kind==='admin'?pw.admin:pw.user;
  if(!pass)throw new Error('Could not discover '+kind+' login password from deployed source');
  await page.selectOption('#loginProfile',{label:kind==='admin'?'Admin':profile});
  await page.fill('#loginPassword',pass);
  await page.click('#loginSubmit');
  await waitApp(page);
}
async function inspect(page,scope,pageName,label){
  const runErrors=[];
  const selector='#nav [data-page="'+pageName+'"]';
  const nav=page.locator(selector).filter({visible:true}).first();
  if(await nav.count()){
    await nav.click().catch(e=>runErrors.push('nav click: '+e.message));
    await page.waitForTimeout(2200);
  } else if(pageName!=='home'){
    runErrors.push('visible nav target missing: '+pageName);
  }
  const state=await page.evaluate(({pageName})=>{
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
    const emptyMajor=[...document.querySelectorAll('#page-'+pageName+' .metric-grid, #page-'+pageName+' .cards, #page-'+pageName+' .enhanced-kpi-grid')].filter(visible).filter(el=>!el.children.length).map(x=>x.id||x.className);
    return {
      rootVisible,fatal:fatalVisible||null,visibleErrors,loading,canvases,badCanvas,buttons,selects,
      viewportOverflow,emptyMajor,textSample:text.slice(0,800),
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
    for(const p of pages)result.pages[p]=await inspect(page,scope,p,profile);
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
  await runRole(browser,{scope:'desktop-julie',kind:'user',profile:'JulieH',pages:['home','personal','leaderboard'],viewport:{width:1440,height:1100}});
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
