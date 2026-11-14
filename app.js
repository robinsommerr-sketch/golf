import {W,H,TEE,CUP,COURSE_NAMES,COURSE_EMOJI,COURSE_TAGS,buildHole,clamp,paintCourse,drawBall,drawAim,planShot,sampleShot,hazardAt,nearGreen,puttsNeeded,puttTargets,niceScore,relative,dailyKey,dailyCourse,dailyNumericSeed,CLUBS,getClub,shotDistanceEstimate,distanceYards,lieAt,recommendClub,drawLandingGuide,yardsPerPixel} from './engine.js';
import {initSocial} from './social.js';

const $=id=>document.getElementById(id);
const scenes=['landing','dashboard','room','game','community','admin','banScreen'];
const cv=$('board'),ctx=cv.getContext('2d');
ctx.setTransform(2,0,0,2,0,0); // Crisp high-DPI logical world (900 x 560).
const ss={
 token:localStorage.getItem('fc_token')||'',username:localStorage.getItem('fc_name')||'',socket:null,course:0,
 mode:'practice',room:null,roundComplete:false,currentHole:-1,hole:null,holeCache:null,dailySeed:0,
 phase:'aim',aim:0,meter:0,meterDir:1,clubId:'driver',balls:new Map(),shots:new Map(),putting:null,replay:null,lastReplay:null,
 scores:Array(9).fill(null),holeDetails:Array(9).fill(null),localShots:0,penalties:0,putts:0,finished:false,
 lastTick:performance.now(),toastTimer:null,soundOn:localStorage.getItem('fc_sound')==='yes',roundNonce:0,
 history:loadJSON('fc_history',[]),achievements:loadJSON('fc_badges',[]),lastHud:0,lastMeterDraw:0,pendingFinish:null
};
const localId=()=>ss.mode==='online'?ss.socket?.id:'solo';
const ownBall=()=>ss.balls.get(localId());
const isOnline=()=>ss.mode==='online';
const isHost=()=>!isOnline()||ss.room?.host===ss.socket?.id;
const onGreen=()=>{const b=ownBall();return b?nearGreen(b.x,b.y):false};
function loadJSON(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return Array.isArray(v)?v:fallback}catch{return fallback}}
function saveJSON(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function notify(message,error=false){const t=$('toast');t.textContent=message;t.classList.remove('hidden');t.classList.toggle('error',error);clearTimeout(ss.toastTimer);ss.toastTimer=setTimeout(()=>t.classList.add('hidden'),3600)}
function scene(name){for(const id of scenes)$(id).classList.toggle('hidden',id!==name);window.scrollTo({top:0,behavior:'instant'})}
function setText(id,value){$(id).textContent=String(value)}
function setAuth(){setText('identity',ss.username?`Hei, ${ss.username}`:'Gjest');$('logout').classList.toggle('hidden',!ss.token);$('onlineTip').textContent=ss.token?'Velg en bane først. Du kan invitere opptil 7 venner.':'Logg inn for å opprette eller bli med i online lobbyer.'}
const LIE_LABELS={fairway:'Fairway',sand:'Bunker',water:'Vann',tree:'Under trær',rock:'Ved stein'};
function selectClub(id,{silent=false}={}){
 if(ss.phase!=='aim'&&ss.hole){if(!silent)notify('Lås opp siktet for å endre kølle.',true);$('clubSelect').value=ss.clubId;return}
 ss.clubId=getClub(id).id;
 $('clubSelect').value=ss.clubId;
 if(!silent)playSound('lock');
 updateClubUI();
}
function updateClubUI(){
 const club=getClub(ss.clubId),b=ownBall();
 $('clubSelect').value=club.id;
 if(!ss.hole||!b)return;
 const max=shotDistanceEstimate(ss.hole,b,ss.aim,1,club.id);
 const current=shotDistanceEstimate(ss.hole,b,ss.aim,ss.meter/100,club.id);
 const rem=distanceYards(ss.hole,b);
 setText('clubCarry',club.carry+' yd');setText('clubTotal',Math.round(max.totalYards)+' yd');setText('lieText',LIE_LABELS[max.lie]||'Fairway');
 setText('boardClub',club.short+' · '+Math.round(max.totalYards)+' YD');
 setText('maxCarryLabel',Math.round(max.totalYards)+' yd på 100 %');
 setText('shotEstimate',`${Math.round(current.totalYards)} yd`);
 const target=max.totalYards>0?rem/max.totalYards*100:0;
 const reachable=target<=100;
 const targetElement=$('meterTarget');targetElement.classList.toggle('hidden',!reachable);
 if(reachable)targetElement.style.left=clamp(target,1,99)+'%';
 setText('targetPower',reachable?Math.max(1,Math.round(target))+' %':'For langt');
 let tip='';
 if(max.lie==='sand')tip='Bunker reduserer slaglengden. Bruk gjerne en wedge for å komme deg ut.';
 else if(max.lie==='tree'||max.lie==='rock')tip='Du ligger ved en hindring. Vær forsiktig med neste slag.';
 else if(rem>max.totalYards+15)tip='Denne køllen når ikke helt frem. Velg lengre kølle eller planlegg et mellomslag.';
 else if(rem<max.totalYards*.48)tip='Du kan bruke kortere kølle for bedre kontroll.';
 else tip='Tips: Markøren på måleren viser omtrentlig styrke rett mot flagget.';
 setText('clubAdvice',tip);
 const fill=clamp(ss.meter,0,100);$('meterFill').style.width=fill+'%';$('needle').style.left=clamp(fill,0,99.5)+'%';
 $('powerTrack').setAttribute('aria-valuenow',String(Math.round(fill)));
 setText('meterlabel',Math.round(fill)+' %');
}
function renderCourses(){const root=$('courseCards');root.replaceChildren();COURSE_NAMES.forEach((name,i)=>{const c=document.createElement('button');c.type='button';c.className='course-choice'+(i===ss.course?' selected':'');c.setAttribute('aria-pressed',String(i===ss.course));c.innerHTML=`<div class="course-art ${['sea','forest','mountain'][i]}"><div class="sky"></div><div class="shape"></div><div class="emoji">${COURSE_EMOJI[i]}</div></div><div class="course-body"><b>${name}</b><small>${['Havbris, sand og smale fairwayer','Dyp skog og krevende doglegs','Fjellvind, stein og presisjon'][i]}</small><div class="course-tag">${COURSE_TAGS[i]}</div></div>`;c.onclick=()=>{ss.course=i;renderCourses()};root.append(c)})}
function achievementBadge(id){if(!ss.achievements.includes(id)){ss.achievements.push(id);saveJSON('fc_badges',ss.achievements);const title={first:'Første hull!',birdie:'Birdie-jeger!',eagle:'Eagle!',nine:'Ni hull fullført!',dry:'Trygg fra vann!',daily:'Dagens utfordrer!'}[id];if(title)notify('🏅 Nytt merke: '+title)}}
const BADGES=[['first','⛳','Første hull','Fullfør ett hull'],['birdie','🕊️','Birdiejeger','Slå under par'],['eagle','⭐','Eagle','To slag under par'],['nine','🏆','Rundemester','Fullfør ni hull'],['daily','✶','Dagens spiller','Fullfør en daglig runde'],['dry','🌿','Tørrskodd','Fullfør ni hull uten vannstraff']];
function renderAchievements(){const root=$('achievements');root.replaceChildren();for(const [id,icon,name,desc] of BADGES){const el=document.createElement('div');el.className='achievement'+(ss.achievements.includes(id)?'':' missing');const sym=document.createElement('span');sym.className='mini-icon';sym.textContent=icon;const content=document.createElement('div');const b=document.createElement('b');b.textContent=name;const sm=document.createElement('small');sm.textContent=ss.achievements.includes(id)?'Låst opp':desc;content.append(b,sm);el.append(sym,content);root.append(el)}}
function renderHistory(){const root=$('history');root.replaceChildren();if(!ss.history.length){const p=document.createElement('p');p.className='muted';p.style.fontSize='12px';p.textContent='Ingen fullførte treningsrunder ennå.';root.append(p);return}for(const h of ss.history.slice(0,5)){const d=document.createElement('div');d.className='recent';const t=document.createElement('span');t.textContent=(h.daily?'✶ ':'')+COURSE_NAMES[h.course]+' · '+h.date;const s=document.createElement('b');s.textContent=h.strokes+' slag';d.append(t,s);root.append(d)}}
async function fetchProfile(){if(!ss.token){setText('profile-name','Gjesteprofil');setText('profile-games','0');setText('profile-strokes','0');setText('profile-sub','Treningsrunder lagres på denne enheten.');return}try{const r=await fetch('/api/me',{headers:{Authorization:'Bearer '+ss.token}});if(!r.ok)throw Error();const p=await r.json();setText('profile-name',p.username);setText('profile-games',p.games??0);setText('profile-strokes',p.strokes??0);setText('profile-sub','Dine online runder og resultater.')}catch{setText('profile-name',ss.username||'Spiller');setText('profile-sub','Kunne ikke hente profilstatistikk akkurat nå.')}}
function dashboard(){renderCourses();renderAchievements();renderHistory();const key='fc_daily_best_'+dailyKey()+'_'+dailyCourse();const best=localStorage.getItem(key);setText('dailyBest',best?`Dagens personlige rekord: ${best} slag`:'Samme bane hele dagen · sett dagens rekord');fetchProfile();setAuth();scene('dashboard')}
async function auth(path){const username=$('username').value.trim(),password=$('password').value;if(!/^[a-zA-Z0-9_]{3,18}$/.test(username)||password.length<8){notify('Bruk 3–18 tegn i brukernavn og minst 8 tegn i passord.',true);return}const btn=$(path==='register'?'register':'login');btn.disabled=true;try{const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});const data=await r.json();if(!r.ok){if(data.code==='BANNED')social.showBan(data);throw Error(data.error||'Innlogging feilet')}ss.token=data.token;ss.username=data.username;localStorage.setItem('fc_token',data.token);localStorage.setItem('fc_name',data.username);connectSocket();dashboard();social.onLogin(data);notify('Velkommen til Fairway Club!')}catch(e){notify(e.message||'Noe gikk galt',true)}finally{btn.disabled=false}}
function connectSocket(){if(!ss.token||typeof window.io!=='function'){if(ss.token)notify('Socket.IO er ikke tilgjengelig. Prøv å oppdatere nettsiden.',true);return}if(ss.socket){ss.socket.disconnect();ss.socket=null}const s=io({auth:{token:ss.token},reconnectionAttempts:8,timeout:12000});ss.socket=s;social.attachSocket(s);
 s.on('connect',()=>{if(s===ss.socket){setAuth();if(ss.mode==='online'&&ss.room?.started)notify('Tilkobling gjenopprettet. Hvis lobbyen ble borte, opprett en ny.')}});
 s.on('connect_error',e=>{notify('Kunne ikke koble til multiplayer: '+e.message,true)});
 s.on('disconnect',reason=>{if(ss.mode==='online')notify('Frakoblet multiplayer ('+reason+').',true)});
 s.on('room',r=>{if(s!==ss.socket||ss.roundComplete)return;const prev=ss.room;ss.room=r;ss.mode='online';ss.course=r.course;const me=r.players?.find(p=>p.id===s.id);if(me?.score&&me.score.length===9)ss.scores=[...me.score];if(me?.finished)ss.pendingFinish=null;
    if(r.started){if(!prev?.started||prev.hole!==r.hole||ss.currentHole!==r.hole){startHole(r.course,r.hole)}else{syncPlayers(r);renderLeaderboard();updateHud()}}
    else renderLobby(r)
    social.onRoom(r);
 });
 s.on('new-hole',()=>{}); // The authoritative room event carries the new hole index.
 s.on('shot',e=>{if(ss.mode!=='online'||!ss.room?.started||e.id===s.id)return;const b=ss.balls.get(e.id);if(!b||b.moving)return;const mag=Math.hypot(e.dx,e.dy),power=clamp((mag-5)/100,.04,1);launchShot(e.id,Math.atan2(e.dy,e.dx),power,false,e.club||'driver')});
 s.on('round-complete',r=>{if(ss.mode==='online'){ss.roundComplete=true;completeRound(r)}});
}
function emitAck(name,data,onSuccess,onError){if(!ss.socket?.connected){notify('Ingen aktiv forbindelse til serveren. Prøv igjen.',true);onError?.();return}ss.socket.timeout(8000).emit(name,data,(err,response)=>{if(err){notify('Serveren svarte ikke. Prøv igjen.',true);onError?.();return}if(response?.error){notify(response.error,true);onError?.();return}onSuccess?.(response)})}
function createRoom(){if(!ss.token)return notify('Du må logge inn for å spille online.',true);ss.mode='online';ss.roundComplete=false;emitAck('create',{course:ss.course})}
function joinRoom(){if(!ss.token)return notify('Du må logge inn for å spille online.',true);const code=$('code').value.trim().toUpperCase();if(!/^[A-F0-9]{6}$/.test(code))return notify('Lobbykoden må være 6 tegn (A–F og 0–9).',true);ss.mode='online';ss.roundComplete=false;emitAck('join',{code})}
function renderLobby(r){scene('room');setText('roomtitle',r.code);setText('roomstatus',r.started?'Runden er i gang.':'Inviter vennene dine og start når alle er klare.');setText('playercount',r.players.length+'/8');setText('roomcourse',COURSE_NAMES[r.course]||COURSE_NAMES[0]);setText('lobbyThumb',COURSE_EMOJI[r.course]||'⛳');$('start').classList.toggle('hidden',r.host!==ss.socket?.id);const players=$('players');players.replaceChildren();for(const p of r.players){const el=document.createElement('div');el.className='lobby-player';const a=document.createElement('span');a.className='avatar';a.textContent=p.name.slice(0,1).toUpperCase();const info=document.createElement('span'),b=document.createElement('b'),small=document.createElement('small');b.textContent=p.name;small.textContent=p.id===r.host?'Lobbyvert':'Spiller';info.append(b,small);el.append(a,info);if(p.userId&&p.id!==ss.socket?.id){const actions=document.createElement('div');actions.className='player-actions';const open=document.createElement('button');open.type='button';open.className='btn btn-glass btn-small';open.textContent='Profil';open.onclick=()=>social.openProfileById(p.userId);const report=document.createElement('button');report.type='button';report.className='btn btn-glass btn-small';report.textContent='Rapporter';report.onclick=()=>social.reportUser(p.userId,p.name);actions.append(open,report);el.append(actions)}players.append(el)}}
function syncPlayers(r){const ids=new Set(r.players.map(p=>p.id));for(const p of r.players){let b=ss.balls.get(p.id);if(!b){b={x:p.x??TEE.x,y:p.y??TEE.y,z:0,moving:false};ss.balls.set(p.id,b)}else if(!b.moving&&!ss.shots.has(p.id)&&ss.putting?.id!==p.id){ // position updates are authoritative when idle
   if(Number.isFinite(p.x)&&Number.isFinite(p.y)){b.x=p.x;b.y=p.y;b.z=0}
 }}for(const id of ss.balls.keys())if(!ids.has(id))ss.balls.delete(id)}
