import { CONFIG } from './config.js';
import { clamp, angleDiff, wrap } from './track.js';
export function makeRacer(pilot,index,track) {
  const s=track.length-12-Math.floor(index/2)*8,p=track.sample(s),lane=index%2?3.1:-3.1;
  return {...pilot,x:p.x+p.nx*lane,z:p.z+p.nz*lane,y:p.y+.75,heading:Math.atan2(p.tx,p.tz),velocityHeading:Math.atan2(p.tx,p.tz),speed:0,steer:0,s,previousS:s,progress:s-track.length,lap:1,nextCheckpoint:0,safeS:s,safeProgress:s-track.length,rank:index+1,falling:false,fallTimer:0,verticalSpeed:0,jumpHeight:0,jumpCooldown:0,wrongWay:false,wrongTime:0,offroad:false,finished:false,finishTime:null,drifting:false,driftCharge:0,boostTimer:0,shieldTimer:0,slowTimer:0,immuneTimer:0,recoveries:0,item:null,gateCooldown:0,aiTimer:0,stuckTime:0,shortcutChoice:false,wallHit:0,distanceDriven:0,itemsUsed:0,gatesCollected:0,vectorTimer:0,shortcutDecisionLap:0,shortcutsTaken:0,route:'main',routeTransition:false};
}
export function recover(r,track) {
  const p=track.sample(r.safeS);
  r.x=p.x;r.z=p.z;r.y=p.y+.75;r.s=p.s;r.previousS=p.s;r.progress=r.safeProgress;
  r.heading=r.velocityHeading=Math.atan2(p.tx,p.tz);r.speed=8;r.falling=false;r.fallTimer=0;r.jumpHeight=0;r.verticalSpeed=0;r.wrongWay=false;r.wrongTime=0;r.drifting=false;r.driftCharge=0;r.immuneTimer=1.8;r.recoveries++;r.shortcutChoice=false;r.route='main';r.routeTransition=false;
}
export function stepPhysics(r,input,track,dt,features=true) {
  const P=CONFIG.physics;
  input={accel:false,brake:false,steer:0,drift:false,...input};
  for(const key of ['boostTimer','shieldTimer','slowTimer','immuneTimer','gateCooldown','jumpCooldown','wallHit','vectorTimer']) r[key]=Math.max(0,r[key]-dt);
  if(r.falling){r.fallTimer+=dt;r.verticalSpeed-=P.gravity*dt;r.y+=r.verticalSpeed*dt;r.x+=Math.sin(r.heading)*r.speed*dt;r.z+=Math.cos(r.heading)*r.speed*dt;r.speed*=Math.exp(-dt);if(r.fallTimer>P.recoveryDelay || r.y<P.fallDepth)recover(r,track);return;}
  r.routeTransition=false;
  let road=track.projectRacer(r), speedRatio=clamp(Math.abs(r.speed)/P.maxSpeed,0,1);
  r.offroad=Math.abs(road.lateral)>road.width/2-1.3;
  const drifting=features&&input.drift&&Math.abs(input.steer)>.12&&r.speed>CONFIG.drift.minSpeed&&!r.offroad;
  if(r.drifting&&!drifting){if(r.driftCharge>=CONFIG.drift.chargeTime){r.boostTimer=Math.max(r.boostTimer,CONFIG.drift.boostDuration+(r.driftCharge>1.6?.45:0));r.event='driftBoost';}r.driftCharge=0;}
  r.drifting=drifting;if(drifting)r.driftCharge=Math.min(CONFIG.drift.maxCharge,r.driftCharge+dt);
  const accel=input.accel?P.acceleration:0;
  if(input.brake) r.speed-= (r.speed>1?P.brake:P.acceleration*.6)*dt;
  else if(input.accel)r.speed+=accel*dt;
  else r.speed-=Math.sign(r.speed)*Math.min(Math.abs(r.speed),P.coast*dt);
  r.speed-=r.speed*P.drag*dt;
  const boosted=r.boostTimer>0;
  if(boosted)r.speed+=27*dt;
  const max=(P.maxSpeed+(boosted?15:0))*(input.speedFactor??1)*(r.slowTimer>0?.5:1);
  if(r.speed>max)r.speed=Math.max(max,r.speed-70*dt);
  r.speed=Math.max(-P.reverseMax,r.speed);
  if(r.offroad)r.speed*=Math.exp(-P.offroadDrag*dt);
  r.steer += (input.steer-r.steer)*Math.min(1,dt*12);
  const turn=P.turnRate*(1-.26*speedRatio)*clamp(Math.abs(r.speed)/4,0,1)*(r.speed<0?-1:1);
  r.heading+=r.steer*turn*(drifting?CONFIG.drift.turnMultiplier:1)*dt;
  r.velocityHeading+=angleDiff(r.heading,r.velocityHeading)*Math.min(1,dt*(drifting?3.4:P.grip));
  const dx=Math.sin(r.velocityHeading)*r.speed*dt,dz=Math.cos(r.velocityHeading)*r.speed*dt;
  r.x+=dx;r.z+=dz;r.distanceDriven+=Math.hypot(dx,dz);
  road=track.projectRacer(r,true);
  const edge=Math.abs(road.lateral);
  if(road.guarded&&edge>road.width/2+.35&&edge<road.width/2+8) {
    const side=Math.sign(road.lateral),limit=road.width/2;
    r.x=road.x+road.nx*side*limit;r.z=road.z+road.nz*side*limit;
    r.speed*=Math.exp(-2.8*dt);r.wallHit=.16;
    // Tangential slide with gentle inward bounce, never a hard stop.
    r.x-=road.nx*side*.14;r.z-=road.nz*side*.14;
    const tangent=Math.atan2(road.tx,road.tz)+(r.speed<0?Math.PI:0);
    r.velocityHeading+=angleDiff(tangent,r.velocityHeading)*Math.min(1,dt*5);
  } else if(edge>road.width/2+2.5){r.falling=true;r.fallTimer=0;r.verticalSpeed=0;r.drifting=false;r.driftCharge=0;return;}
  if(features&&track.jump&&road.s>track.jump.start&&road.s<track.jump.end&&!road.shortcut){
    const f=(road.s-track.jump.start)/(track.jump.end-track.jump.start);
    r.jumpHeight=Math.max(r.jumpHeight,f*track.jump.height);
    if(f>.9&&r.jumpCooldown<=0&&r.speed>14){r.verticalSpeed=6.5;r.jumpCooldown=2.5;}
  }
  if(r.jumpHeight>0||r.verticalSpeed>0){r.verticalSpeed-=P.gravity*dt;r.jumpHeight+=r.verticalSpeed*dt;if(r.jumpHeight<=0){r.jumpHeight=0;r.verticalSpeed=0;r.velocityHeading=r.heading;}}
  r.y=road.y+.75+r.jumpHeight;
  r.s=road.s;
  const facing=(Math.sin(r.velocityHeading)*road.tx+Math.cos(r.velocityHeading)*road.tz)*Math.sign(r.speed);
  r.wrongTime=facing<-.3&&Math.abs(r.speed)>3?r.wrongTime+dt:Math.max(0,r.wrongTime-dt*3);
  r.wrongWay=r.wrongTime>.6;
}
export function collideRacers(racers,dt){
  for(let i=0;i<racers.length;i++)for(let j=i+1;j<racers.length;j++){
    const a=racers[i],b=racers[j];if(a.falling||b.falling||Math.abs(a.y-b.y)>2.5)continue;
    let dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d<3&&d>.001){dx/=d;dz/=d;const push=(3-d)*.5;a.x-=dx*push;a.z-=dz*push;b.x+=dx*push;b.z+=dz*push;if(a.immuneTimer<=0&&b.immuneTimer<=0){a.speed*=.985;b.speed*=.985;}}
  }
}
