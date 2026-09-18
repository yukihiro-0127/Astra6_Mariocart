import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createTrack, addShortcut, angleDiff } from '../src/track.js';
import { Game } from '../src/game.js';
import { aiInput } from '../src/ai.js';
import { stepPhysics } from '../src/physics.js';
import { rollItem, useItem, updateItems } from '../src/items.js';

const DT = 1 / 60;
function seeded(seed = 1) {
  let value = seed;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function makeGame(options = {}) {
  const track = createTrack(); addShortcut(track);
  const game = new Game(track, { cpuCount: 0, features: true, random: seeded(), ...options });
  game.state = 'racing';
  return game;
}
function place(game, r, s, lateral = 0) {
  const p = game.track.sample(s);
  Object.assign(r, {
    x: p.x + p.nx * lateral, z: p.z + p.nz * lateral, y: p.y + .75,
    s: p.s, previousS: p.s, progress: s, safeS: p.s, safeProgress: s,
    heading: Math.atan2(p.tx, p.tz), velocityHeading: Math.atan2(p.tx, p.tz),
    nextCheckpoint: game.track.checkpoints.filter(cp => cp <= s).length,
  });
  return r;
}
function stepFor(game, seconds, controls) {
  for (let i = 0; i < seconds / DT; i++) {
    stepPhysics(game.racers[0], controls, game.track, DT, true);
  }
}

test('a sustained physical drift charges and releases a short acceleration burst', () => {
  const game = makeGame(), r = place(game, game.racers[0], 20);
  r.speed = 24;
  stepFor(game, 1, { accel: true, steer: .18, drift: true });
  assert.equal(r.drifting, true);
  assert.ok(r.driftCharge >= CONFIG.drift.chargeTime);
  assert.equal(r.boostTimer, 0);
  const before = r.speed;
  stepFor(game, .2, { accel: true, steer: 0, drift: false });
  assert.equal(r.drifting, false);
  assert.equal(r.driftCharge, 0);
  assert.ok(r.boostTimer > .5);
  assert.ok(r.speed > before + 4);
  const short = makeGame(), q = place(short, short.racers[0], 20);
  q.speed = 24;
  stepFor(short, .2, { accel: true, steer: .18, drift: true });
  stepFor(short, DT, { accel: true, steer: 0 });
  assert.equal(q.boostTimer, 0, 'a brief tap does not grant a charged boost');
});

test('Pulse Boost grants finite extra speed and consumes the inventory slot', () => {
  const game = makeGame(), r = place(game, game.racers[0], 25);
  r.speed = 35; r.item = 'pulse';
  assert.equal(useItem(r, game), true);
  assert.equal(r.item, null);
  assert.equal(r.itemsUsed, 1);
  stepFor(game, .4, { accel: true, steer: 0 });
  assert.ok(r.speed > CONFIG.physics.maxSpeed + 7);
  assert.ok(r.boostTimer < CONFIG.items.pulseDuration && r.boostTimer > 0);
  assert.equal(useItem(r, game), false, 'an empty slot cannot be reused');
});

test('Energy Gates give one item, preserve an occupied slot, and honor the cooldown', () => {
  const game = makeGame({ random: () => 0 }), r = game.racers[0];
  place(game, r, game.track.gates[0]); r.speed = 20;
  updateItems(game, DT);
  assert.equal(r.item, 'pulse');
  assert.equal(r.gatesCollected, 1);
  r.item = 'shield'; r.gateCooldown = 0;
  updateItems(game, DT);
  assert.equal(r.item, 'shield');
  assert.equal(r.gatesCollected, 1);
  r.item = null; r.gateCooldown = 1;
  updateItems(game, DT);
  assert.equal(r.item, null);
  r.gateCooldown = 0;
  updateItems(game, DT);
  assert.equal(r.gatesCollected, 2);
});

test('item draws gently favor low ranks and keep every item possible at every rank', () => {
  const samples = 10000, counts = {};
  for (const rank of [1, 2, 3, 4]) {
    counts[rank] = { pulse: 0, snare: 0, shield: 0, vector: 0 };
    for (let i = 0; i < samples; i++) counts[rank][rollItem(rank, () => (i + .5) / samples)]++;
    for (const count of Object.values(counts[rank])) assert.ok(count > samples * .1);
  }
  const advantageous = rank => counts[rank].pulse + counts[rank].vector;
  assert.ok(advantageous(4) > advantageous(1));
  assert.ok(advantageous(4) < advantageous(1) * 1.7, 'the advantage stays bounded');
  assert.ok(counts[4].snare > 1000 && counts[1].pulse > 2000);
});

test('Gravity Snare slows a kart; Arc Shield absorbs exactly one trap', () => {
  const game = makeGame({ cpuCount: 1 }), owner = game.racers[0], target = game.racers[1];
  place(game, owner, 70); owner.item = 'snare';
  assert.equal(useItem(owner, game), true);
  const trap = game.traps[0];
  Object.assign(target, { x: trap.x, z: trap.z, y: trap.y + .75, speed: 30, item: null });
  updateItems(game, .4);
  assert.ok(target.slowTimer > 1);
  assert.ok(target.speed < 21);
  assert.equal(game.traps.length, 0);

  target.slowTimer = 0; target.speed = 30; target.item = 'shield';
  assert.equal(useItem(target, game), true);
  owner.item = 'snare'; useItem(owner, game);
  updateItems(game, .4);
  assert.equal(target.shieldTimer, 0, 'shield is consumed by one hit');
  assert.equal(target.slowTimer, 0);
  assert.equal(target.speed, 30);
  owner.item = 'snare'; useItem(owner, game);
  updateItems(game, .4);
  assert.ok(target.slowTimer > 0, 'a second hit gets through');
});

test('Vector Swap uses a safe road target and validates checkpoints along its swept route', () => {
  const game = makeGame(), r = game.racers[0];
  const start = game.track.checkpoints[0] - 12;
  place(game, r, start); r.item = 'vector'; r.speed = 20;
  assert.equal(useItem(r, game), true);
  assert.equal(r.nextCheckpoint, 1, 'the crossed checkpoint is visited in order');
  assert.ok(Math.abs(r.progress - start - CONFIG.items.vectorDistance) < .001);
  const road = game.track.project(r.x, r.z);
  assert.ok(road.distance < .01);
  assert.ok(Math.abs(r.y - road.y - .75) < .01);
  assert.equal(r.falling, false);
  assert.equal(r.item, null);

  place(game, r, 35, 16); r.item = 'vector';
  assert.equal(useItem(r, game), false, 'offroad origin is rejected');
  assert.equal(r.item, 'vector', 'failed use preserves the item');
  place(game, r, 35); r.falling = true;
  assert.equal(useItem(r, game), false);
  assert.equal(r.item, 'vector');
});

test('Vector Swap across the finish line counts once and retains lap/checkpoint ordering', () => {
  const game = makeGame(), r = game.racers[0], L = game.track.length;
  place(game, r, L - 12); r.item = 'vector'; r.speed = 20;
  assert.equal(useItem(r, game), true);
  assert.equal(r.lap, 2);
  assert.equal(r.nextCheckpoint, 0);
  assert.equal(r.finished, false);
  assert.ok(Math.abs(r.progress - L - 16) < .001);
  assert.ok(Math.abs(r.s - 16) < .001);
});

test('jump ramp produces airborne motion and a stable landing on the same road', () => {
  const game = makeGame(), r = place(game, game.racers[0], game.track.jump.start - 15);
  r.speed = 30;
  let height = 0, positiveVertical = false;
  for (let i = 0; i < 60 * 4; i++) {
    game.update(DT, aiInput(r, game, DT));
    height = Math.max(height, r.jumpHeight);
    positiveVertical ||= r.verticalSpeed > 0;
  }
  assert.ok(height > 2.5 && positiveVertical, 'ramp produces a small physical jump');
  assert.equal(r.jumpHeight, 0);
  assert.equal(r.verticalSpeed, 0);
  assert.equal(r.falling, false);
  assert.equal(r.recoveries, 0);
  assert.ok(Math.abs(angleDiff(r.velocityHeading, r.heading)) < .25);
});

function driveBranch(choice) {
  const game = makeGame({ random: () => .9 }), r = game.racers[0], branch = game.track.shortcut;
  place(game, r, branch.start - 24);
  Object.assign(r, { speed: 26, shortcutChoice: choice, shortcutDecisionLap: 1 });
  let maximumProgressMismatch = 0;
  for (let i = 0; i < 60 * 15 && r.s < branch.end + 30; i++) {
    game.update(DT, aiInput(r, game, DT));
    maximumProgressMismatch = Math.max(maximumProgressMismatch, Math.abs(r.progress - r.s));
  }
  return { game, r, branch, maximumProgressMismatch };
}

test('the narrow shortcut can be driven physically and rewards a clean route', () => {
  const shortcut = driveBranch(true), main = driveBranch(false);
  assert.ok(shortcut.r.s > shortcut.branch.end + 25);
  assert.ok(shortcut.r.shortcutsTaken >= 1);
  assert.equal(shortcut.r.recoveries, 0);
  assert.equal(shortcut.r.falling, false);
  assert.ok(shortcut.game.elapsed < main.game.elapsed, 'clean shortcut is quicker than main route');
  assert.ok(shortcut.game.track.shortcut.width < shortcut.game.track.width / 2);
});

test('switching main/shortcut surfaces never corrupts actual checkpoint distance', () => {
  const shortcut = driveBranch(true), main = driveBranch(false);
  assert.ok(main.maximumProgressMismatch < .01, `main route diverged by ${main.maximumProgressMismatch.toFixed(2)} m`);
  assert.ok(shortcut.maximumProgressMismatch < .01, `shortcut diverged by ${shortcut.maximumProgressMismatch.toFixed(2)} m`);
});

test('four distinct racers complete a competitive three-lap simulation with items', () => {
  const game = makeGame({ cpuCount: 3, laps: 3, random: seeded(1) });
  game.start();
  const stall = [0, 0, 0, 0], longestStall = [0, 0, 0, 0];
  while (game.state !== 'finished' && game.time < 210) {
    const controls = game.state === 'racing' ? aiInput(game.racers[0], game, DT) : {};
    controls.useItem = true;
    game.update(DT, controls);
    game.racers.forEach((r, i) => {
      assert.ok(Number.isFinite(r.x + r.y + r.z + r.speed + r.progress));
      if (game.elapsed > 3 && !r.finished) {
        stall[i] = Math.abs(r.speed) < 3 ? stall[i] + DT : 0;
        longestStall[i] = Math.max(longestStall[i], stall[i]);
      }
    });
  }
  assert.equal(game.state, 'finished');
  assert.equal(game.racers.length, 4);
  assert.equal(game.racers[0].lap, 3);
  assert.ok(game.racers[0].itemsUsed >= 6);
  assert.deepEqual(game.racers.slice(1).map(r => r.personality), ['stable', 'aggressive', 'fast']);
  assert.equal(new Set(game.racers.map(r => r.rank)).size, 4);
  assert.ok(longestStall.every(s => s < 3.1));
  const spread = Math.max(...game.racers.map(r => r.progress)) - Math.min(...game.racers.map(r => r.progress));
  assert.ok(spread < game.track.length * .35, `field spread ${spread.toFixed(1)} m is competitive`);
  assert.ok(game.racers.every(r => r.lap === 3));
  assert.ok(game.racers.slice(1).every(r => r.itemsUsed >= 1));
  assert.ok(game.racers[1].recoveries <= 1, 'stable pilot rarely makes a costly error');
  assert.ok(game.racers.slice(1).some(r => r.shortcutsTaken > 0));
  // A legitimate finish is on the finish line, not a shifted virtual progress line.
  const p = game.racers[0], finishDistance = Math.min(p.s, game.track.length - p.s);
  const finishTolerance = p.vectorTimer > 0 ? CONFIG.items.vectorDistance + 1 : 1.5;
  assert.ok(finishDistance < finishTolerance, `finish occurred ${finishDistance.toFixed(2)} m from the line`);
});

test('a human can physically enter the branch without an AI shortcut flag', () => {
  const game=makeGame(),track=game.track,b=track.shortcut,r=place(game,game.racers[0],b.start-5);
  r.speed=26;let entered=false;
  for(let i=0;i<900&&r.s<b.end+20;i++){
    const q=track.project(r.x,r.z,true,'shortcut');
    let target=b.sample((q.s-b.start)/(b.end-b.start)*b.length+13);
    if(q.s>b.end-6)target=track.sample(b.end+20);
    const error=angleDiff(Math.atan2(target.x-r.x,target.z-r.z),r.heading);
    game.update(DT,{accel:r.speed<29,brake:r.speed>32,steer:Math.max(-1,Math.min(1,error*2.4))});
    entered ||= r.route==='shortcut';
  }
  assert.equal(entered,true);assert.ok(r.s>b.end+19);assert.equal(r.recoveries,0);assert.equal(r.falling,false);assert.ok(Math.abs(r.progress-r.s)<.01);
});