function loadBackground(){ss.holeCache=document.createElement('canvas');ss.holeCache.width=W*2;ss.holeCache.height=H*2;const c=ss.holeCache.getContext('2d');c.setTransform(2,0,0,2,0,0);paintCourse(c,ss.hole)}
function startSolo(daily=false){ss.mode=daily?'daily':'practice';ss.roundComplete=false;ss.dailySeed=daily?dailyNumericSeed():0;ss.course=daily?dailyCourse():ss.course;ss.scores=Array(9).fill(null);ss.holeDetails=Array(9).fill(null);ss.room={code:daily?'DAILY':'PRACTICE',course:ss.course,hole:0,started:true,host:'solo',players:[{id:'solo',name:ss.username||'Du',strokes:0,finished:false,x:TEE.x,y:TEE.y,score:Array(9).fill(null)}]};startHole(ss.course,0);notify(daily?'Dagens utfordring er i gang!':'Treningsrunden er i gang!')}
function startHole(course,index){ss.roundNonce++;ss.currentHole=index;ss.course=course;ss.hole=buildHole(course,index,ss.mode==='daily'?ss.dailySeed:0);ss.holeCache=null;loadBackground();ss.shots.clear();ss.putting=null;ss.replay=null;ss.lastReplay=null;ss.balls.clear();ss.phase='aim';ss.aim=0;ss.meter=0;ss.meterDir=1;setText('meterlabel','0 %');$('needle').style.left='0%';ss.finished=false;ss.pendingFinish=null;ss.localShots=0;ss.penalties=0;ss.putts=0;ss.roundComplete=false;
 const players=ss.room?.players||[{id:'solo',name:'Du'}];for(const p of players)ss.balls.set(p.id,{x:TEE.x,y:TEE.y,z:0,moving:false});if(!ss.balls.has(localId()))ss.balls.set(localId(),{x:TEE.x,y:TEE.y,z:0,moving:false});
 ss.clubId=recommendClub(ss.hole,ownBall()||TEE);$('clubSelect').value=ss.clubId;
 setText('gameCourse','FAIRWAY CLUB · '+COURSE_NAMES[course].toUpperCase());setText('holeTitle',`Hull ${index+1} · ${ss.hole.name}`);setText('holeSubtitle',COURSE_TAGS[course]);setText('holePar','PAR '+ss.hole.par);setText('holeLength',ss.hole.lengthYards+' yd');setText('courseTag','● HOLE '+String(index+1).padStart(2,'0'));setText('weatherTag',Math.abs(ss.hole.wind)<=1?'ROLIG · '+Math.abs(ss.hole.wind)+' MPH':(ss.hole.wind>0?'ØSTAVIND':'VESTAVIND')+' · '+Math.abs(ss.hole.wind)+' MPH');setText('gameTip',['Se etter sand og vann. Vind kan flytte ballen mens den er i lufta.','Trær bremser ballen. Sikt rundt trærne for en ren fairway.','Vinden kan være kraftig i høyfjellet. Bruk retningsjusteringen.'][course]);
 $('holeOverlay').classList.add('hidden');$('roundEnd').classList.add('hidden');$('lastShotPanel').classList.add('hidden');$('puttsCount').textContent='–';$('puttsMessage').textContent='Putter vises her så snart ballen kommer inn på greenen.';updatePuttBars(0);scene('game');updateHud();renderLeaderboard();renderScorecard();updateClubUI()}
