import {browserOptions} from './browser-options.js';
// Real-time browser play: observed game state guides only Playwright keyboard input.
// No transforms, progress, race clock or physics are injected during the race.
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch(browserOptions);
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173/?test=1');await page.waitForFunction(()=>window.__game);
await page.waitForTimeout(1600);await page.locator('[data-action="start"]').click();
await page.waitForFunction(()=>window.aeroforge.snapshot().state==='racing');
const held=new Set(),history=[];let lastLap=0,lastShot=0,uses=0;const began=Date.now();
try{
  for(let frame=0;frame<3000;frame++){
    const view=await page.evaluate(()=>{
      const {game,track}=window.__game,p=game.racers[0];
      const target=track.sample(p.s+10+Math.max(0,p.speed)*.43);
      const desired=Math.atan2(target.x-p.x,target.z-p.z),error=Math.atan2(Math.sin(desired-p.heading),Math.cos(desired-p.heading));
      const curve=track.sample(p.s+20).curvature;
      return {state:game.state,snapshot:game.snapshot(),stats:window.aeroforge.stats,error,curve,speed:p.speed,item:p.item,falling:p.falling,time:game.elapsed,offroad:p.offroad};
    });
    if(view.state==='finished'){history.push(view);break;}
    if(view.state==='paused'){await page.keyboard.press('Escape');continue;}
    let targetSpeed=Math.min(40,Math.sqrt(14/Math.max(.008,view.curve)));
    if(Math.abs(view.error)>.8)targetSpeed=Math.min(targetSpeed,20);
    const wanted=new Set();
    if(view.speed<targetSpeed)wanted.add('KeyW');
    if(view.speed>targetSpeed+4)wanted.add('KeyS');
    if(view.error>.045)wanted.add('KeyA');else if(view.error<-.045)wanted.add('KeyD');
    for(const key of held)if(!wanted.has(key)){await page.keyboard.up(key);held.delete(key);}
    for(const key of wanted)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
    if(view.item&&!view.falling){await page.keyboard.press('ShiftLeft');uses++;}
    if(frame%30===0){history.push(view);console.log(JSON.stringify({time:view.time,lap:view.snapshot.racers[0].lap,rank:view.snapshot.racers[0].rank,speed:Math.round(view.speed),fps:view.stats.fps,recoveries:view.snapshot.racers[0].recoveries}));}
    if(view.snapshot.racers[0].lap!==lastLap){lastLap=view.snapshot.racers[0].lap;await page.screenshot({path:`artifacts/play-lap-${lastLap}.png`,timeout:10000}).catch(()=>{});}
    await page.waitForTimeout(70);
    if(Date.now()-began>290000)throw new Error('Real-time playthrough exceeded 290 seconds');
  }
  for(const key of held)await page.keyboard.up(key);
  const snapshot=await page.evaluate(()=>window.aeroforge.snapshot());await page.waitForTimeout(300);await page.screenshot({path:'artifacts/play-finish.png',timeout:15000});
  const fps=history.filter(x=>x.time>8).map(x=>x.stats.fps).sort((a,b)=>a-b);
  const report={snapshot,wallSeconds:(Date.now()-began)/1000,keyboardItemUses:uses,fpsMedian:fps[Math.floor(fps.length/2)],fpsMinimum:fps[0],errors,history};
  await writeFile('artifacts/playthrough-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,history:undefined},null,2));
  if(snapshot.state!=='finished'||errors.length)process.exitCode=1;
}finally{await browser.close();}
