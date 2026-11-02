const {chromium}=require('../frontend/node_modules/@playwright/test');
const {spawn}=require('child_process');const fs=require('fs');
const path=require('path'),os=require('os');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'skydark-ui-'));
const artifacts=process.env.SKYDARK_UI_ARTIFACTS;
if(artifacts)fs.mkdirSync(artifacts,{recursive:true});
const api=spawn(process.execPath,['server.js'],{cwd:root+'/standalone',env:{...process.env,SKYDARK_DB_PATH:path.join(temp,'test.db')},stdio:'ignore'});
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{cwd:root+'/frontend',env:{...process.env,VITE_STANDALONE:'true'},stdio:'ignore'});
(async()=>{let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:5173/skydark/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
 const errors=[];
 for(const [w,h] of [[320,568],[390,844],[667,375],[768,1024],[1024,768],[1440,900]]){
  const context=await browser.newContext({viewport:{width:w,height:h},isMobile:w<768,hasTouch:w<=1024,timezoneId:'America/Detroit'});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const route of ['calendar','tasks','lists','meals','shopping','rewards','photos','settings']){
   await page.goto('http://127.0.0.1:5173/skydark/#/'+route);await page.waitForSelector('main');await page.waitForTimeout(180);
   const sizes=await page.evaluate(()=>({width:innerWidth,body:document.documentElement.scrollWidth}));if(sizes.body>sizes.width+2)errors.push(`${w} ${route} horizontal overflow: ${sizes.body}`);
   if(artifacts&&['calendar','settings','meals'].includes(route)&&[390,1440].includes(w))await page.screenshot({path:path.join(artifacts,`skydark-${route}-${w}.png`)});
  }
  await page.goto('http://127.0.0.1:5173/skydark/#/calendar');await page.getByRole('button',{name:'Add event',exact:true}).click();await page.getByRole('textbox',{name:'Event title'}).fill(`UI test ${w}`);await page.getByRole('button',{name:'Add',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
  // Day/week/month remain reachable on every screen; +more opens the actual day.
  for(const mode of ['month','week','day','agenda']) {
    await page.getByLabel('Calendar view').selectOption(mode);
    await page.waitForTimeout(100);
    if(await page.getByText('This section failed to load.').count())errors.push(`${w} ${mode} crashed`);
  }
  if(w===390){
    await page.getByRole('button',{name:'Add event',exact:true}).click();
    await page.getByRole('textbox',{name:'Event title'}).fill('Failed save draft');
    await page.route('**/api/ws',async route=>{const body=route.request().postDataJSON(); if(body.service==='add_event')await route.fulfill({json:{success:false,error:{message:'Test save failed'}}});else await route.continue();});
    await page.getByRole('button',{name:'Add',exact:true}).tap();
    await page.getByRole('alert').filter({hasText:'Test save failed'}).waitFor();
    if(await page.getByRole('textbox',{name:'Event title'}).inputValue()!=='Failed save draft')errors.push('Draft lost after failed save');
    await page.unroute('**/api/ws');await page.getByRole('button',{name:'Close',exact:true}).tap();
    await page.goto('http://127.0.0.1:5173/skydark/#/meals');
    await page.getByRole('button',{name:'Breakfast + Add meal',exact:true}).first().tap();
    await page.getByRole('button',{name:'+ Add Meal',exact:true}).tap();
    await page.getByPlaceholder('e.g. Spaghetti Bolognese').fill('Test meal');
    await page.getByRole('button',{name:'Add',exact:true}).tap();
    await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
    await page.getByRole('button',{name:'Breakfast Test meal',exact:true}).first().waitFor();
  }
  if(w<768){await page.getByRole('button',{name:'More navigation'}).tap();await page.getByRole('dialog').getByRole('link',{name:'Settings'}).tap();await page.getByRole('button',{name:'Calendar',exact:true}).tap();await page.getByText('Refresh calendars',{exact:true}).waitFor();}
  // Developer settings show the version from manifest.json; toggles keep their shape on touch screens.
  await page.goto('http://127.0.0.1:5173/skydark/#/settings');await page.getByRole('button',{name:'Developer',exact:true}).click();
  const manifestVersion=JSON.parse(fs.readFileSync(root+'/custom_components/skydark_calendar/manifest.json','utf8')).version;
  const shown=(await page.getByTestId('panel-version').textContent()).trim();if(shown!==manifestVersion)errors.push(`${w} panel version ${shown} != manifest ${manifestVersion}`);
  const sw=page.getByRole('switch',{name:'Show grid overlay'});const box=await sw.boundingBox();if(!box||box.height>32||box.width<40)errors.push(`${w} toggle distorted: ${JSON.stringify(box)}`);
  await sw.click();if(await sw.getAttribute('aria-checked')!=='true')errors.push(`${w} toggle did not switch on`);await sw.click();
  console.log(`PASS ${w}x${h}: eight routes, event creation${w<768?', touch navigation and sync settings':''}`);
  await context.close();
 }
 console.log(JSON.stringify({errors}));if(errors.length)process.exitCode=1;
}finally{await browser?.close();api.kill();vite.kill();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);api.kill();vite.kill();process.exit(1)});
