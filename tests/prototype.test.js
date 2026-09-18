import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, PILOTS } from '../src/config.js';
import { createTrack, wrap, angleDiff } from '../src/track.js';
import { makeRacer, stepPhysics, recover, collideRacers } from '../src/physics.js';
import { aiInput } from '../src/ai.js';
import { Game } from '../src/game.js';

const DT = 1 / 60;
const track = createTrack();
const neutral = { accel: false, brake: false, steer: 0, drift: false };

function place(racer, s, lateral = 0) {
  const p = track.sample(s);
  Object.assign(racer, {
    x: p.x + p.nx * lateral, z: p.z + p.nz * lateral, y: p.y + .75,
    s: p.s, previousS: p.s,
    heading: Math.atan2(p.tx, p.tz), velocityHeading: Math.atan2(p.tx, p.tz),
  });
  return racer;
}

function racerAt(s = 20, lateral = 0) {
  return place(makeRacer(PILOTS[0], 0, track), s, lateral);
}

function drive(racer, seconds, controls, features = false) {
  for (let i = 0; i < seconds / DT; i++) {
    stepPhysics(racer, { ...neutral, ...controls }, track, DT, features);
  }
}

test('accelerator, brake, reverse and both steering directions affect physical movement', () => {
  const forward = racerAt();
  const start = { x: forward.x, z: forward.z };
  drive(forward, 1, { accel: true });
  assert.ok(forward.speed > 15, 'accelerates from rest');
  assert.ok(Math.hypot(forward.x - start.x, forward.z - start.z) > 7);
  drive(forward, .4, { brake: true });
  assert.ok(forward.speed < 7, 'braking meaningfully reduces speed');
  drive(forward, 1, { brake: true });
  assert.ok(forward.speed < -3, 'continued braking enters reverse');
  assert.ok(forward.speed >= -CONFIG.physics.reverseMax);

  const left = racerAt(), right = racerAt();
  const startHeading = left.heading;
  left.speed = right.speed = 8;
  drive(left, .35, { accel: true, steer: -1 });
  drive(right, .35, { accel: true, steer: 1 });
  assert.ok(angleDiff(left.heading, startHeading) < -.2);
  assert.ok(angleDiff(right.heading, startHeading) > .2);
  assert.ok(Math.hypot(left.x - right.x, left.z - right.z) > .3);
});

test('higher speed slightly reduces steering response while retaining control', () => {
  const slow = racerAt(), fast = racerAt();
  const h = slow.heading;
  slow.speed = 8; fast.speed = 35;
  drive(slow, .25, { steer: 1, accel: true });
  drive(fast, .25, { steer: 1, accel: true });
  assert.ok(angleDiff(fast.heading, h) > .1);
  assert.ok(angleDiff(slow.heading, h) > angleDiff(fast.heading, h));
});

test('the physical one-lap prototype finishes; its CPU makes steady progress without recovery', () => {
  const game = new Game(track, { laps: 1, cpuCount: 1, features: false });
  game.start();
  let lowSpeedTime = 0, maximumLowSpeedTime = 0, ticks = 0;
  while (game.state !== 'finished' && ticks++ < 60 * 100) {
    const controls = game.state === 'racing' ? aiInput(game.racers[0], game, DT) : neutral;
    game.update(DT, controls);
    if (game.state === 'racing' && game.elapsed > 3) {
      lowSpeedTime = game.racers[1].speed < 3 ? lowSpeedTime + DT : 0;
      maximumLowSpeedTime = Math.max(maximumLowSpeedTime, lowSpeedTime);
    }
    for (const r of game.racers) {
      assert.ok(Number.isFinite(r.x + r.y + r.z + r.heading + r.speed + r.progress));
    }
  }
  assert.equal(game.state, 'finished');
  assert.equal(game.racers[0].nextCheckpoint, track.checkpoints.length);
  assert.equal(game.racers[0].finished, true);
  assert.ok(game.elapsed > 25 && game.elapsed < 70);
  assert.ok(game.racers[1].progress > track.length * .9, 'CPU remains competitive');
  assert.equal(game.racers[1].recoveries, 0, 'CPU completes circuit without rescue');
  assert.ok(maximumLowSpeedTime < .5, 'CPU never stalls');
});

test('an idle player leaves a stable simulation and the CPU finishes independently', () => {
  const game = new Game(track, { laps: 1, cpuCount: 1, features: false });
  game.start();
  for (let i = 0; i < 60 * 100 && !game.racers[1].finished; i++) game.update(DT);
  assert.equal(game.racers[1].finished, true);
  assert.equal(game.racers[1].recoveries, 0);
  assert.equal(game.racers[0].finished, false);
  assert.equal(game.racers[0].speed, 0);
  assert.ok(Number.isFinite(game.racers[0].x + game.racers[0].z));
});