function updatePuttBars(active){[...$('puttProgress').children].forEach((el,i)=>el.classList.toggle('active',i<active))}
function updateHud(){if(!ss.hole||$('game').classList.contains('hidden'))return;const b=ownBall(),hole=ss.hole;
 setText('holeIndex',`${String(ss.currentHole+1).padStart(2,'0')} / 09`);setText('strokes',ss.localShots);setText('distance',`${b?distanceYards(hole,b):hole.lengthYards} yd`);setText('wind',(hole.wind>=0?'↗ ':'↖ ')+Math.abs(hole.wind));
 let played=0,par=0;for(let i=0;i<ss.currentHole;i++)if(ss.scores[i]!=null){played+=ss.scores[i];par+=buildHole(ss.course,i,ss.mode==='daily'?ss.dailySeed:0).par}setText('relativeScore',par?relative(played,par):'E');
 setText('aimValue',Math.round(ss.aim*180/Math.PI)+'°');$('aimSlider').value=String(Math.round(ss.aim*180/Math.PI));
 const phase=ss.phase;const titles={aim:'Finn den perfekte linjen',locked:'Retningen er låst',power:'Velg riktig lengde',flight:'Ballen er i bevegelse',putting:'Se ballen rulle inn',done:'Hullet er fullført'};
 const hints={aim:'Beveg musen på banen, eller bruk knappene for å finjustere.',locked:'Siktelinjen er låst. Trykk SLÅ for å starte måleren.',power:'Stopp måleren ved ønsket yardlengde. 50 % gir omtrent halv slaglengde.',flight:'Følg ballen i lufta, ved landing og under rulling.',putting:'Hver putt vises på banen før scoren registreres.',done:'Se puttescore og velg neste hull når du er klar.'};
 setText('phase',({aim:'SIKT',locked:'LÅST',power:'TIMING',flight:'I LUFTA',putting:'PUTTING',done:'FERDIG'})[phase]);setText('phaseTitle',titles[phase]);setText('hint',hints[phase]);
 const label={aim:'1 · Lås retning',locked:'2 · Start kraftmåler',power:'3 · Slå ballen!',flight:'Ballen flyr ...',putting:'Putting pågår ...',done:'Hull fullført ✓'}[phase];$('swing').innerHTML='';$('swing').append(document.createTextNode(label));const arrow=document.createElement('span');arrow.textContent=phase==='done'?'✓':'⟶';$('swing').append(arrow);
 $('swing').disabled=['flight','putting','done'].includes(phase);$('unlock').disabled=!['locked','power'].includes(phase);$('replay').disabled=!ss.lastReplay||phase==='flight'||phase==='putting';$('aimMinus').disabled=phase!=='aim';$('aimPlus').disabled=phase!=='aim';$('aimSlider').disabled=phase!=='aim';$('clubSelect').disabled=phase!=='aim';$('recommendedClub').disabled=phase!=='aim';
 renderScorecard();renderLeaderboard();updateClubUI();
}
function renderScorecard(){const grid=$('scorecard');if(!ss.hole)return;grid.replaceChildren();ss.scores.forEach((s,i)=>{const h=buildHole(ss.course,i,ss.mode==='daily'?ss.dailySeed:0);const box=document.createElement('div');box.className='score-cell'+(ss.currentHole===i?' active':'');const small=document.createElement('small');small.textContent=String(i+1).padStart(2,'0');const n=document.createElement('strong');n.textContent=s==null?'–':String(s);if(s!=null&&s<h.par)n.className='under';const sm=document.createElement('small');sm.textContent='P '+h.par;box.append(small,n,sm);grid.append(box)});
 const completed=ss.scores.filter(x=>x!=null).length,total=ss.scores.reduce((n,x)=>n+(x||0),0),par=ss.scores.reduce((n,x,i)=>n+(x!=null?buildHole(ss.course,i,ss.mode==='daily'?ss.dailySeed:0).par:0),0);setText('scoreSummary',completed?`${completed} av 9 hull · ${total} slag · ${relative(total,par)} mot par`:'Fullfør et hull for å starte scorekortet.')}
