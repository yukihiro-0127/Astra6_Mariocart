import { angleDiff, clamp, wrap } from './track.js';
export function aiInput(r,game,dt){
  const track=game.track,p=track.projectRacer(r),look=9+Math.max(0,r.speed)*.43;
  let target=track.sample(r.s+look),lane=r.personality==='stable'?0:r.personality==='aggressive'?2:-2;
  for(const other of game.racers){if(other===r)continue;const ahead=wrap(other.s-r.s,track.length);if(ahead<22&&ahead>0&&Math.hypot(other.x-r.x,other.z-r.z)<35)lane=(p.lateral<=0?-1:1)*5;}
  for(const trap of game.traps??[])if(Math.hypot(trap.x-target.x,trap.z-target.z)<12)lane=p.lateral<=0?-5:5;
  if(r.personality==='stable')lane*=.5;
  const branch=game.features&&track.shortcut;
  if(branch){
    const approach=wrap(branch.start-r.s,track.length);
    if(approach<40&&r.shortcutDecisionLap!==r.lap){
      r.shortcutDecisionLap=r.lap;
      const chance=r.personality==='fast'?.70:r.personality==='aggressive'?.4:r.personality==='player'?0:.08;
      r.shortcutChoice=(game.random??Math.random)()<chance;
    }
    if(r.shortcutChoice&&((r.s>branch.start-28&&r.s<branch.end)||p.shortcut)){
      const branchDistance=(r.s-branch.start)/(branch.end-branch.start)*branch.length;
      target=branch.sample(clamp(branchDistance+look,0,branch.length));lane=0;
      if(p.shortcut&&!r.wasOnShortcut){r.shortcutsTaken++;r.wasOnShortcut=true;}
    }else if(r.s>=branch.end){r.shortcutChoice=false;r.wasOnShortcut=false;}
  }
  target={...target,x:target.x+target.nx*lane,z:target.z+target.nz*lane};
  const desired=Math.atan2(target.x-r.x,target.z-r.z),error=angleDiff(desired,r.heading);
  const curvature=p.shortcut?.01:track.sample(r.s+18).curvature;
  let targetSpeed=Math.min(37,Math.sqrt(14/Math.max(.008,curvature)));
  const gap=game.racers[0].progress-r.progress,rubber=clamp(gap/450,-.06,.07);
  targetSpeed*=1+rubber;
  if(r.personality==='fast')targetSpeed*=curvature<.012?1.09:1.05;
  if(r.personality==='aggressive')targetSpeed*=1.015;
  if(p.shortcut)targetSpeed=Math.min(targetSpeed,34);
  if(Math.abs(error)>.8)targetSpeed=Math.min(targetSpeed,19);
  // The fast pilot occasionally overcommits on a corner; errors stay recoverable.
  const wobble=r.personality==='fast'&&curvature>.02?Math.sin(game.elapsed*1.3)*.13:0;
  r.stuckTime=r.speed<3?r.stuckTime+dt:0;
  return {accel:r.speed<targetSpeed,brake:r.speed>targetSpeed+3,steer:clamp(error*2.4+wobble,-1,1),drift:false,speedFactor:1+rubber,recover:r.stuckTime>3};
}
