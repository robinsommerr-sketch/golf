const $ = id => document.getElementById(id);
const dt = d => {try{return new Date(d).toLocaleString(window.FairwayLanguage?.get()==='no'?'nb-NO':'en-GB',{dateStyle:'short',timeStyle:'short'})}catch{return ''}};
const val = (x, fallback='') => x==null?fallback:String(x);
function make(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=val(text);if(cls)el.className=cls;return el}
function button(text,onClick,cls='btn btn-glass btn-small'){const el=make('button',text,cls);el.type='button';el.addEventListener('click',onClick);return el}
function empty(el,text){el.replaceChildren(make('p',text,'muted'))}
function item(title,sub='',actions=[]){const row=make('div',undefined,'social-list-row');const body=make('div',undefined,'social-list-info');body.append(make('strong',title),make('small',sub));row.append(body);if(actions.length){const bar=make('div',undefined,'social-row-actions');bar.append(...actions);row.append(bar)}return row}

export function initSocial({getToken,getRoom,getSocket,getUsername,notify,navigate,updateName}){
 const state={me:null,friends:[],lobbyCode:null,lobbyMessages:[],dmId:null,dmName:'',dmMessages:[],adminSelected:null,reportMessageId:null,adminTab:'reports',profileOther:null};
 const routes={profile:'socialTabProfile',friends:'socialTabFriends',messages:'socialTabMessages',report:'socialTabReport'};
 const adminRoutes={reports:'adminTabReports',logs:'adminTabLogs',users:'adminTabUsers',security:'adminTabSecurity'};
 async function api(path,{method='GET',body}={}){
  const token=getToken();if(!token)throw Error('Logg inn først');
  const response=await fetch(path,{method,headers:{'Authorization':'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({error:'Ugyldig serversvar'}));
  if(!response.ok){if(data.code==='BANNED')showBan(data);if(data.code==='RENAME_REQUIRED')openCommunity('profile');const error=new Error(data.error||'Forespørselen feilet');error.data=data;throw error}
  return data;
 }
 async function attempt(fn){try{await fn()}catch(e){notify(e.message||'Noe gikk galt',true)}}
 function showBan(ban){
  $('banReason').textContent=ban.reason||'Ingen begrunnelse oppgitt';
  $('banUntil').textContent=ban.expires_at?'Utestengelsen varer til '+dt(ban.expires_at):'Utestengt på ubestemt tid';
  navigate('banScreen');
 }
 function navAfter(){const r=getRoom();if(r?.started)navigate('game');else if(r?.code)navigate('room');else navigate(getToken()?'dashboard':'landing')}
 function openCommunity(tab='profile'){
  if(!getToken()){notify('Logg inn for å åpne profil og meldinger',true);return}
  $('otherProfile').classList.add('hidden');navigate('community');chooseTab(tab);if(!state.me)refreshIdentity();
 }
 function chooseTab(tab){if(!routes[tab])tab='profile';for(const [key,id] of Object.entries(routes))$(id).classList.toggle('hidden',key!==tab);
  for(const t of document.querySelectorAll('[data-social-tab]'))t.classList.toggle('active',t.dataset.socialTab===tab);
  if(tab==='friends'||tab==='messages')refreshFriends();}
 function chooseAdmin(tab){if(!adminRoutes[tab])tab='reports';state.adminTab=tab;for(const [key,id] of Object.entries(adminRoutes))$(id).classList.toggle('hidden',key!==tab);
  for(const t of document.querySelectorAll('[data-admin-tab]'))t.classList.toggle('active',t.dataset.adminTab===tab);
  if(tab==='reports')loadReports();if(tab==='logs')loadLogs();if(tab==='security')loadSecurity();}
 async function refreshIdentity(){
  if(!getToken()){state.me=null;for(const id of ['navSocial','navProfile','navAdmin'])$(id).classList.add('hidden');return}
  try{const data=await api('/api/account/status');state.me=data.user;
   $('navSocial').classList.remove('hidden');$('navProfile').classList.remove('hidden');$('navAdmin').classList.toggle('hidden',!['admin','owner'].includes(state.me.role));
   $('ownerControls').classList.toggle('hidden',state.me.role!=='owner');$('renameAlert').classList.toggle('hidden',!state.me.needs_rename);
   $('socialMyName').textContent=state.me.username;
   $('socialMyStats').textContent=`${state.me.games} registrerte runder · ${state.me.strokes} slag`;
   $('socialMyBio').textContent=state.me.bio||'Ingen profiltekst ennå.';
   $('profileBioInput').value=state.me.bio||'';
   $('socialProfileDetails').textContent=`Spiller #${state.me.id} · Medlem siden ${dt(state.me.created_at)} · Rolle: ${state.me.role}`;
   if(data.ban){showBan(data.ban);return}
   if(state.me.needs_rename){openCommunity('profile');notify('Du må endre brukernavn før du kan chatte eller spille online.',true)}
  }catch(e){if(e.data?.code==='BANNED')return;notify('Kunne ikke hente profilen: '+e.message,true)}
 }
 async function onLogin(data={}){await refreshIdentity();if(data.needsRename)openCommunity('profile')}
 function onLogout(){state.me=null;state.friends=[];state.dmId=null;state.lobbyCode=null;state.lobbyMessages=[];for(const id of ['navSocial','navProfile','navAdmin'])$(id).classList.add('hidden')}
 function onRoom(room){
  if(!room?.code||!getToken())return;
  if(state.lobbyCode!==room.code){state.lobbyCode=room.code;state.lobbyMessages=[];
   renderLobby();attempt(async()=>{const data=await api('/api/chat/lobby/'+encodeURIComponent(room.code));if(state.lobbyCode===room.code){state.lobbyMessages=data.messages;renderLobby()}})}
 }
 function chatMessage(m){const row=make('div',undefined,'chat-message'+(String(m.senderId)===String(state.me?.id)?' mine':''));
  const top=make('div',undefined,'chat-message-top');top.append(make('strong',m.senderName),make('time',dt(m.createdAt)));
  const body=make('p',m.text,m.flagged?'censored-ui-text':'player-message-text');row.append(top,body);
  if(m.flagged)row.append(make('small','⚑ Automatisk sensurert','censored-hint'));
  if(String(m.senderId)!==String(state.me?.id))row.append(button('Rapporter',()=>reportMessage(m),'message-report'));
  return row;
 }
 function displayChat(root,messages,text){const el=$(root);el.replaceChildren();if(!messages.length){empty(el,text);return}for(const m of messages.slice(-80))el.append(chatMessage(m));el.scrollTop=el.scrollHeight}
 function renderLobby(){displayChat('lobbyChatList',state.lobbyMessages,'Ingen meldinger ennå. Si hei!');displayChat('gameChatList',state.lobbyMessages,'Ingen meldinger ennå.')}
 async function submitLobby(input){const r=getRoom();if(!r?.code)return notify('Du må være i en lobby',true);const text=$(input).value.trim();if(!text)return;
  const result=await api('/api/chat/send',{method:'POST',body:{type:'lobby',code:r.code,text}});$(input).value='';
  if(!getSocket()?.connected)ingestMessage(result.message);
 }
 function ingestMessage(m){if(!m?.id)return;
  if(m.lobbyCode&&m.lobbyCode===state.lobbyCode){if(!state.lobbyMessages.some(x=>x.id===m.id)){state.lobbyMessages.push(m);state.lobbyMessages=state.lobbyMessages.slice(-80)}renderLobby()}
  if(m.recipientId&&state.dmId&&[String(m.senderId),String(m.recipientId)].includes(String(state.dmId))&&
     [String(m.senderId),String(m.recipientId)].includes(String(state.me?.id))){
    if(!state.dmMessages.some(x=>x.id===m.id)){state.dmMessages.push(m);state.dmMessages=state.dmMessages.slice(-80)}renderDm()}
  if(m.recipientId&&String(m.senderId)!==String(state.me?.id)&&$('community').classList.contains('hidden')){
    $('unreadBadge').classList.remove('hidden');notify('Ny privatmelding fra '+m.senderName)}
 }
 async function refreshFriends(){if(!getToken())return;try{const result=await api('/api/friends');state.friends=result.friends;renderFriends()}catch(e){notify(e.message,true)}}
 function renderFriends(){
  const f=$('friendsList'),d=$('dmFriends');f.replaceChildren();d.replaceChildren();
  if(!state.friends.length){empty(f,'Du har ingen venner ennå. Søk etter en spiller til venstre.');empty(d,'Legg til en venn før du kan chatte privat.');return}
  for(const friend of state.friends){const actions=[];
   if(friend.status==='pending'&&friend.direction==='incoming'){
    actions.push(button('Godta',()=>attempt(async()=>{await api('/api/friends/respond',{method:'POST',body:{id:friend.id,action:'accept'}});refreshFriends();notify('Venneforespørsel godtatt!')}),'btn btn-primary btn-small'));
    actions.push(button('Avslå',()=>attempt(async()=>{await api('/api/friends/respond',{method:'POST',body:{id:friend.id,action:'decline'}});refreshFriends()})));
   }else if(friend.status==='accepted'){
    actions.push(button('Chat',()=>openDm(friend.userId,friend.username),'btn btn-primary btn-small'));
    actions.push(button('Profil',()=>openProfileById(friend.userId)));
    actions.push(button('Fjern',()=>attempt(async()=>{if(!confirm('Fjerne '+friend.username+' fra venner?'))return;await api('/api/friends/respond',{method:'POST',body:{id:friend.id,action:'remove'}});refreshFriends()})));
   }else actions.push(button('Trekk tilbake',()=>attempt(async()=>{await api('/api/friends/respond',{method:'POST',body:{id:friend.id,action:'remove'}});refreshFriends()})));
   const label=friend.status==='pending'?(friend.direction==='incoming'?'Vil bli venn med deg':'Forespørsel sendt'):'Venn';f.append(item(friend.username,label,actions));
   if(friend.status==='accepted')d.append(item(friend.username,'Trykk for å åpne privat samtale',[button('Åpne chat',()=>openDm(friend.userId,friend.username),'btn btn-primary btn-small')]));
  }
  if(!d.childElementCount)empty(d,'Ingen godkjente venner ennå.');
 }
 async function searchFriends(){const q=$('friendSearchInput').value.trim();if(q.length<2)return;
  const data=await api('/api/users/search?q='+encodeURIComponent(q));const root=$('friendSearchResults');root.replaceChildren();
  for(const u of data.users){root.append(item(u.username,`${u.games} runder`,[
   button('Profil',()=>openProfileById(u.id)),
   button('Legg til',()=>attempt(async()=>{await api('/api/friends/request',{method:'POST',body:{userId:u.id}});notify('Venneforespørsel sendt!');refreshFriends()}),'btn btn-primary btn-small'),
   button('Rapporter',()=>reportUser(u.id,u.username))]));}
  if(!data.users.length)empty(root,'Ingen spillere funnet.');
 }
 async function openProfileById(id){if(!getToken())return;openCommunity('friends');await attempt(async()=>{
  const data=await api('/api/profiles/'+encodeURIComponent(id));const p=data.profile;const root=$('otherProfile');root.replaceChildren();
  root.append(make('div','SPILLERPROFIL','aside-caption'),make('h2',p.username),make('p',p.bio||'Ingen profiltekst.'),
   make('p',`${p.games} runder · ${p.strokes} totale slag · Medlem siden ${dt(p.created_at)}`,'muted'));
  if(String(p.id)!==String(state.me?.id)){
   const buttons=make('div',undefined,'social-row-actions');
   if(!data.isFriend)buttons.append(button('Legg til venn',()=>attempt(async()=>{await api('/api/friends/request',{method:'POST',body:{userId:p.id}});notify('Venneforespørsel sendt!');refreshFriends()}),'btn btn-primary btn-small'));
   else buttons.append(button('Send melding',()=>openDm(p.id,p.username),'btn btn-primary btn-small'));
   buttons.append(button('Rapporter',()=>reportUser(p.id,p.username)));root.append(buttons);
  }
  root.classList.remove('hidden');root.scrollIntoView({behavior:'smooth',block:'nearest'});
 });}
 async function openDm(id,name){state.dmId=String(id);state.dmName=name;state.dmMessages=[];openCommunity('messages');$('unreadBadge').classList.add('hidden');
  $('dmTitle').textContent='Chat med '+name;$('dmChatInput').disabled=false;$('dmSend').disabled=false;renderDm();
  await attempt(async()=>{const data=await api('/api/chat/dm/'+encodeURIComponent(id));if(state.dmId===String(id)){state.dmMessages=data.messages;renderDm()}});
 }
 function renderDm(){displayChat('dmChatList',state.dmMessages,state.dmId?'Ingen meldinger ennå. Start samtalen!':'Velg en venn til venstre.')}
 async function sendDm(){if(!state.dmId)return;const text=$('dmChatInput').value.trim();if(!text)return;
  const result=await api('/api/chat/send',{method:'POST',body:{type:'dm',userId:state.dmId,text}});$('dmChatInput').value='';if(!getSocket()?.connected)ingestMessage(result.message);
 }
 function reportUser(id,name){openCommunity('report');state.reportMessageId=null;$('reportUser').value=val(id);$('reportDetails').value='';$('reportMessageReference').textContent='Rapporterer '+(name||'spiller #'+id)}
 function reportMessage(m){reportUser(m.senderId,m.senderName);state.reportMessageId=m.id;
  $('reportCategory').value='language';$('reportMessageReference').textContent=`Rapporterer melding #${m.id} fra ${m.senderName}. Meldingen legges ved som bevis.`;
 }
 async function submitReport(){const targetUserId=$('reportUser').value.trim(),category=$('reportCategory').value,details=$('reportDetails').value.trim();
  await api('/api/reports',{method:'POST',body:{targetUserId,category,details,messageId:state.reportMessageId}});
  $('reportDetails').value='';state.reportMessageId=null;$('reportMessageReference').textContent='';notify('Rapporten er sendt til administratorene. Takk!');chooseTab('friends');
 }
 function openAdmin(tab='reports'){
  if(!state.me||!['admin','owner'].includes(state.me.role))return notify('Ingen tilgang til adminpanelet.',true);
  navigate('admin');loadAdminOverview();chooseAdmin(tab);
 }
 async function loadAdminOverview(){await attempt(async()=>{const d=await api('/api/admin/overview');$('adminOpenCount').textContent=d.reports;$('adminFlaggedCount').textContent=d.flagged;$('adminAnomalyCount').textContent=d.anomalies})}
 async function loadReports(){await attempt(async()=>{
  const d=await api('/api/admin/reports?status='+$('adminReportStatus').value);const root=$('adminReportsList');root.replaceChildren();
  for(const r of d.reports){root.append(item(`#${r.id} · ${r.target}`,`${r.category} · fra ${r.reporter} · ${dt(r.created_at)}`,[button('Se bevis',()=>viewReport(r.id),'btn btn-primary btn-small')]))}
  if(!d.reports.length)empty(root,'Ingen rapporter i denne kategorien.');
 })}
 async function viewReport(id){await attempt(async()=>{
  const d=await api('/api/admin/reports/'+id),r=d.report,root=$('adminReportDetail');root.replaceChildren();
  root.append(make('h3',`Rapport #${r.id}: ${r.target}`),make('p',`${r.category} · rapportert av ${r.reporter} · ${dt(r.created_at)}`,'muted'),make('p',r.details));
  if(r.evidence?.reported_message)root.append(make('div','OPPRINNELIG RAPPORTERT MELDING','aside-caption'),make('blockquote',r.evidence.reported_message.text));
  if(d.context.length){root.append(make('div','SAMTALEKONTEKST · UREDAKTERT','aside-caption'));for(const m of d.context)root.append(make('p',`${m.username}: ${m.body_raw} (${dt(m.created_at)})`,'context-line'))}
  if(d.securityEvents.length){root.append(make('div','SERVERHENDELSER (KREVER MANUELL VURDERING)','aside-caption'));
    for(const e of d.securityEvents.slice(0,10))root.append(make('p',`${dt(e.created_at)} · ${e.event_type} · ${JSON.stringify(e.details)}`,'context-line'))}
  const notes=make('textarea',undefined,'admin-notes');notes.rows=3;notes.placeholder='Notater og vurdering ...';root.append(notes);
  const bar=make('div',undefined,'social-row-actions');for(const [txt,status] of [['Marker behandlet','reviewed'],['Avvis rapport','dismissed'],['Gjenåpne','open']]){
   bar.append(button(txt,()=>attempt(async()=>{await api('/api/admin/reports/'+id+'/resolve',{method:'POST',body:{status,notes:notes.value}});notify('Rapport oppdatert');loadReports();loadAdminOverview()}),status==='reviewed'?'btn btn-primary btn-small':'btn btn-outline btn-small'))}
  bar.append(button('Se bruker / ban',()=>{openAdmin('users');selectUser({id:r.target_id,username:r.target})}));root.append(bar);
 })}
 async function loadLogs(){await attempt(async()=>{
  const params=new URLSearchParams({scope:$('adminChatScope').value,q:$('adminChatQuery').value.trim(),code:$('adminChatCode').value.trim()});
  const d=await api('/api/admin/messages?'+params),root=$('adminChatResults');root.replaceChildren();
  for(const m of d.messages){root.append(item(`${m.sender_name}${m.recipient_name?' → '+m.recipient_name:' · #'+m.lobby_code}`,
    `${dt(m.created_at)} · ${m.flagged?'⚑ Sensurert · ':''}${m.body_raw}`,[button('Rapporter bruker',()=>reportUser(m.sender_id,m.sender_name))]))}
  if(!d.messages.length)empty(root,'Ingen meldinger funnet.');
 })}
 async function searchAdminUsers(){await attempt(async()=>{
  const d=await api('/api/admin/users?q='+encodeURIComponent($('adminUserQuery').value.trim())),root=$('adminUserResults');root.replaceChildren();
  for(const u of d.users)root.append(item(u.username,`${u.role} · ${u.ban?'Utestengt':'Aktiv'} · #${u.id}`,[button('Velg',()=>selectUser(u),'btn btn-primary btn-small')]));
  if(!d.users.length)empty(root,'Ingen brukere funnet.');
 })}
 function selectUser(u){state.adminSelected=u;$('adminSelectedTitle').textContent=u.username;
  $('adminSelectedMeta').textContent=`Spiller #${u.id} · Rolle: ${u.role||'player'} · ${u.ban?'Utestengt: '+u.ban.reason:'Ikke utestengt'}`;
  $('adminBanReason').value='';}
 async function banSelected(){const u=state.adminSelected;if(!u)return notify('Velg en bruker først.',true);
  const reason=$('adminBanReason').value.trim(),v=$('adminBanLength').value;
  if(reason.length<10)return notify('Skriv en konkret grunn på minst 10 tegn.',true);
  if(!confirm(`Utestenge ${u.username}? Begrunnelsen vises til spilleren.`))return;
  await api('/api/admin/bans',{method:'POST',body:{userId:u.id,reason,hours:v==='permanent'?null:Number(v)}});
  notify('Brukeren er utestengt.');$('adminBanReason').value='';loadAdminOverview();searchAdminUsers();}
 async function unbanSelected(){const u=state.adminSelected;if(!u)return notify('Velg en bruker først.',true);
  if(!confirm('Oppheve utestengelsen av '+u.username+'?'))return;await api('/api/admin/unban',{method:'POST',body:{userId:u.id}});notify('Utestengelsen er opphevet.');searchAdminUsers()}
 async function setRole(role){const u=state.adminSelected;if(!u)return notify('Velg en bruker først.',true);
  if(!confirm(`Endre rollen til ${u.username} til ${role}?`))return;await api('/api/admin/roles',{method:'POST',body:{userId:u.id,role}});notify('Rollen er oppdatert');searchAdminUsers()}
 async function loadSecurity(){await attempt(async()=>{
  const [a,b]=await Promise.all([api('/api/admin/security'),api('/api/admin/audit')]);
  const x=$('adminSecurityEvents'),y=$('adminAuditEvents');x.replaceChildren();y.replaceChildren();
  for(const e of a.events)x.append(item(e.username+' · '+e.event_type,dt(e.created_at)+' · '+JSON.stringify(e.details)));
  for(const e of b.events)y.append(item(e.actor+' · '+e.action,dt(e.created_at)+' · '+(e.target||'system')+' · '+JSON.stringify(e.details)));
  if(!a.events.length)empty(x,'Ingen mistenkelige hendelser registrert.');if(!b.events.length)empty(y,'Ingen adminhandlinger registrert.');
 })}
 function attachSocket(socket){
  socket.on('social:message',ingestMessage);
  socket.on('social:friend-request',e=>{notify('Ny venneforespørsel fra '+e.from);refreshFriends()});
  socket.on('social:friends-updated',refreshFriends);
  socket.on('social:banned',showBan);
  socket.on('social:role-changed',()=>{notify('Rettighetene dine har blitt oppdatert');refreshIdentity()});
  socket.on('social:new-report',()=>{if(state.me?.role==='admin'||state.me?.role==='owner'){loadAdminOverview();if(state.adminTab==='reports')loadReports()}});
 }
 $('navSocial').onclick=()=>openCommunity('messages');$('navProfile').onclick=()=>openCommunity('profile');$('navAdmin').onclick=()=>openAdmin();
 $('socialBack').onclick=navAfter;$('adminBack').onclick=navAfter;$('banLogout').onclick=()=>{$('logout').click();navigate('landing')};
 for(const b of document.querySelectorAll('[data-social-tab]'))b.onclick=()=>chooseTab(b.dataset.socialTab);
 for(const b of document.querySelectorAll('[data-admin-tab]'))b.onclick=()=>chooseAdmin(b.dataset.adminTab);
 $('profileBioForm').onsubmit=e=>{e.preventDefault();attempt(async()=>{await api('/api/account/profile',{method:'PATCH',body:{bio:$('profileBioInput').value}});notify('Profilen er oppdatert');refreshIdentity()})};
 $('renameForm').onsubmit=e=>{e.preventDefault();attempt(async()=>{const username=$('renameInput').value.trim(),password=$('renamePassword').value;
  await api('/api/account/username',{method:'POST',body:{username,password}});$('renamePassword').value='';updateName(username);notify('Brukernavnet ditt er oppdatert!');refreshIdentity()})};
 $('friendSearchForm').onsubmit=e=>{e.preventDefault();attempt(searchFriends)};
 $('lobbyChatForm').onsubmit=e=>{e.preventDefault();attempt(()=>submitLobby('lobbyChatInput'))};
 $('gameChatForm').onsubmit=e=>{e.preventDefault();attempt(()=>submitLobby('gameChatInput'))};
 $('dmChatForm').onsubmit=e=>{e.preventDefault();attempt(sendDm)};
 $('reportForm').onsubmit=e=>{e.preventDefault();attempt(submitReport)};
 $('adminReportStatus').onchange=loadReports;$('adminChatSearch').onsubmit=e=>{e.preventDefault();loadLogs()};
 $('adminUserSearch').onsubmit=e=>{e.preventDefault();searchAdminUsers()};
 $('adminBanForm').onsubmit=e=>{e.preventDefault();attempt(banSelected)};
 $('adminUnban').onclick=()=>attempt(unbanSelected);$('adminMake').onclick=()=>attempt(()=>setRole('admin'));$('adminRevoke').onclick=()=>attempt(()=>setRole('player'));
 document.addEventListener('fairway:languagechange',()=>{
  // Rerender timestamps in the chosen locale; UI text is translated by i18n.js.
  renderDm();renderLobby();
  if(state.me){
   $('socialProfileDetails').textContent=`Spiller #${state.me.id} · Medlem siden ${dt(state.me.created_at)} · Rolle: ${state.me.role}`;
  }
 });
 if(getToken())refreshIdentity();
 renderDm();renderLobby();
 return {api,onLogin,onLogout,refreshIdentity,onRoom,attachSocket,showBan,openCommunity,openProfileById,reportUser,openAdmin};
}
