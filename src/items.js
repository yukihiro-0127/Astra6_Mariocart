import { CONFIG } from './config.js';
import { wrap } from './track.js';
// Small, transparent position bias. Every rank can receive every original item.
export function rollItem(rank,random=Math.random){
  const weights=rank>=3?[.38,.14,.19,.29]:rank===2?[.30,.22,.23,.25]:[.23,.30,.27,.20];
  let value=random();for(let i=0;i<weights.length;i++){value-=weights[i];if(value<0)return ['pulse','snare','shield','vector'][i];}return 'vector';
}
export function useItem(r,game){
  if(!r.item||r.falling||r.finished||game.state!=='racing')return false;
  const type=r.item,track=game.track;
  if(type==='vector'){
    const road=track.projectRacer(r);
    if(road.distance>road.width/2-1||r.jumpHeight>2.5)return false;
    const target=track.sample(r.s+CONFIG.items.vectorDistance);
    // Bound physical displacement as well as along-route distance (especially at branch joins).
    if(Math.hypot(target.x-r.x,target.z-r.z)>CONFIG.items.vectorDistance*1.35)return false;
    const start=r.s;
    for(let d=4;d<CONFIG.items.vectorDistance+4;d+=4){r.s=wrap(start+Math.min(d,CONFIG.items.vectorDistance),track.length);game.updateProgress(r,1/60);if(r.finished)break;}
    r.x=target.x;r.z=target.z;r.y=target.y+.75;r.s=target.s;r.previousS=target.s;r.heading=r.velocityHeading=Math.atan2(target.tx,target.tz);r.jumpHeight=0;r.verticalSpeed=0;r.immuneTimer=.45;
    r.vectorTimer=.32;r.route='main';r.shortcutChoice=false;
  }else if(type==='pulse'){r.boostTimer=Math.max(r.boostTimer,CONFIG.items.pulseDuration);}
  else if(type==='shield'){r.shieldTimer=CONFIG.items.shieldDuration;}
  else if(type==='snare'){
    const x=r.x-Math.sin(r.heading)*4,z=r.z-Math.cos(r.heading)*4,p=track.project(x,z,true,r.route??'main');
    if(p.distance>p.width/2)return false;
    game.traps.push({id:game.nextTrapId++,owner:r.id,x,z,y:p.y,ttl:CONFIG.items.snareDuration,armed:.35,radius:2.25});
  }else return false;
  r.item=null;r.itemsUsed++;if(r.id==='you')game.events.push('item');return true;
}
export function updateItems(game,dt){
  for(const trap of game.traps){
    trap.ttl-=dt;trap.armed-=dt;
    if(trap.armed>0||trap.ttl<=0)continue;
    for(const r of game.racers){
      if(r.falling||r.finished||r.immuneTimer>0||Math.abs(r.y-(trap.y+.75))>2.6)continue;
      if(Math.hypot(r.x-trap.x,r.z-trap.z)<trap.radius+1){
        trap.ttl=0;
        if(r.shieldTimer>0){r.shieldTimer=0;if(r.id==='you')game.events.push('blocked');}
        else{r.slowTimer=CONFIG.items.slowDuration;r.speed*=.62;if(r.id==='you')game.events.push('snared');}break;
      }
    }
  }
  game.traps=game.traps.filter(t=>t.ttl>0);
  for(const r of game.racers){
    if(r.falling||r.finished)continue;
    const road=game.track.projectRacer(r);
    if(!r.item&&r.gateCooldown<=0&&!road.shortcut&&road.distance<road.width/2-1){
      for(const s of game.track.gates){const distance=Math.abs(r.s-s);if(distance<2.5&&Math.abs(r.speed)>2){r.item=rollItem(r.rank,game.random);r.gateCooldown=CONFIG.items.gateCooldown;r.gatesCollected++;if(r.id==='you')game.events.push('gate');break;}}
    }
    if(r.id==='you')continue;
    r.aiTimer-=dt;
    if(r.item&&r.aiTimer<=0){
      r.aiTimer=r.personality==='aggressive'?.45:1.1;
      const behind=game.racers.some(o=>o!==r&&wrap(r.s-o.s,game.track.length)<45);
      const hazard=game.traps.some(t=>Math.hypot(t.x-r.x,t.z-r.z)<24);
      const bend=game.track.sample(r.s+18).curvature;
      const shouldUse=r.item==='pulse'?bend<.025:r.item==='snare'?behind||r.personality==='aggressive':r.item==='shield'?hazard||r.personality==='aggressive':bend<.018;
      if(shouldUse)useItem(r,game);
    }
  }
}