function renderLeaderboard(){const root=$('leaderboard');if(!ss.room)return;const players=ss.room.players||[];const sorted=[...players].sort((a,b)=>{const aa=(a.score||[]).reduce((s,v)=>s+(v||0),0)+(a.strokes||0),bb=(b.score||[]).reduce((s,v)=>s+(v||0),0)+(b.strokes||0);return aa-bb});root.replaceChildren();for(const [i,p] of sorted.entries()){const d=document.createElement('div');d.className='leaderboard-row';const rank=document.createElement('span');rank.className='leaderboard-position';rank.textContent=i+1;const name=document.createElement('span');name.className='leaderboard-name';name.textContent=p.name+(p.id===localId()?' (du)':'')+(p.finished?' ✓':'');const score=document.createElement('strong');score.className='leaderboard-score';const sc=(p.score||[]).reduce((s,v)=>s+(v||0),0)+(p.finished?0:p.strokes||0);score.textContent=sc+' slag';d.append(rank,name,score);root.append(d)}
 const all=players.length>0&&players.every(p=>p.finished);$('next').classList.toggle('hidden',!isOnline()||!isHost()||!all);$('next').textContent=ss.currentHole===8?'Avslutt runden ↗':'Neste hull ↗';if(ss.finished&&isOnline()){const pending=!!ss.pendingFinish;const can=!pending&&isHost()&&all;$('overlayNext').disabled=pending||!can;$('overlayNext').textContent=can?(ss.currentHole===8?'Se resultat ↗':'Neste hull ↗'):pending?'Lagrer resultat ...':'Venter på andre ...';$('waitingText').classList.toggle('hidden',can)}}
