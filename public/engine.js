/* Fairway Club v8: deterministic course rendering and animation.
 * Geometry uses the same 900x560 coordinates as the existing multiplayer server.
 */
export const W=900,H=560;
export const TEE={x:105,y:280},CUP={x:760,y:280};
export const COURSE_NAMES=['Kystbanen','Skogsbanen','Fjellbanen'];
export const COURSE_EMOJI=['🌊','🌲','🏔️'];
export const COURSE_TAGS=['COASTAL LINKS','DEEP WOODS','ALPINE HEIGHTS'];
const HOLE_NAMES=[
 ['Morgenbris','Saltvannssvingen','Sandodden','Vindens vei','Blå horisont','Klippekanten','Sjøgress','Fyrlykta','Siste bølge'],
 ['Første lys','Bjørkestien','Mosetoppen','Den grønne tunnelen','Hjortetråkket','Gammelskogen','Nattfuru','Sølvbekken','Skogens hjerte'],
 ['Første topp','Fjellpasset','Steinryggen','Isbreens kant','Vindskaret','Ekkodalen','Høyfjellsengen','Snøtoppen','Toppmøtet']
];
const PARS=[4,3,4,5,4,3,4,5,4];
export const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
function rng(seed){let v=seed>>>0;return()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296}}
function ell(ctx,x,y,rx,ry,fill,rotation=0){ctx.beginPath();ctx.ellipse(x,y,rx,ry,rotation,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill()}}
function poly(ctx,pts,fill){ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill()}
function pathCenter(ctx,h){ctx.beginPath();ctx.moveTo(TEE.x,TEE.y);ctx.bezierCurveTo(248,TEE.y+h.turnA,510,TEE.y+h.turnB,CUP.x,CUP.y)}
function fairwayRibbon(h,width){
 const A=TEE,B={x:248,y:TEE.y+h.turnA},C={x:510,y:TEE.y+h.turnB},D=CUP;
 const left=[],right=[];
 for(let i=0;i<=70;i++){const t=i/70,u=1-t;
  const x=u*u*u*A.x+3*u*u*t*B.x+3*u*t*t*C.x+t*t*t*D.x;
  const y=u*u*u*A.y+3*u*u*t*B.y+3*u*t*t*C.y+t*t*t*D.y;
  const dx=3*u*u*(B.x-A.x)+6*u*t*(C.x-B.x)+3*t*t*(D.x-C.x);
  const dy=3*u*u*(B.y-A.y)+6*u*t*(C.y-B.y)+3*t*t*(D.y-C.y);
  const norm=Math.hypot(dx,dy)||1,nx=-dy/norm,ny=dx/norm;
  // Wide tee, tighter fairway in the middle, large landing area near the green.
  const rad=width*(.73+.17*Math.cos((t-.5)*Math.PI*2));
  left.push([x+nx*rad,y+ny*rad]);right.push([x-nx*rad,y-ny*rad]);
 }
 const path=new Path2D();for(const [i,[x,y]] of [...left,...right.reverse()].entries())i?path.lineTo(x,y):path.moveTo(x,y);path.closePath();return path
}
export function buildHole(course=0,index=0,dailySeed=0){
 course=clamp(course|0,0,2);index=clamp(index|0,0,8);
 const seed=((course+1)*7331+(index+1)*1259+(dailySeed|0)*17)>>>0,r=rng(seed);
 const turnA=Math.round((r()-.5)*255+(course===1?-50:course===2?50:0));
 const turnB=Math.round((r()-.5)*225+(course===1?55:course===2?-30:0));
 const wind=Math.round((r()-.5)*9),par=PARS[index],hazards=[];
 const variation=(n)=>(r()-.5)*n;
 // Hazard positions are deterministic and vary by hole, not just by course.
 const templates=[
   [{x:360,y:155,type:'water',rx:55,ry:37},{x:548,y:365,type:'sand',rx:48,ry:28},{x:687,y:174,type:'sand',rx:38,ry:23}],
   [{x:390,y:174,type:'tree',rx:30,ry:27},{x:525,y:365,type:'tree',rx:33,ry:29},{x:640,y:185,type:'sand',rx:33,ry:23}],
   [{x:380,y:174,type:'rock',rx:32,ry:25},{x:545,y:370,type:'water',rx:42,ry:30},{x:676,y:187,type:'sand',rx:38,ry:26}]
 ][course];
 for(const z of templates){hazards.push({type:z.type,x:clamp(z.x+variation(82),235,714),y:clamp(z.y+variation(65),85,469),rx:z.rx+variation(10),ry:z.ry+variation(8)})}
 if(index%3===1)hazards.push({type:course===0?'sand':course===1?'tree':'rock',x:454+variation(74),y:275+variation(75),rx:27,ry:20});
 if(index%3===2)hazards.push({type:course===0?'water':course===1?'sand':'rock',x:596+variation(40),y:274+variation(46),rx:33,ry:21});
 const h={seed,course,index,name:HOLE_NAMES[course][index],par,wind,turnA,turnB,hazards,dailySeed};
 return h;
}
export function hazardAt(h,x,y){for(const z of h.hazards){const a=(x-z.x)/z.rx,b=(y-z.y)/z.ry;if(a*a+b*b<1)return z.type}return null}
export function nearGreen(x,y){return Math.hypot((x-CUP.x)/1.15,(y-CUP.y)/1.04)<67}
export function puttsNeeded(distance){return distance<16?1:distance<38?2:3}
function drawTree(ctx,x,y,size,palette='forest'){
 const dark=palette==='forest'?'#163d2c':'#275b39',light=palette==='forest'?'#437e4f':'#5f9657';
 ell(ctx,x+5,y+9,size*1.02,size*.74,'#12261c66');
 ell(ctx,x,y,size,size*.88,dark);
 ell(ctx,x-5,y-5,size*.73,size*.65,light);
 ell(ctx,x-9,y-10,size*.22,size*.2,'#87af68');
}
function drawWater(ctx,z,phase=0){
 ell(ctx,z.x,z.y,z.rx+8,z.ry+8,'#c9ba8f');
 ell(ctx,z.x,z.y,z.rx,z.ry,'#2f8dab');
 ell(ctx,z.x-4,z.y-3,z.rx*.84,z.ry*.76,'#459eb7');
 ctx.save();ctx.beginPath();ctx.ellipse(z.x,z.y,z.rx*.9,z.ry*.87,0,0,Math.PI*2);ctx.clip();
 for(let i=-1;i<5;i++){ctx.strokeStyle='#b2e2da88';ctx.lineWidth=2;ctx.beginPath();const y=z.y-z.ry+13+i*11;ctx.moveTo(z.x-z.rx+8+(i%2)*13,y);ctx.quadraticCurveTo(z.x,y+3,z.x+z.rx-12,y-2);ctx.stroke()}ctx.restore();
}
function drawSand(ctx,z){
 ell(ctx,z.x,z.y,z.rx+7,z.ry+7,'#bdc28c',-.14);
 ell(ctx,z.x,z.y,z.rx,z.ry,'#f1dfa9',-.14);
 ctx.save();ctx.strokeStyle='#d9c48e';ctx.lineWidth=1.3;
 for(let j=0;j<5;j++){ctx.beginPath();ctx.ellipse(z.x-4,z.y+j*7-14,z.rx*.6-j*1.5,z.ry*.26,0,0,Math.PI);ctx.stroke()}ctx.restore();
}
function drawRock(ctx,z){
 ell(ctx,z.x+5,z.y+6,z.rx,z.ry,'#233d3533');
 poly(ctx,[[z.x-z.rx,z.y+z.ry*.5],[z.x-z.rx*.6,z.y-z.ry*.6],[z.x+z.rx*.4,z.y-z.ry],[z.x+z.rx,z.y+z.ry*.55],[z.x,z.y+z.ry]],'#72897c');
 poly(ctx,[[z.x-z.rx*.6,z.y-z.ry*.6],[z.x+z.rx*.4,z.y-z.ry],[z.x+z.rx*.13,z.y+z.ry*.25]],'#aebbae');
}
export function paintCourse(ctx,h){
 const r=rng(h.seed+999),c=h.course;
 const palettes=[{rough:'#568b69',fair:'#6da876',stripe:'#80b783',fringe:'#c0d9a1',green:'#acd08b'},
 {rough:'#325d48',fair:'#5f9562',stripe:'#75ad73',fringe:'#a3c887',green:'#a5ce83'},
 {rough:'#768f81',fair:'#95ae82',stripe:'#adbf90',fringe:'#c8d8a3',green:'#bdd494'}];const p=palettes[c];
 ctx.clearRect(0,0,W,H);ctx.fillStyle=p.rough;ctx.fillRect(0,0,W,H);
 if(c===0){ // Ocean, coast, beach and dunes
  ctx.fillStyle='#3989a4';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(145,0);ctx.bezierCurveTo(120,85,37,100,84,181);ctx.bezierCurveTo(110,260,4,360,0,395);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#e7d9a3';ctx.lineWidth=17;ctx.beginPath();ctx.moveTo(145,0);ctx.bezierCurveTo(120,85,37,100,84,181);ctx.bezierCurveTo(110,260,4,360,0,395);ctx.stroke();
  ctx.lineWidth=2;ctx.strokeStyle='#d0eeec88';for(let i=0;i<29;i++){const x=r()*158,y=r()*335;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+13,y-4,x+28,y);ctx.stroke()}
  for(let i=0;i<80;i++){const x=160+r()*715,y=r()*560;ell(ctx,x,y,1+r()*2,2+r()*3,i%2?'#719d74':'#bed09a')}
 }else if(c===1){
  for(let i=0;i<125;i++){const x=r()*W,y=r()*H;ell(ctx,x,y,7+r()*18,8+r()*13,i%3===0?'#376c4f':'#386a51')}
  // Broad canopies at edges, never over the fairway's central sightline.
  for(let i=0;i<43;i++){let x=r()*W,y=i%2?16+r()*120:430+r()*155;drawTree(ctx,x,y,15+r()*20,'forest')}
 }else{
  poly(ctx,[[0,0],[0,118],[67,42],[123,94],[210,9],[306,115],[398,27],[480,113],[553,11],[647,95],[744,22],[830,115],[900,48],[900,0]],'#b2c5b9');
  poly(ctx,[[0,0],[0,73],[70,6],[119,50],[214,0],[293,67],[383,0],[477,74],[562,0],[660,64],[750,0],[839,62],[900,13],[900,0]],'#d6ded7');
  poly(ctx,[[0,0],[0,45],[65,8],[87,34],[124,27],[210,0],[300,55],[380,4],[410,0],[475,61],[556,2],[606,29],[750,0],[900,0]],'#f4f4e8');
  for(let i=0;i<55;i++){const x=r()*W,y=150+r()*420;ell(ctx,x,y,8+r()*30,4+r()*12,i%2?'#7c9588':'#869b8e')}
 }
 // Fairways follow unique bends per hole with clean, clipped mowing stripes.
 const border=fairwayRibbon(h,94),inside=fairwayRibbon(h,83);
 ctx.fillStyle=c===0?'#dfd8a4':c===1?'#346447':'#b0c3a4';ctx.fill(border);
 ctx.fillStyle=p.fair;ctx.fill(inside);
 ctx.save();ctx.clip(inside);
 for(let i=-9;i<34;i++){
  const y=i*32;ctx.beginPath();ctx.moveTo(-100,y+95);ctx.lineTo(1000,y-75);
  ctx.strokeStyle=p.stripe+'ba';ctx.lineWidth=19;ctx.stroke()
 }
 ctx.restore();
 // Actual holes differ by their hazard features and the named layout.
 for(const z of h.hazards){if(z.type==='water')drawWater(ctx,z);else if(z.type==='sand')drawSand(ctx,z);else if(z.type==='tree')drawTree(ctx,z.x,z.y,z.rx);else drawRock(ctx,z)}
 // Green and short grass ring
 ell(ctx,CUP.x,CUP.y,94,78,p.fringe,-.06);ell(ctx,CUP.x,CUP.y,81,67,p.green,-.06);
 for(let i=0;i<11;i++)ell(ctx,CUP.x-57+r()*115,CUP.y-43+r()*88,1.3,1.2,'#e6ecc250');
 // TEE box
 ell(ctx,TEE.x,TEE.y,32,23,c===1?'#8ab46c':'#c3d59b');ell(ctx,TEE.x,TEE.y,22,17,'#b3d18e');
 ctx.fillStyle='#f5d294';ctx.fillRect(TEE.x-27,TEE.y-27,7,4);ctx.fillRect(TEE.x+20,TEE.y-27,7,4);
 // Hole and flag shadow
 ell(ctx,CUP.x+6,CUP.y+3,10,6,'#3a5a3e88');ell(ctx,CUP.x,CUP.y,6,4,'#334b38');
 ctx.strokeStyle='#fffbea';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(CUP.x,CUP.y);ctx.lineTo(CUP.x,CUP.y-52);ctx.stroke();
 poly(ctx,[[CUP.x+2,CUP.y-51],[CUP.x+42,CUP.y-40],[CUP.x+2,CUP.y-30]],'#ffd486');
 // Tee / green labels
 ctx.font='800 11px DM Sans, sans-serif';ctx.fillStyle='#f8f9e8';ctx.textAlign='center';ctx.shadowColor='#1b312a';ctx.shadowBlur=5;
 ctx.fillText('TEE',105,244);ctx.fillText('GREEN',760,382);ctx.shadowBlur=0;
 // decorative tiny flowers for variation, seeded per hole
 for(let i=0;i<33;i++){const x=190+r()*590,y=70+r()*435;if(Math.hypot(x-CUP.x,y-CUP.y)<88)continue;ell(ctx,x,y,2,2,i%4===0?'#f8e2ac':'#c0d6a266')}
}
export function drawBall(ctx,b,{own=false,ghost=false,time=0}={}){
 if(!b||!Number.isFinite(b.x)||!Number.isFinite(b.y))return;
 const x=clamp(b.x,9,W-9),y=clamp(b.y,9,H-9),z=Math.max(0,b.z||0);const radius=own?9:7.5;
 ctx.save();
 ell(ctx,x+3,y+6,12+z*.07,5+z*.024,`rgba(11,38,29,${Math.max(.13,.5-z*.003)})`);
 if(z>2){ctx.strokeStyle='#fcf4cd55';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,y+4);ctx.lineTo(x,y-z*.86);ctx.stroke()}
 const by=y-z*.86;
 ctx.beginPath();ctx.arc(x,by,radius,0,Math.PI*2);
 const grad=ctx.createRadialGradient(x-radius*.42,by-radius*.38,.4,x,by,radius*1.15);
 if(ghost){grad.addColorStop(0,'#fff6b9');grad.addColorStop(1,'#f2b75c')}else{grad.addColorStop(0,'#fff');grad.addColorStop(.48,'#fffef5');grad.addColorStop(1,'#9fb6ab')}
 ctx.fillStyle=grad;ctx.fill();ctx.lineWidth=own?3:2;ctx.strokeStyle=ghost?'#f5b86e':own?'#ffde7a':'#7bd1f8';ctx.stroke();
 if(own||ghost){ell(ctx,x-radius*.3,by-radius*.36,2.2,1.6,'#fff');ctx.strokeStyle=own?'#ffde7a88':'#ffd98888';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,by,radius+5,0,Math.PI*2);ctx.stroke()}
 ctx.restore();
}
export function drawAim(ctx,b,angle,locked=false){if(!b||b.moving)return;const x=b.x,y=b.y;ctx.save();ctx.setLineDash(locked?[]:[9,8]);ctx.lineWidth=locked?4:3;ctx.strokeStyle=locked?'#ffe49a':'#f7efbb';ctx.shadowColor='#ffedaa';ctx.shadowBlur=locked?10:5;ctx.beginPath();ctx.moveTo(x+Math.cos(angle)*14,y+Math.sin(angle)*14);ctx.lineTo(x+Math.cos(angle)*195,y+Math.sin(angle)*195);ctx.stroke();ctx.setLineDash([]);const tx=x+Math.cos(angle)*195,ty=y+Math.sin(angle)*195;ctx.fillStyle='#ffe49a';ctx.beginPath();ctx.moveTo(tx+Math.cos(angle)*10,ty+Math.sin(angle)*10);ctx.lineTo(tx+Math.cos(angle+2.55)*9,ty+Math.sin(angle+2.55)*9);ctx.lineTo(tx+Math.cos(angle-2.55)*9,ty+Math.sin(angle-2.55)*9);ctx.fill();ctx.restore()}
export function planShot(h,from,angle,power){
 power=clamp(power,.04,1);const flightLength=45+power*398;
 const windShift=h.wind*(power*.95)*3;
 const lx=clamp(from.x+Math.cos(angle)*flightLength+windShift,15,W-15);
 const ly=clamp(from.y+Math.sin(angle)*flightLength+windShift*.38,15,H-15);
 const atLanding=hazardAt(h,lx,ly);let roll=16+power*65;
 if(atLanding==='sand')roll*=.10;
 if(atLanding==='tree'||atLanding==='rock')roll*=.12;
 if(atLanding==='water')roll=0;
 const ex=clamp(lx+Math.cos(angle)*roll,15,W-15),ey=clamp(ly+Math.sin(angle)*roll,15,H-15);
 const terrain=atLanding==='water'?'water':hazardAt(h,ex,ey)==='water'?'water':atLanding||hazardAt(h,ex,ey)||'fairway';
 return {from:{x:from.x,y:from.y},landing:{x:lx,y:ly},end:{x:ex,y:ey},angle,power,terrain,flightMs:680+power*460,rollMs:terrain==='water'?280:430+power*130,apex:24+power*65};
}
export function sampleShot(s,ms){
 if(ms<=s.flightMs){const u=clamp(ms/s.flightMs,0,1);return {x:lerp(s.from.x,s.landing.x,u),y:lerp(s.from.y,s.landing.y,u),z:Math.sin(u*Math.PI)*s.apex,done:false,stage:'flight'}}
 const v=clamp((ms-s.flightMs)/s.rollMs,0,1),ease=1-(1-v)**3;
 return {x:lerp(s.landing.x,s.end.x,ease),y:lerp(s.landing.y,s.end.y,ease),z:0,done:v>=1,stage:'roll'};
}
export function puttTargets(from,count){
 const targets=[];let x=from.x,y=from.y;
 for(let k=0;k<count;k++){
   const last=k===count-1;
   const ratio=last?1:(k===0&&count===3)?.52:.65;
   x=lerp(x,CUP.x,ratio);y=lerp(y,CUP.y,ratio);
   targets.push({x,y})
 }
 return targets;
}
export function niceScore(score,par){const d=score-par;return d<=-2?'Eagle!':d===-1?'Birdie!':d===0?'Par!':d===1?'Bogey':d===2?'Dobbel bogey':'Hull fullført'}
export function relative(total,par){const d=total-par;return d===0?'E':d>0?'+'+d:String(d)}
export const dailyKey=()=>new Date().toLocaleDateString('sv-SE');
export function dailyCourse(){const s=dailyKey().split('-').join('');return Number(s)%3}
export function dailyNumericSeed(){return Number(dailyKey().split('-').join(''))%99991}
