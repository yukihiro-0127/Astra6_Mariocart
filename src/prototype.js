// Retained Step 2 review harness: deliberately one lap / two racers / no expansion features.
import { createTrack } from './track.js';
import { Game } from './game.js';
import { WorldRenderer } from './renderer.js';
const track=createTrack(),game=new Game(track,{laps:1,cpuCount:1,features:false}),keys=new Set();
const world=new WorldRenderer(document.querySelector('canvas'),track);
let recovery=false,previous=performance.now(),accumulator=0,fps=60;
const start=()=>{keys.clear();game.start();};document.querySelector('#start').onclick=start;
window.addEventListener('resize',()=>world.resize());
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','F3'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='Enter')start();else if(e.code==='Escape')game.pause();else if(e.code==='KeyR')recovery=true;else if(e.code==='F3')game.debug=!game.debug;keys.add(e.code);});
window.addEventListener('keyup',e=>keys.delete(e.code));
function frame(now){const dt=Math.min(.1,(now-previous)/1000);previous=now;fps+=(1/Math.max(.001,dt)-fps)*.04;accumulator+=dt;while(accumulator>=1/60){game.update(1/60,{accel:keys.has('KeyW')||keys.has('ArrowUp'),brake:keys.has('KeyS')||keys.has('ArrowDown'),steer:(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0),recover:recovery});recovery=false;accumulator-=1/60;}world.render(game,dt);const p=game.racers[0];document.querySelector('#hud').textContent=`AEROFORGE · STEP 2 PROTOTYPE\n${game.state} ${game.state==='countdown'?Math.ceil(game.countdown):''} · LAP ${p.lap}/1 · POSITION ${p.rank}/2\n${Math.round(p.speed*3.6)} km/h · ${p.wrongWay?'WRONG WAY':''}\nWASD / Arrows · R Recover · Esc Pause · Enter Start${game.debug?'\n'+JSON.stringify(game.snapshot(),null,2):''}`;requestAnimationFrame(frame);}requestAnimationFrame(frame);
window.aeroforge={snapshot:()=>game.snapshot(),get stats(){return {fps:Math.round(fps),drawCalls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles};}};
if(import.meta.env.DEV)window.__game={game,track,world};
