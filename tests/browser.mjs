import {browserOptions} from './browser-options.js';
import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch(browserOptions);
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:5173/'+(process.env.PROTOTYPE?'prototype.html':'')+'?test=1');
await page.waitForFunction(()=>window.__game,{timeout:20000});
await page.waitForTimeout(1200);
await page.screenshot({path:'artifacts/menu.png'});
const checks=[];
function check(name,pass,details){checks.push({name,pass,details});if(!pass)console.error('FAIL',name,details);else console.log('PASS',name);}
await page.keyboard.press('Enter');
await page.waitForFunction(()=>window.aeroforge.snapshot().state==='racing',{timeout:7000});
await page.keyboard.down('KeyW');await page.waitForTimeout(1500);await page.keyboard.up('KeyW');
let s=await page.evaluate(()=>window.aeroforge.snapshot());check('Keyboard acceleration',s.racers[0].speed>12,s.racers[0]);
const previousSpeed=s.racers[0].speed;
await page.keyboard.down('KeyS');await page.waitForTimeout(600);await page.keyboard.up('KeyS');
s=await page.evaluate(()=>window.aeroforge.snapshot());check('Keyboard brake',s.racers[0].speed<previousSpeed-8,s.racers[0]);
await page.keyboard.down('KeyW');await page.waitForTimeout(700);
let heading=(await page.evaluate(()=>window.aeroforge.snapshot())).player.heading;
await page.keyboard.down('KeyD');await page.waitForTimeout(300);await page.keyboard.up('KeyD');await page.keyboard.up('KeyW');
s=await page.evaluate(()=>window.aeroforge.snapshot());check('Keyboard steering',Math.abs(s.player.heading-heading)>.1,{before:heading,after:s.player.heading});
await page.keyboard.press('Escape');const paused=await page.evaluate(()=>window.aeroforge.snapshot());await page.waitForTimeout(200);
s=await page.evaluate(()=>window.aeroforge.snapshot());check('Pause freezes race',s.state==='paused'&&s.elapsed===paused.elapsed,s.state);await page.keyboard.press('Escape');
const simulation=await page.evaluate(async()=>{
  const {game,track}=window.__game;
  const {aiInput}=await import('/src/ai.js');
  game.reset('racing');const minCPUSpeed=[];let steps=0;
  for(;steps<60*220&&game.state==='racing';steps++){game.update(1/60,aiInput(game.racers[0],game,1/60));if(steps>180)minCPUSpeed.push(game.racers[1].speed);}
  return {snapshot:game.snapshot(),cpuMin:Math.min(...minCPUSpeed),steps};
});
check('Physically driven full race',simulation.snapshot.racers[0].finished,simulation);
check('CPU keeps moving',simulation.cpuMin>2&&simulation.snapshot.racers[1].progress>500,simulation.cpuMin);
await page.waitForTimeout(300);
await page.screenshot({path:'artifacts/result.png',timeout:60000});
const invalidLap=await page.evaluate(()=>{const{game,track}=window.__game;game.reset('racing');const r=game.racers[0];let p=track.sample(track.length-1);r.x=p.x;r.z=p.z;r.s=p.s;r.previousS=p.s;r.speed=20;r.heading=r.velocityHeading=Math.atan2(p.tx,p.tz);for(let i=0;i<30;i++)game.update(1/60,{accel:true});return game.snapshot();});
check('Skipping checkpoints cannot finish',!invalidLap.racers[0].finished&&invalidLap.racers[0].checkpoint===0,invalidLap.racers[0]);
const reverse=await page.evaluate(()=>{const{game,track}=window.__game;game.reset('racing');const r=game.racers[0];const p=track.sample(100);Object.assign(r,{x:p.x,z:p.z,s:p.s,previousS:p.s,heading:Math.atan2(p.tx,p.tz),velocityHeading:Math.atan2(p.tx,p.tz),speed:-8});for(let i=0;i<60;i++)game.update(1/60,{brake:true});return game.snapshot();});
check('Reverse travel detected',reverse.player.wrongWay,reverse);
const fall=await page.evaluate(()=>{const{game,track}=window.__game;game.reset('racing');const r=game.racers[0],p=track.sample(track.length*.7);Object.assign(r,{x:p.x+p.nx*16,z:p.z+p.nz*16,s:p.s,previousS:p.s,speed:15,heading:Math.atan2(p.tx,p.tz),velocityHeading:Math.atan2(p.tx,p.tz)});game.update(1/60,{});const fell=r.falling;for(let i=0;i<100;i++)game.update(1/60,{});return{fell,snapshot:game.snapshot()};});
check('Fall and automatic recovery',fall.fell&&!fall.snapshot.racers[0].falling&&fall.snapshot.racers[0].recoveries>0,fall);
await page.evaluate(()=>{const{game}=window.__game;game.reset('racing');});
await page.keyboard.down('KeyW');await page.waitForTimeout(1100);await page.keyboard.press('KeyR');await page.keyboard.up('KeyW');await page.waitForTimeout(100);
s=await page.evaluate(()=>window.aeroforge.snapshot());check('R recovery keyboard',s.racers[0].recoveries>0,s.racers[0]);
await page.screenshot({path:'artifacts/racing.png'});
if(!process.env.PROTOTYPE){
  await page.evaluate(()=>{const{game,track}=window.__game;game.reset('racing');const r=game.racers[0],p=track.sample(190);Object.assign(r,{x:p.x,z:p.z,y:p.y+.75,s:p.s,previousS:p.s,progress:p.s,heading:Math.atan2(p.tx,p.tz),velocityHeading:Math.atan2(p.tx,p.tz),speed:26});});
  await page.keyboard.down('KeyW');await page.keyboard.down('KeyD');await page.keyboard.down('Space');await page.waitForTimeout(1050);
  let drift=await page.evaluate(()=>window.aeroforge.snapshot());check('Space charges physical drift',drift.player.driftCharge>=.85,drift.player);
  await page.keyboard.up('Space');await page.keyboard.up('KeyD');await page.waitForFunction(()=>window.aeroforge.snapshot().player.boost>0,{},{timeout:3000});await page.keyboard.up('KeyW');
  drift=await page.evaluate(()=>window.aeroforge.snapshot());check('Drift release grants boost',drift.player.boost>.5,drift.player);
  await page.screenshot({path:'artifacts/drift-boost.png'});
  for(const item of ['pulse','shield','snare','vector']){
    await page.evaluate(item=>{const{game,track}=window.__game;game.reset('racing');const r=game.racers[0],p=track.sample(40);Object.assign(r,{x:p.x,z:p.z,y:p.y+.75,s:p.s,previousS:p.s,progress:p.s,heading:Math.atan2(p.tx,p.tz),velocityHeading:Math.atan2(p.tx,p.tz),speed:15,item});},item);
    await page.keyboard.press('ShiftLeft');await page.waitForTimeout(100);
    const result=await page.evaluate(()=>{const{game}=window.__game,r=game.racers[0];return{item:r.item,used:r.itemsUsed,boost:r.boostTimer,shield:r.shieldTimer,traps:game.traps.length,s:r.s};});
    check('Shift uses '+item,result.item===null&&result.used===1&&(item==='pulse'?result.boost>0:item==='shield'?result.shield>0:item==='snare'?result.traps>0:result.s>65),result);
  }
  await page.keyboard.press('Escape');await page.waitForTimeout(100);await page.locator('[data-ui="pause"] [data-action="restart"]').click();
  const restarted=await page.evaluate(()=>window.aeroforge.snapshot());check('Restart button resets full race',restarted.state==='countdown'&&restarted.racers.length===4&&restarted.racers.every(r=>r.lap===1&&r.progress<0),restarted);
}
await page.keyboard.press('F3');await page.waitForTimeout(100);await page.screenshot({path:'artifacts/debug.png'});
check('No browser console errors',errors.length===0,errors);
const stats=await page.evaluate(()=>window.aeroforge.stats);
await writeFile('artifacts/browser-report.json',JSON.stringify({date:new Date().toISOString(),checks,stats},null,2));
console.log(JSON.stringify({checks:checks.length,passed:checks.filter(c=>c.pass).length,stats,errors},null,2));
await browser.close();if(checks.some(c=>!c.pass))process.exitCode=1;