test('starting-line oscillation and a skipped checkpoint cannot finish a lap', () => {
  const game = new Game(track, { laps: 1, cpuCount: 1, features: false });
  game.state = 'racing';
  const r = game.racers[0];
  for (let i = 0; i < 100; i++) {
    r.s = wrap(r.s + (i % 2 ? -1 : 1), track.length);
    game.updateProgress(r, DT);
  }
  assert.equal(r.nextCheckpoint, 0);
  assert.equal(r.finished, false);

  // Teleport over the first checkpoint and try to continue the race.
  const cp = track.checkpoints[0];
  r.s = cp + 20;
  game.updateProgress(r, DT);
  assert.equal(r.nextCheckpoint, 0, 'a discontinuous crossing is rejected');
  // If a checkpoint is explicitly missing, even a finish-line crossing is rejected.
  r.progress = track.length - 1;
  r.previousS = track.length - 1;
  r.s = .5;
  r.nextCheckpoint = track.checkpoints.length - 2;
  game.updateProgress(r, DT);
  assert.equal(r.finished, false);
  assert.equal(r.lap, 1);
});

test('wrong-way warning detects both a turned-around kart and backward movement', () => {
  const turned = racerAt(35);
  turned.heading += Math.PI;
  turned.velocityHeading = turned.heading;
  turned.speed = 8;
  drive(turned, .8, { accel: true });
  assert.equal(turned.wrongWay, true, 'driving while facing backwards warns');
  const reversing = racerAt(35);
  reversing.speed = -8;
  drive(reversing, .8, { brake: true });
  assert.equal(reversing.wrongWay, true, 'moving backwards while facing forwards also warns');
});

test('a fall beyond the unguarded viaduct restores the last safe point', () => {
  const r = racerAt(track.length * .70, 14);
  r.safeS = track.length * .63;
  r.safeProgress = r.safeS;
  r.progress = track.length * .7;
  r.speed = 18;
  stepPhysics(r, neutral, track, DT, false);
  assert.equal(r.falling, true);
  const fallY = r.y;
  drive(r, .4, neutral);
  assert.ok(r.y < fallY, 'height decreases during the fall');
  for (let i = 0; i < 120 && !r.recoveries; i++) stepPhysics(r, neutral, track, DT, false);
  assert.equal(r.recoveries, 1);
  assert.equal(r.falling, false);
  assert.equal(r.progress, r.safeProgress);
  const safe = track.sample(r.safeS);
  assert.ok(Math.hypot(r.x - safe.x, r.z - safe.z) < .01);
  assert.ok(r.speed > 0 && r.immuneTimer > 0);
});

test('manual recovery retains checkpoint progress and points forward', () => {
  const r = racerAt(track.length * .2, 5);
  r.safeS = track.length * .15;
  r.safeProgress = r.safeS;
  r.nextCheckpoint = 2;
  r.heading += Math.PI;
  recover(r, track);
  assert.equal(r.nextCheckpoint, 2);
  assert.equal(r.progress, r.safeProgress);
  assert.ok(Math.abs(angleDiff(r.heading, Math.atan2(track.sample(r.safeS).tx, track.sample(r.safeS).tz))) < .001);
});

test('guardrail contact and kart contact slow and separate without an abrupt stop', () => {
  const wall = racerAt(30, track.width / 2 + .5);
  wall.speed = 24;
  stepPhysics(wall, { ...neutral, accel: true }, track, DT, false);
  assert.equal(wall.falling, false);
  assert.ok(wall.wallHit > 0);
  assert.ok(wall.speed > 15 && wall.speed < 24);
  assert.ok(Math.abs(track.project(wall.x, wall.z).lateral) <= track.width / 2 + .1);

  const a = racerAt(30, 0), b = racerAt(30, 1.8);
  a.speed = b.speed = 20;
  collideRacers([a, b], DT);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 2.999);
  assert.ok(a.speed > 15 && a.speed < 20);
  assert.ok(b.speed > 15 && b.speed < 20);
});

test('pause freezes race and countdown; restart restores the starting field', () => {
  const game = new Game(track, { laps: 1, cpuCount: 1, features: false });
  game.start();
  game.update(1, neutral);
  const countdown = game.countdown;
  game.pause();
  game.update(1, { accel: true });
  assert.equal(game.countdown, countdown);
  game.pause();
  assert.equal(game.state, 'countdown');
  game.state = 'racing';
  for (let i = 0; i < 60; i++) game.update(DT, { ...neutral, accel: true });
  const before = game.snapshot();
  const elapsed = game.elapsed;
  game.pause();
  game.update(1, { accel: true });
  assert.equal(game.elapsed, elapsed);
  assert.equal(game.racers[0].x, before.player.x);
  game.start();
  assert.equal(game.state, 'countdown');
  assert.equal(game.elapsed, 0);
  assert.equal(game.racers[0].speed, 0);
  assert.equal(game.racers[0].nextCheckpoint, 0);
  assert.equal(game.racers.length, 2);
});
