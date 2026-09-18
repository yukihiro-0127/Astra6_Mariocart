import { CONFIG, PILOTS } from './config.js';
import { makeRacer, stepPhysics, recover, collideRacers } from './physics.js';
import { aiInput } from './ai.js';
import { updateItems, useItem } from './items.js';
export class Game {
  constructor(track,options={}){this.track=track;this.laps=options.laps??CONFIG.laps;this.cpuCount=options.cpuCount??CONFIG.cpuCount;this.features=options.features??true;this.random=options.random??Math.random;this.debug=false;this.events=[];this.reset('menu');}
  reset(state='countdown'){this.racers=PILOTS.slice(0,this.cpuCount+1).map((p,i)=>makeRacer(p,i,this.track));this.state=state;this.countdown=CONFIG.countdown;this.elapsed=0;this.time=0;this.traps=[];this.finishOrder=[];this.lastLap=0;this.bestLap=null;this.lapTime=0;this.lapStarted=0;this.events=[];this.nextTrapId=0;}
  start(){this.reset('countdown');}
  pause(){if(this.state==='paused'){this.state=this.beforePause??'racing';}else if(this.state==='racing'||this.state==='countdown'){this.beforePause=this.state;this.state='paused';}}
  update(dt,input={}){
    if(this.state==='paused'||this.state==='finished')return;
    this.time+=dt;
    if(this.state==='menu')return;
    if(this.state==='countdown'){this.countdown-=dt;if(this.countdown<=0){this.state='racing';this.events.push('go');}return;}
    this.elapsed+=dt;this.lapTime=this.elapsed-this.lapStarted;
    for(const r of this.racers){
      if(r.finished)continue;
      const controls=r.id==='you'?input:aiInput(r,this,dt);
      if(this.features&&controls.useItem)useItem(r,this);
      if(r.finished)continue;
      if(controls.recover){recover(r,this.track);if(r.id==='you')this.events.push('recover');}
      stepPhysics(r,controls,this.track,dt,this.features);
      this.updateProgress(r,dt);
      if(r.event){if(r.id==='you')this.events.push(r.event);r.event=null;}
    }
    collideRacers(this.racers,dt);this.updateRanks();
    if(this.features&&this.state==='racing')updateItems(this,dt);
  }
  updateProgress(r,dt){
    if(r.falling){return;}
    const L=this.track.length;let delta=r.s-r.previousS;if(delta>L/2)delta-=L;if(delta<-L/2)delta+=L;
    const branch=this.track.shortcut;
    const branchTransition=r.routeTransition&&branch&&r.s>branch.start-30&&r.s<branch.end+30&&r.previousS>branch.start-30&&r.previousS<branch.end+30&&Math.abs(delta)<60;
    r.routeTransition=false;
    // A race step may not teleport across track sectors. Vector uses a swept path separately.
    if(!branchTransition&&Math.abs(delta)>Math.max(8,Math.abs(r.speed)*dt*4+3))return;
    r.previousS=r.s;
    const old=r.progress;r.progress+=delta;
    const base=(r.lap-1)*L;
    const cps=this.track.checkpoints;
    while(r.nextCheckpoint<cps.length&&old<base+cps[r.nextCheckpoint]&&r.progress>=base+cps[r.nextCheckpoint]){
      r.nextCheckpoint++;r.safeS=r.s;r.safeProgress=r.progress;
    }
    if(r.progress>=base+L&&r.nextCheckpoint===cps.length){
      if(r.lap>=this.laps){if(r.id==='you'){this.lastLap=this.elapsed-this.lapStarted;this.bestLap=Math.min(this.bestLap??Infinity,this.lastLap);}r.finished=true;r.finishTime=this.elapsed;this.finishOrder.push(r.id);if(r.id==='you'){this.state='finished';this.events.push('finish');}}
      else{r.lap++;r.nextCheckpoint=0;r.safeS=r.s;r.safeProgress=r.progress;if(r.id==='you'){this.lastLap=this.elapsed-this.lapStarted;this.bestLap=Math.min(this.bestLap??Infinity,this.lastLap);this.lapStarted=this.elapsed;this.events.push('lap');}}
    }
  }
  updateRanks(){const sorted=[...this.racers].sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.progress-a.progress);sorted.forEach((r,i)=>r.rank=i+1);}
  snapshot(){const p=this.racers[0];return {state:this.state,elapsed:+this.elapsed.toFixed(2),laps:this.laps,racers:this.racers.map(r=>({id:r.id,speed:+r.speed.toFixed(2),s:+r.s.toFixed(2),progress:+r.progress.toFixed(2),lap:r.lap,rank:r.rank,checkpoint:r.nextCheckpoint,recoveries:r.recoveries,falling:r.falling,finished:r.finished,item:r.item,itemsUsed:r.itemsUsed,gatesCollected:r.gatesCollected,shortcutsTaken:r.shortcutsTaken})),player:{x:p.x,y:p.y,z:p.z,heading:p.heading,wrongWay:p.wrongWay,driftCharge:p.driftCharge,boost:p.boostTimer,shield:p.shieldTimer},trackLength:this.track.length};}
}
