import assert from 'node:assert/strict';
import {CLUBS,buildHole,planShot,sampleShot,shotDistanceEstimate,distanceYards,recommendClub,TEE,CUP,nearGreen,puttsNeeded,puttTargets,yardsPerPixel} from '../public/engine.js';
let sampled=0;
assert.equal(CLUBS.length,10);
const ids=new Set(CLUBS.map(c=>c.id));assert.equal(ids.size,CLUBS.length);
for (let c=0;c<3;c++)for(let n=0;n<9;n++){
 const h=buildHole(c,n);assert.ok(h.lengthYards>100&&h.lengthYards<560);
 assert.equal(distanceYards(h,TEE),h.lengthYards);
 assert.ok(Math.abs(yardsPerPixel(h)*655-h.lengthYards)<.01);
 assert.ok(ids.has(recommendClub(h,TEE)));
 for(const club of CLUBS){
  let prior=0;
  for(const pow of [.05,.25,.50,.75,1]){
   const estimate=shotDistanceEstimate(h,TEE,0,pow,club.id);
   const shot=planShot(h,TEE,0,pow,club.id);
   assert.equal(shot.clubId,club.id);
   assert.ok(estimate.totalYards>prior,`${club.id} power=${pow} must increase yardage`);
   assert.ok(Math.abs(shot.totalYards-estimate.totalYards)<.0001);
   prior=estimate.totalYards;
   for(const t of [0,shot.flightMs/2,shot.flightMs,shot.flightMs+shot.rollMs/2,shot.flightMs+shot.rollMs]){
    const pos=sampleShot(shot,t);sampled++;
    for(const k of ['x','y','z'])assert.ok(Number.isFinite(pos[k]),`${k} not finite`);
    assert.ok(pos.x>=0&&pos.x<=900&&pos.y>=0&&pos.y<=560&&pos.z>=0);
    if(t>=shot.flightMs+shot.rollMs)assert.equal(pos.done,true);
   }
  }
  const half=shotDistanceEstimate(h,TEE,0,.5,club.id).totalYards;
  const full=shotDistanceEstimate(h,TEE,0,1,club.id).totalYards;
  assert.ok(Math.abs(half/full-.5)<.00001,`${club.id}: 50% should be 50% of distance`);
 }
}
const h=buildHole(0,0);
assert.ok(shotDistanceEstimate(h,TEE,0,1,'driver').totalYards>shotDistanceEstimate(h,TEE,0,1,'iron7').totalYards);
assert.ok(shotDistanceEstimate(h,TEE,0,1,'iron7').totalYards>shotDistanceEstimate(h,TEE,0,1,'sw').totalYards);
assert.ok(nearGreen(CUP.x,CUP.y));
assert.equal(puttsNeeded(10),1);assert.equal(puttsNeeded(30),2);assert.equal(puttsNeeded(55),3);
for(const count of [1,2,3]){const t=puttTargets({x:715,y:267},count);assert.equal(t.length,count);assert.deepEqual(t.at(-1),CUP)}
console.log(`PASS ${sampled} shot animation samples, 27 holes, 10 clubs, proportional power, putting and geometry`);