function setAimRad(rad){if(ss.phase!=='aim')return;ss.aim=Math.atan2(Math.sin(rad),Math.cos(rad));setText('aimValue',Math.round(ss.aim*180/Math.PI)+'°');$('aimSlider').value=Math.round(ss.aim*180/Math.PI);updateClubUI()}
function swing(){if(!ss.hole||ss.finished||!ownBall()||ss.phase==='flight'||ss.phase==='putting'||ss.phase==='done')return;
 if(ss.phase==='aim'){ss.phase='locked';playSound('lock');updateHud();return}
 if(ss.phase==='locked'){ss.phase='power';ss.meter=0;ss.meterDir=1;playSound('start');updateHud();return}
 if(ss.phase!=='power')return;const power=clamp(ss.meter/100,.01,1);const angle=ss.aim;
 ss.phase='flight';updateHud();
 if(isOnline()){const mag=5+power*100;emitAck('shot',{dx:Math.cos(angle)*mag,dy:Math.sin(angle)*mag,club:ss.clubId},()=>{ss.localShots++;launchShot(localId(),angle,power,true,ss.clubId);updateHud()},()=>{ss.phase='aim';ss.meter=0;updateHud()})}
 else{ss.localShots++;const p=ss.room?.players?.[0];if(p)p.strokes=ss.localShots;launchShot(localId(),angle,power,true,ss.clubId);updateHud()}
}
function launchShot(id,angle,power,mine,clubId='driver'){const b=ss.balls.get(id);if(!b||!ss.hole)return;const tr=planShot(ss.hole,b,angle,power,clubId);ss.shots.set(id,{tr,start:performance.now(),mine,nonce:ss.roundNonce});b.moving=true;b.z=0;
 if(mine){ss.lastReplay=tr;ss.replay=null;playSound('shot');$('replay').disabled=true;setText('puttsMessage','Ballen er i bevegelse ...');}
}
function handleShotEnd(id,entry){if(entry.nonce!==ss.roundNonce)return;const b=ss.balls.get(id);if(!b)return;b.moving=false;b.z=0;const hit=entry.tr.terrain;
 if(hit==='water'){b.x=entry.tr.from.x;b.y=entry.tr.from.y;if(entry.mine){ss.penalties++;ss.localShots++;if(!isOnline()&&ss.room?.players?.[0])ss.room.players[0].strokes=ss.localShots;notify('💧 Vannhinder! +1 straffeslag. Ballen er tilbake ved forrige posisjon.');playSound('splash')}}
 if(!entry.mine)return;
 const actualDist=Math.round(Math.hypot(b.x-entry.tr.from.x,b.y-entry.tr.from.y)*yardsPerPixel(ss.hole));
 setText('lastShotYards',actualDist+' yd');setText('lastShotClub',getClub(entry.tr.clubId).short);
 setText('lastShotLie',LIE_LABELS[hit]||'Fairway');
 setText('lastShotMeta',Math.round(entry.tr.carryYards)+' yd carry · '+Math.round(entry.tr.rollYards)+' yd planlagt rull');
 $('lastShotPanel').classList.remove('hidden');
 if(isOnline()&&ss.socket?.connected)ss.socket.emit('position',{x:b.x,y:b.y,finished:false});
 if(hit!=='water'&&nearGreen(b.x,b.y)){startPutting()}
 else{ss.phase='aim';ss.meter=0;ss.clubId=recommendClub(ss.hole,b);$('clubSelect').value=ss.clubId;setText('puttsMessage','Ballen har landet. Putting starter automatisk på greenen.');updateHud();if(hit==='sand')notify('⛱️ Sandbunker! Neste slag blir fra sanden.');else if(hit==='tree'||hit==='rock')notify('🌲 Hindring! Ballen har mistet mye fart.')}
}
function startPutting(){if(ss.putting||ss.finished||!ownBall())return;const b=ownBall(),distance=Math.hypot(b.x-CUP.x,b.y-CUP.y);const count=puttsNeeded(distance),targets=puttTargets({x:b.x,y:b.y},count);ss.putting={id:localId(),count,index:0,targets,from:{x:b.x,y:b.y},started:performance.now()+380,duration:750,nonce:ss.roundNonce};ss.phase='putting';ss.putts=count;setText('puttsCount',count+' PUTT'+(count>1?'ER':''));setText('puttsMessage','Putt 1 av '+count+' · Følg ballen mot hullet');updatePuttBars(0);playSound('putt');updateHud()}
function updatePutting(now){const p=ss.putting;if(!p||p.nonce!==ss.roundNonce)return;const b=ss.balls.get(p.id);if(!b){ss.putting=null;return}if(now<p.started)return;const t=clamp((now-p.started)/p.duration,0,1),ease=1-(1-t)**3,target=p.targets[p.index];b.x=p.from.x+(target.x-p.from.x)*ease;b.y=p.from.y+(target.y-p.from.y)*ease;b.z=0;b.moving=t<1;
 if(t>=1){b.x=target.x;b.y=target.y;p.index++;updatePuttBars(p.index);if(p.index>=p.count){b.moving=false;ss.putting=null;finishHole(p.count);return}p.from={x:b.x,y:b.y};p.started=now+390;setText('puttsMessage',`Putt ${p.index+1} av ${p.count} · Ballen ruller videre`);playSound('putt')}
}
function finishHole(putts){if(ss.finished)return;ss.finished=true;ss.phase='done';ss.localShots+=putts;ss.scores[ss.currentHole]=ss.localShots;ss.holeDetails[ss.currentHole]={strokes:ss.localShots,putts,penalties:ss.penalties,shots:ss.localShots-putts-ss.penalties};
 const title=niceScore(ss.localShots,ss.hole.par);setText('completeTitle',title);setText('completeSummary',`${ss.localShots} slag totalt · PAR ${ss.hole.par}`);setText('completeShots',`${ss.localShots-putts-ss.penalties} langslag`);setText('completePutts',`${putts} putt${putts===1?'':'er'}`);setText('completePenalties',`${ss.penalties} straffeslag`);setText('puttsMessage',`Ferdig! ${putts} putt${putts===1?'':'er'} · ${ss.localShots} slag totalt.`);setText('puttsCount',putts+' PUTT'+(putts>1?'ER':''));$('holeOverlay').classList.remove('hidden');achievementBadge('first');if(ss.localShots<ss.hole.par)achievementBadge('birdie');if(ss.localShots<=ss.hole.par-2)achievementBadge('eagle');if(ss.currentHole===8&&ss.holeDetails.every(x=>x&&x.penalties===0))achievementBadge('dry');playSound('complete');
 if(isOnline()){ss.pendingFinish={putts,strokes:ss.localShots};submitFinish();}else{const p=ss.room.players[0];p.strokes=0;p.finished=true;p.score[ss.currentHole]=ss.localShots}
 renderLeaderboard();updateHud();
}
function submitFinish(){
 if(!ss.pendingFinish)return;
 $('overlayNext').disabled=true;setText('overlayNext','Lagrer resultat ...');
 emitAck('finish',ss.pendingFinish,()=>{ss.pendingFinish=null;renderLeaderboard()},()=>{
  if(ss.room?.players?.find(p=>p.id===localId())?.finished){ss.pendingFinish=null;renderLeaderboard();return}
  $('overlayNext').disabled=false;setText('overlayNext','Prøv å lagre på nytt ↻');
  setText('waitingText','Resultatet ble ikke bekreftet av serveren. Prøv igjen.');$('waitingText').classList.remove('hidden');
 })
}
function nextHole(){if(isOnline()){if(!isHost())return notify('Bare lobbyverten kan gå videre.',true);if(!ss.room?.players.every(p=>p.finished))return notify('Alle spillere må fullføre hullet først.',true);emitAck('next',{});return}
 if(ss.currentHole>=8){completeRound(ss.room);return}ss.room.hole++;ss.room.players[0].finished=false;ss.room.players[0].strokes=0;startHole(ss.course,ss.room.hole)
}
function completeRound(r){ss.roundComplete=true;ss.shots.clear();ss.putting=null;ss.replay=null;$('holeOverlay').classList.add('hidden');$('roundEnd').classList.remove('hidden');const player=r?.players?.find(p=>p.id===localId())||r?.players?.[0];const scores=isOnline()?(player?.score||ss.scores):ss.scores;const total=scores.reduce((n,v)=>n+(v||0),0);const par=Array.from({length:9},(_,i)=>buildHole(ss.course,i).par).reduce((a,b)=>a+b,0);setText('roundTitle',total<par?'En runde for historiebøkene!':'Runden er fullført!');setText('roundSummary',`${COURSE_NAMES[ss.course]} · ${total} slag · ${relative(total,par)} mot par. ${isOnline()?'Takk for runden!':'Ditt resultat er lagret lokalt.'}`);
 if(!isOnline()){const key=ss.mode==='daily'?'fc_daily_best_'+dailyKey()+'_'+ss.course:null;if(key){const previous=Number(localStorage.getItem(key)||Infinity);if(total<previous)localStorage.setItem(key,String(total));achievementBadge('daily')}ss.history.unshift({date:new Date().toLocaleDateString('no-NO'),course:ss.course,strokes:total,daily:ss.mode==='daily'});ss.history=ss.history.slice(0,30);saveJSON('fc_history',ss.history)}achievementBadge('nine');renderAchievements();renderHistory();fetchProfile()}
