import './style.css';
import { CONFIG } from './config.js';
import { createTrack, addShortcut } from './track.js';
import { Game } from './game.js';
import { WorldRenderer } from './renderer.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
const track=createTrack();addShortcut(track);
const game=new Game(track);
const audio=new AudioEngine();
const keys=new Set();
const canvas=document.querySelector('#game-canvas');
let world,ui;
const input=()=>({accel:keys.has('KeyW')||keys.has('ArrowUp'),brake:keys.has('KeyS')||keys.has('ArrowDown'),steer:(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0),drift:keys.has('Space')});
const start=()=>{keys.clear();audio.unlock().catch(()=>{});game.start();};
try{
  world=new WorldRenderer(canvas,track);
  ui=new UI({start,restart:start,pause:()=>game.pause(),resume:()=>{if(game.state==='paused')game.pause();},sound:()=>audio.toggle(),debug:()=>{game.debug=!game.debug;}},track);
  window.addEventListener('resize',()=>world.resize());
  window.addEventListener('keydown',e=>{
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code)&&e.code!=='Tab')e.preventDefault();
    if(e.repeat)return;
    if(e.code==='Escape'){game.pause();keys.clear();}
    else if(e.code==='Enter'&&(game.state==='menu'||game.state==='finished'))start();
    else if(e.code==='KeyR'&&game.state==='racing')pendingRecover=true;
    else if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&game.state==='racing')pendingItem=true;
    else if(e.code==='F3'){e.preventDefault();game.debug=!game.debug;}
    else if(e.code==='KeyH')ui.toggleHelp();
    keys.add(e.code);
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  const blur=()=>{keys.clear();if(game.state==='racing'||game.state==='countdown')game.pause();};
  window.addEventListener('blur',blur);document.addEventListener('visibilitychange',()=>{if(document.hidden)blur();});
  let previous=performance.now(),accumulator=0,pendingRecover=false,pendingItem=false,frames=0,frameTime=0,fps=60,lastCount=4;
  function frame(now){
    const wallDelta=(now-previous)/1000;const dt=Math.min(wallDelta,CONFIG.maxFrameDelta);previous=now;accumulator+=dt;
    while(accumulator>=CONFIG.fixedStep){const controls=input();controls.recover=pendingRecover;controls.useItem=pendingItem;pendingRecover=false;pendingItem=false;game.update(CONFIG.fixedStep,controls);accumulator-=CONFIG.fixedStep;}
    const count=Math.ceil(game.countdown);if(game.state==='countdown'&&count!==lastCount){audio.tone(320,.1);lastCount=count;}
    for(const e of game.events.splice(0)){audio.event(e);if(e==='lap')ui.notify('LAP COMPLETE · 次のラップへ');if(e==='recover')ui.notify('BACK ON TRACK · コースに復帰');if(e==='gate')ui.notify('ENERGY ACQUIRED · Shift で使用');if(e==='blocked')ui.notify('ARC SHIELD · 妨害を防御');if(e==='snared')ui.notify('GRAVITY SNARE · 一時減速');if(e==='driftBoost')ui.notify('DRIFT RELEASE · チャージブースト');}
    audio.update(game);world.render(game,dt);
    frames++;frameTime+=wallDelta;if(frameTime>=.5){fps=Math.round(frames/frameTime);frames=0;frameTime=0;}
    ui.update(game,{fps,drawCalls:world.renderer?.info?.render?.calls??0});
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Inspectable race state. Mutating test helpers exist only in explicit local ?test=1 mode.
  window.aeroforge={snapshot:()=>game.snapshot(),get stats(){return {fps,drawCalls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles,renderScale:world.renderScale,softwareGPU:world.softwareGPU};}};
  if(import.meta.env.DEV&&new URLSearchParams(location.search).has('test'))window.__game={game,track,world,input,keys,step:(frames=1,controls={})=>{for(let i=0;i<frames;i++)game.update(CONFIG.fixedStep,controls);}};
}catch(error){console.error(error);const el=document.querySelector('#fatal-error');if(el){el.hidden=false;el.textContent='3D画面を開始できませんでした。WebGLが有効なブラウザで開いてください。 '+error.message;}}
