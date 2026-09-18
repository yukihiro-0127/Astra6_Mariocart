import { CatmullRomCurve3, Vector3 } from 'three';
import { CONFIG } from './config.js';
export const wrap = (s, length) => ((s % length) + length) % length;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const angleDiff = (a, b) => Math.atan2(Math.sin(a-b), Math.cos(a-b));
export function createTrack() {
  const points = [[0,130],[0,25],[20,-62],[90,-90],[132,-163],[220,-186],[278,-131],[245,-64],[160,-22],[230,35],[288,125],[232,204],[126,234],[37,218]].map(([x,z])=>new Vector3(x,0,z));
  const curve = new CatmullRomCurve3(points,true,'centripetal');
  curve.arcLengthDivisions=2400; curve.updateArcLengths();
  const length=curve.getLength(), count=1000;
  const track={length,samples:[],width:CONFIG.roadWidth,curve};
  function elevation(t) { return 5 * (1-Math.cos(t*Math.PI*2)) + (t>.63 && t<.81 ? 3*Math.sin((t-.63)/.18*Math.PI)**2:0); }
  for(let i=0;i<=count;i++) {
    const t=i/count, p=curve.getPointAt(t), d=curve.getTangentAt(t);
    const d2=curve.getTangentAt(wrap(t+.005,1));
    track.samples.push({x:p.x,z:p.z,y:elevation(t),tx:d.x,tz:d.z,nx:d.z,nz:-d.x,t,s:t*length,width:t>.64&&t<.76?16:CONFIG.roadWidth,guarded:!(t>.655&&t<.745),curvature:Math.abs(angleDiff(Math.atan2(d2.x,d2.z),Math.atan2(d.x,d.z)))/(.005*length)});
  }
  track.sample=(s)=>{
    const p=wrap(s,length)/length*count, i=Math.floor(p), f=p-i, a=track.samples[i], b=track.samples[i+1];
    const r={...a,s:wrap(s,length),t:wrap(s,length)/length};
    for(const k of ['x','y','z','tx','tz','nx','nz','curvature']) r[k]=a[k]+(b[k]-a[k])*f;
    return r;
  };
  track.project=(x,z,includeShortcut=true,route=null)=>{
    let best=null, bestD=Infinity;
    // Spatially compact thousand-sample route: exact segment projection avoids jitter.
    const scan=(samples,shortcut)=>{for(let i=0;i<samples.length-1;i++) {
      const a=samples[i],b=samples[i+1],dx=b.x-a.x,dz=b.z-a.z;
      const f=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1), px=a.x+dx*f,pz=a.z+dz*f;
      const d=(x-px)**2+(z-pz)**2;
      if(d<bestD) {bestD=d;best={...a,x:px,z:pz,y:a.y+(b.y-a.y)*f,s:wrap(a.s+(b.s-a.s)*f,length),t:wrap(a.s+(b.s-a.s)*f,length)/length,lateral:(x-px)*a.nx+(z-pz)*a.nz,distance:Math.sqrt(d),shortcut};}
    }};
    if(route!=='shortcut')scan(track.samples,false); if(includeShortcut&&track.shortcut&&route!=='main') scan(track.shortcut.samples,true);
    return best;
  };
  track.projectRacer=(r,chooseRoute=false)=>{
    if(!track.shortcut)return track.project(r.x,r.z,false);
    const main=track.project(r.x,r.z,false),branch=track.project(r.x,r.z,true,'shortcut'),b=track.shortcut;
    let route=r.route??'main';
    if(chooseRoute){
      const before=route;
      if(route==='main'){
        const deliberate=r.shortcutChoice&&main.s>b.start&&main.s<b.start+30;
        const diverged=main.distance>main.width/2-1&&branch.s>b.start+5&&branch.s<b.end-5;
        if((deliberate||diverged)&&branch.distance<branch.width/2)route='shortcut';
      }else if(branch.s>b.end-22&&main.distance<main.width/2-2){route='main';r.shortcutChoice=false;}
      r.route=route;r.routeTransition=before!==route;
    }
    return route==='shortcut'?branch:main;
  };
  track.checkpoints=Array.from({length:CONFIG.checkpointCount},(_,i)=>(i+1)*length/CONFIG.checkpointCount);
  track.gates=[.085,.30,.54,.82].map(t=>t*length);
  track.jump={start:length*.785,end:length*.8,height:2.3};
  return track;
}
export function addShortcut(track) {
  const start=track.length*.435,end=track.length*.565,a=track.sample(start),b=track.sample(end);
  const curve=new CatmullRomCurve3([new Vector3(a.x,a.y,a.z),new Vector3((a.x+b.x)/2,Math.max(a.y,b.y)+1.8,(a.z+b.z)/2),new Vector3(b.x,b.y,b.z)]);
  const length=curve.getLength(),samples=[];
  for(let i=0;i<=100;i++){const t=i/100,p=curve.getPointAt(t),d=curve.getTangentAt(t);samples.push({x:p.x,y:p.y,z:p.z,tx:d.x,tz:d.z,nx:d.z,nz:-d.x,s:start+(end-start)*t,t:(start+(end-start)*t)/track.length,width:7,guarded:false,curvature:0.01});}
  track.shortcut={start,end,length,width:7,samples,sample(s){const t=clamp(s/length,0,1),i=Math.min(99,Math.floor(t*100)),a=samples[i],b=samples[i+1],f=t*100-i;return {...a,x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:a.z+(b.z-a.z)*f,s:a.s+(b.s-a.s)*f};}};
  // No checkpoint sits inside the optional branch; the next checkpoint validates rejoin.
  track.checkpoints=track.checkpoints.filter(s=>s<start || s>end);
}