function exitRound(){ss.roundNonce++;ss.shots.clear();ss.putting=null;ss.replay=null;ss.hole=null;ss.roundComplete=false;ss.currentHole=-1;$('roundEnd').classList.add('hidden');if(isOnline()&&ss.socket?.connected)ss.socket.emit('leave',{});ss.room=null;ss.mode='practice';dashboard()}
function updateShot(now){for(const [id,shot] of ss.shots){if(shot.nonce!==ss.roundNonce){ss.shots.delete(id);continue}const b=ss.balls.get(id);if(!b){ss.shots.delete(id);continue}const data=sampleShot(shot.tr,now-shot.start);b.x=data.x;b.y=data.y;b.z=data.z;b.moving=!data.done;if(data.done){ss.shots.delete(id);handleShotEnd(id,shot)}}}
function animation(now){const dt=Math.min(now-ss.lastTick,55);ss.lastTick=now;
 if(ss.hole){if(ss.phase==='power'){ss.meter+=ss.meterDir*dt*.095;if(ss.meter>=100){ss.meter=100;ss.meterDir=-1}if(ss.meter<=0){ss.meter=0;ss.meterDir=1}if(now-ss.lastMeterDraw>65){ss.lastMeterDraw=now;updateClubUI()}}
 updateShot(now);updatePutting(now);
 if(ss.replay){const data=sampleShot(ss.replay.tr,now-ss.replay.start);ss.replay.ball={x:data.x,y:data.y,z:data.z};if(data.done)ss.replay=null}
 if(!$('game').classList.contains('hidden')){ctx.clearRect(0,0,W,H);if(ss.holeCache)ctx.drawImage(ss.holeCache,0,0,W,H);
  // Aiming line is only drawn before the shot, never in flight, while rolling or while putting.
  if(['aim','locked','power'].includes(ss.phase)&&ownBall()&&!ss.replay)drawLandingGuide(ctx,ss.hole,ownBall(),ss.aim,ss.phase==='power'?Math.max(ss.meter/100,.01):1,ss.clubId);
  for(const [id,b] of ss.balls)if(id!==localId())drawBall(ctx,b);
  drawBall(ctx,ownBall(),{own:true});if(ss.replay?.ball)drawBall(ctx,ss.replay.ball,{ghost:true});
  if(now-ss.lastHud>135){ss.lastHud=now;const b=ownBall();if(b)setText('distance',distanceYards(ss.hole,b)+' yd')}
 }}
 requestAnimationFrame(animation)}
