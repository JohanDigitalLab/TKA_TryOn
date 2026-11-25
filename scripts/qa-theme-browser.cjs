// Optional local Playwright only; external requests are mocked BEFORE network.
const { chromium } = require('../.local/qa-browser/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.THEME_QA_URL || 'http://127.0.0.1:3100';
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'theme@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const session = { access_token: 'synthetic-theme-qa-token', refresh_token: 'synthetic-refresh-token', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user };
const report = { scope: 'Local production UI, mocked authentication/data; no real external requests', cases: [], contrast: [] };
const paths = ['/', '/login', '/register', '/school/register', '/student', '/student/exercise', '/student/tryout', '/student/subjects', '/student/missions', '/student/assignments', '/student/agenda', '/student/results', '/student/challenge', '/school', '/school/manage', '/school/messages', '/school/agenda', '/teacher', '/admin', '/admin/questions', '/admin/questions/detail', '/admin/import', '/admin/schools', '/admin/subscriptions', '/subscription'];
async function run() {
 const browser = await chromium.launch({headless:true});
 try {
 for (const mode of ['light','dark']) {
  const context = await browser.newContext({colorScheme:mode,viewport:{width:1440,height:1000},serviceWorkers:'block'});
  const errors=[];
  await context.addInitScript(({session})=>{
   // Supabase project-specific storage key is supplied by a mocked login below.
   window.__themeQaSession=session;
   sessionStorage.setItem('tryon-exam-config',JSON.stringify({source:'server',attemptType:'TRYOUT',tka_code:'QA',subjects:['Matematika']}));
  },{session});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===base) return route.continue();
   const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(url.pathname.endsWith('/auth/v1/token'))return json(session);
   if(url.pathname.endsWith('/auth/v1/user'))return json(user);
   if(url.pathname.endsWith('/auth/v1/logout'))return json({});
   if(url.pathname.includes('/rest/v1/profiles'))return json({full_name:'Theme QA',education_level:'SD',grade:6,profile_completed:true,role:'super_admin'});
   if(url.pathname.endsWith('/rpc/start_tka_tryout'))return json({attempt_id:'00000000-0000-4000-8000-000000000002',subject_name:'Matematika',grade:6,remaining_seconds:3600,questions:[{question_id:'q1',question_order:1,question_type:'PG_TUNGGAL',question_text:'Berapakah hasil dari 2 + 2?',options:[{option_code:'A',option_text:'Empat'},{option_code:'B',option_text:'Lima'}]}]});
   if(url.pathname.endsWith('/rpc/get_student_history')||url.pathname.endsWith('/rpc/get_student_tryout_history'))return json([{attempt_id:'qa-history',subject_name:'Matematika',grade:6,status:'submitted',score:80,total_questions:10,correct_answers:8,submitted_at:new Date().toISOString()}]);
   if(url.pathname.endsWith('/rpc/school_portal_context'))return json({memberships:[],invitations:[],applications:[]});
   if(url.pathname.includes('/rpc/'))return json([]);
   return json([]);
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/hydration|Minified React/i.test(m.text()))errors.push(m.text())});
  const check=async(name,fn)=>{try{await fn();report.cases.push({mode,name,status:'PASS'})}catch(e){report.cases.push({mode,name,status:'FAIL',error:e.message})}};
  await check('system theme and pre-hydration paint',async()=>{
   await page.goto(base,{waitUntil:'networkidle'});
   assert.equal(await page.locator('html').getAttribute('data-theme'),mode);
   await page.route('**/*.js',r=>r.abort());
   await page.reload({waitUntil:'domcontentloaded'});
   assert.equal(await page.locator('html').getAttribute('data-theme'),mode);
   await page.unroute('**/*.js');
   await page.reload({waitUntil:'networkidle'});
  });
  await check('toggle, refresh, navigation and system override',async()=>{
   const target=mode==='light'?'dark':'light';
   const before=await page.locator('h1').boundingBox();
   await page.locator('.theme-toggle:visible').click();
   assert.equal(await page.locator('html').getAttribute('data-theme'),target);
   assert.equal(await page.evaluate(()=>localStorage.getItem('tryon-theme')),target);
   assert.deepEqual(await page.locator('h1').boundingBox(),before);
   await page.reload({waitUntil:'networkidle'});
   assert.equal(await page.locator('html').getAttribute('data-theme'),target);
   await page.emulateMedia({colorScheme:mode});
   await page.goto(base+'/login',{waitUntil:'networkidle'});
   assert.equal(await page.locator('html').getAttribute('data-theme'),target);
   await page.locator('.theme-toggle:visible').click();
  });
  await check('mocked login, logout and relogin retain preference',async()=>{
   const login=async()=>{
    await page.goto(base+'/login',{waitUntil:'networkidle'});
    await page.getByLabel('Email',{exact:true}).fill(user.email);
    await page.getByLabel('Password',{exact:true}).fill('Synthetic-password-123');
    await page.getByRole('button',{name:'Masuk',exact:true}).click();
    await page.waitForURL(u=>!u.pathname.startsWith('/login'));
    await page.waitForTimeout(200);
   };
   await login();
   await page.goto(base+'/student',{waitUntil:'networkidle'});
   assert.equal(await page.locator('html').getAttribute('data-theme'),mode);
   await page.getByRole('button',{name:'Keluar dari akun'}).click();
   await page.waitForURL(base+'/');
   assert.equal(await page.evaluate(()=>localStorage.getItem('tryon-theme')),mode);
   await login();
   assert.equal(await page.locator('html').getAttribute('data-theme'),mode);
  });
  for(const path of paths) await check('route '+path,async()=>{
   errors.length=0;
   const response=await page.goto(base+path,{waitUntil:'networkidle'});
   assert.equal(response.status(),200);
   assert.equal(await page.locator('html').getAttribute('data-theme'),mode);
   assert.equal(await page.locator('.theme-toggle:visible').count(),1);
   const control=page.locator('.theme-toggle-floating');
   await control.click();
   assert.equal(await page.locator('html').getAttribute('data-theme'),mode==='light'?'dark':'light');
   await control.click();
   assert.equal(await page.locator('html').getAttribute('data-theme'),mode);
   await page.mouse.move(0,0);
   assert.deepEqual(errors,[]);
   if(path==='/student/challenge')assert.ok(await page.getByText('Berapakah hasil dari 2 + 2?',{exact:true}).isVisible());
   // Capture computed text/background pairs for visual review. Ignore disabled/hidden text.
   const issues=await page.evaluate(()=>{
    const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number);
    const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    const issues=[];
    for(const e of document.querySelectorAll('body *')){
     if(!e.firstChild||e.firstChild.nodeType!==3||!e.textContent.trim()||e.closest('button:disabled,[aria-hidden="true"],.sr-only,svg,script,style'))continue;
     if(!e.getClientRects().length)continue;
     const s=getComputedStyle(e);if(s.visibility==='hidden')continue;
     let bg=null;
     // Current application gradients use the fixed lime/pink palette. Both endpoints
     // are checked conservatively; transparent layers are composited over ancestors.
     let layers=[];
     for(let n=e;n;n=n.parentElement){
      const ns=getComputedStyle(n);
      if(ns.backgroundImage.includes('gradient')) {
       const root=getComputedStyle(document.documentElement);
       const ends=['--primary','--secondary'].map(k=>rgb(root.getPropertyValue(k).trim().replace(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i,(_,r,g,b)=>`rgb(${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)})`)));
       bg=ends.sort((a,b)=>lum(a)-lum(b))[0];break;
      }
      const c=rgb(ns.backgroundColor);
      if(c.length>=3&&(c[3]===undefined||c[3]===1)){bg=c;break}
      if(c[3]>0)layers.push(c);
     }
     if(bg)for(const c of layers.reverse())bg=bg.map((v,i)=>i<3?c[i]*c[3]+v*(1-c[3]):1);
     if(!bg)continue;
     const fg=rgb(s.color);const ratio=(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);
     const size=parseFloat(s.fontSize),large=size>=24||(size>=18.66&&Number(s.fontWeight)>=700);
     if(ratio<(large?3:4.5))issues.push({text:e.textContent.trim().slice(0,60),class:e.className,ratio:Math.round(ratio*100)/100});
    }
    return issues;
   });
   if(issues.length)report.contrast.push({mode,path,issues});
   if(['/','/student','/admin','/student/challenge'].includes(path))await page.screenshot({path:'.local/theme-audit/tryon-'+mode+'-'+(path==='/'?'landing':path.slice(1).replaceAll('/','-'))+'.png',fullPage:true});
  });
  await check('mobile theme control and overflow',async()=>{
   await page.setViewportSize({width:390,height:844});
   for(const path of paths){
    await page.goto(base+path,{waitUntil:'networkidle'});
    assert.equal(await page.locator('.theme-toggle:visible').count(),1);
    const control=page.locator('.theme-toggle-floating');
    const box=await control.boundingBox();
    assert.ok(box && box.x>=0 && box.y>=0 && box.x+box.width<=390 && box.y+box.height<=844,path+' control outside viewport');
    await control.click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),mode==='light'?'dark':'light');
    await control.click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path+' overflow');
   }
  });
  await context.close();
 }
 }finally{await browser.close();fs.writeFileSync('.local/theme-audit/browser-report.json',JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report,null,2));
 if(report.cases.some(c=>c.status==='FAIL') || report.contrast.length)process.exitCode=1;
}
run().catch(e=>{console.error(e);process.exitCode=1});