// Minimal sound effects, generated locally and only after an explicit user gesture.
let audioCtx=null;function playSound(kind){if(!ss.soundOn)return;try{audioCtx??=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),t=audioCtx.currentTime,tones={lock:[440,.075],start:[330,.08],shot:[180,.19],putt:[380,.09],splash:[120,.18],complete:[660,.32]},[f,d]=tones[kind]||tones.lock;osc.type=kind==='splash'?'sawtooth':'sine';osc.frequency.setValueAtTime(f,t);osc.frequency.exponentialRampToValueAtTime(f*(kind==='complete'?1.5:.66),t+d);gain.gain.setValueAtTime(.07,t);gain.gain.exponentialRampToValueAtTime(.001,t+d);osc.connect(gain);gain.connect(audioCtx.destination);osc.start(t);osc.stop(t+d+.015)}catch{}}
// Input binding
$('goHome').onclick=()=>{if(ss.hole||ss.mode==='online'&&ss.room){if(confirm('Forlate den pågående lobbyen eller runden?'))exitRound()}else if(ss.token)dashboard();else scene('landing')};
$('guestPlay').onclick=dashboard;
$('login').onclick=()=>auth('login');$('register').onclick=()=>auth('register');
$('password').addEventListener('keydown',e=>{if(e.key==='Enter')auth('login')});
$('logout').onclick=()=>{if(ss.hole)exitRound();ss.socket?.disconnect();ss.socket=null;ss.token='';ss.username='';localStorage.removeItem('fc_token');localStorage.removeItem('fc_name');social.onLogout();setAuth();scene('landing');notify('Du er logget ut.')};
$('practice').onclick=()=>startSolo(false);$('daily').onclick=()=>startSolo(true);
$('create').onclick=createRoom;$('join').onclick=joinRoom;
$('code').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom()});
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(ss.room.code);notify('Lobbykoden er kopiert!')}catch{notify('Lobbykode: '+ss.room.code)}};
$('start').onclick=()=>emitAck('start',{});$('leave').onclick=exitRound;$('leaveGame').onclick=()=>{if(confirm('Vil du avslutte runden?'))exitRound()};
$('swing').onclick=swing;
$('clubSelect').onchange=e=>selectClub(e.target.value);
$('recommendedClub').onclick=()=>{const b=ownBall();if(!b||!ss.hole)return;selectClub(recommendClub(ss.hole,b));notify('Foreslått kølle valgt!')};
$('unlock').onclick=()=>{if(['locked','power'].includes(ss.phase)){ss.phase='aim';ss.meter=0;setText('meterlabel','0 %');$('needle').style.left='0%';updateHud()}};
$('aimMinus').onclick=()=>setAimRad(ss.aim-.035);$('aimPlus').onclick=()=>setAimRad(ss.aim+.035);
$('aimSlider').addEventListener('input',e=>setAimRad(Number(e.target.value)*Math.PI/180));
// Only commit a mouse-based aim after the pointer rests briefly on a target.
// This prevents the angle drifting as the user moves toward the SLÅ button.
let aimHoverTimer=null;
cv.addEventListener('pointermove',e=>{
 if(ss.phase!=='aim'||!ss.hole)return;
 const b=ownBall();if(!b)return;
 const rect=cv.getBoundingClientRect();
 const x=(e.clientX-rect.left)*W/rect.width,y=(e.clientY-rect.top)*H/rect.height;
 if(Math.hypot(x-b.x,y-b.y)<=20)return;
 const angle=Math.atan2(y-b.y,x-b.x);
 clearTimeout(aimHoverTimer);
 aimHoverTimer=setTimeout(()=>{if(ss.phase==='aim')setAimRad(angle)},85);
});
cv.addEventListener('pointerleave',()=>clearTimeout(aimHoverTimer));
// Intentionally no pointerdown/click handler on the course: the SLÅ button is the only way to shoot.
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)&&document.activeElement?.type!=='range')return;if($('game').classList.contains('hidden'))return;if(e.code==='ArrowLeft'||e.code==='ArrowRight'){if(ss.phase==='aim'){e.preventDefault();setAimRad(ss.aim+(e.code==='ArrowLeft'?-.035:.035))}}});
$('replay').onclick=()=>{if(!ss.lastReplay||ss.phase==='flight'||ss.phase==='putting')return;ss.replay={tr:ss.lastReplay,start:performance.now(),ball:null};notify('↻ Viser en reprise av forrige slag. Ballens nåværende posisjon endres ikke.')};
$('sound').onclick=()=>{ss.soundOn=!ss.soundOn;localStorage.setItem('fc_sound',ss.soundOn?'yes':'no');$('sound').setAttribute('aria-pressed',String(ss.soundOn));setText('sound',ss.soundOn?'♫ Lyd på':'♫ Lyd av');if(ss.soundOn)playSound('lock')};
$('next').onclick=nextHole;$('overlayNext').onclick=()=>ss.pendingFinish?submitFinish():nextHole();
$('scoreDetail').onclick=()=>{const details=ss.holeDetails.map((d,i)=>d?`Hull ${i+1}: ${d.strokes} slag, ${d.putts} putter, ${d.penalties} straffeslag`:null).filter(Boolean);notify(details.length?details.join(' · '):'Ingen fullførte hull ennå.')};
$('backClub').onclick=exitRound;$('newSolo').onclick=()=>{exitRound();startSolo(false)};
// Initialization
const social=initSocial({getToken:()=>ss.token,getRoom:()=>ss.room,getSocket:()=>ss.socket,getUsername:()=>ss.username,notify,navigate:scene,updateName:(name)=>{ss.username=name;localStorage.setItem('fc_name',name);setAuth();fetchProfile()}});
for(const club of CLUBS){const opt=document.createElement('option');opt.value=club.id;opt.textContent=`${club.short} · ${club.name} · ${club.carry} yd carry`;$('clubSelect').append(opt)}
$('clubSelect').value=ss.clubId;
setAuth();renderCourses();renderAchievements();renderHistory();setText('sound',ss.soundOn?'♫ Lyd på':'♫ Lyd av');$('sound').setAttribute('aria-pressed',String(ss.soundOn));
if(ss.token){connectSocket();dashboard()}else scene('landing');
requestAnimationFrame(animation);
