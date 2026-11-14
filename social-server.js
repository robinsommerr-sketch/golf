import bcrypt from 'bcryptjs';
import {censorText, hasBadWords, validateUsername} from './moderation-filter.js';

const numberId = x => /^\d+$/.test(String(x ?? '')) ? String(x) : null;
const publicUser = u => u && ({id:String(u.id),username:u.username,role:u.role,games:u.games,strokes:u.strokes,bio:u.bio,created_at:u.created_at,needs_rename:u.needs_rename});
const max = (v,n) => typeof v === 'string' ? v.trim().slice(0,n) : '';
const assert = (condition,code,msg) => {if(!condition){const e=new Error(msg);e.status=code;throw e}};

export async function initSocialSchema(pool){
  // Idempotent migrations. Existing accounts and game statistics are retained.
  await pool.query(`ALTER TABLE public.golf_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player'`);
  await pool.query(`ALTER TABLE public.golf_users ADD COLUMN IF NOT EXISTS bio VARCHAR(160) NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE public.golf_users ADD COLUMN IF NOT EXISTS needs_rename BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE public.golf_users ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ`);
  await pool.query(`CREATE TABLE IF NOT EXISTS public.golf_friendships (
     id BIGSERIAL PRIMARY KEY, user_low BIGINT NOT NULL REFERENCES public.golf_users(id) ON DELETE CASCADE,
     user_high BIGINT NOT NULL REFERENCES public.golf_users(id) ON DELETE CASCADE,
     requested_by BIGINT NOT NULL REFERENCES public.golf_users(id) ON DELETE CASCADE,
     status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (user_low,user_high), CHECK (user_low < user_high))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS public.golf_chat_messages (
     id BIGSERIAL PRIMARY KEY, sender_id BIGINT NOT NULL REFERENCES public.golf_users(id) ON DELETE CASCADE,
     recipient_id BIGINT REFERENCES public.golf_users(id) ON DELETE CASCADE,
     lobby_code VARCHAR(6), body_raw VARCHAR(500) NOT NULL, body_public VARCHAR(550) NOT NULL,
     flagged BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     CHECK ((recipient_id IS NOT NULL AND lobby_code IS NULL) OR (recipient_id IS NULL AND lobby_code IS NOT NULL)))`);
  await pool.query(`CREATE INDEX IF NOT EXISTS golf_chat_scope_idx ON public.golf_chat_messages(lobby_code,created_at DESC) WHERE lobby_code IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS golf_chat_dm_idx ON public.golf_chat_messages(sender_id,recipient_id,created_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS public.golf_reports (
     id BIGSERIAL PRIMARY KEY, reporter_id BIGINT NOT NULL REFERENCES public.golf_users(id) ON DELETE CASCADE,
     target_id BIGINT NOT NULL REFERENCES public.golf_users(id) ON DELETE CASCADE,
     message_id BIGINT REFERENCES public.golf_chat_messages(id) ON DELETE SET NULL,
     category VARCHAR(20) NOT NULL CHECK (category IN ('language','cheating','spam','harassment','other')),
     details VARCHAR(1000) NOT NULL, evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
     status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
     reviewed_by BIGINT REFERENCES public.golf_users(id) ON DELETE SET NULL,
     resolution TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS golf_reports_queue_idx ON public.golf_reports(status,created_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS public.golf_bans (
     id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES public.golf_users(id) ON DELETE CASCADE,
     moderator_id BIGINT NOT NULL REFERENCES public.golf_users(id) ON DELETE CASCADE,
     reason VARCHAR(500) NOT NULL, expires_at TIMESTAMPTZ,
     lifted_at TIMESTAMPTZ, lifted_by BIGINT REFERENCES public.golf_users(id) ON DELETE SET NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS golf_bans_current_idx ON public.golf_bans(user_id,created_at DESC) WHERE lifted_at IS NULL`);
  await pool.query(`CREATE TABLE IF NOT EXISTS public.golf_admin_audit (
     id BIGSERIAL PRIMARY KEY, actor_id BIGINT REFERENCES public.golf_users(id) ON DELETE SET NULL,
     target_id BIGINT REFERENCES public.golf_users(id) ON DELETE SET NULL,
     action VARCHAR(60) NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS public.golf_security_events (
     id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES public.golf_users(id) ON DELETE CASCADE,
     event_type VARCHAR(60) NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const names=['golf_friendships','golf_chat_messages','golf_reports','golf_bans','golf_admin_audit','golf_security_events'];
  for(const name of names){
    await pool.query(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`REVOKE ALL ON TABLE public.${name} FROM anon, authenticated`);
  }
  // This application uses a server-owned PostgreSQL connection, never Supabase's client Data API.
}

export function installSocial({app,io,pool,rooms,broadcast,auth}) {
  const ownerId=numberId(process.env.OWNER_USER_ID);
  const roleFor=u=>ownerId&&String(u.id)===ownerId?'owner':u.role==='admin'?'admin':'player';
  const isStaff=u=>['admin','owner'].includes(roleFor(u));
  const getBan=async(id)=>{
    const {rows}=await pool.query(`SELECT id,reason,expires_at,created_at FROM public.golf_bans
      WHERE user_id=$1 AND lifted_at IS NULL AND (expires_at IS NULL OR expires_at>now())
      ORDER BY created_at DESC LIMIT 1`,[id]);return rows[0]||null;
  };
  const getUser=async(id)=>{
    const {rows}=await pool.query('SELECT id,username,role,needs_rename,bio,games,strokes,created_at,username_changed_at,password_hash FROM public.golf_users WHERE id=$1',[id]);
    if(!rows.length)return null;const u=rows[0];u.role=roleFor(u);return u;
  };
  async function sessionUser(id){const user=await getUser(id);if(user){if(!user.needs_rename&&hasBadWords(user.username)){await pool.query('UPDATE golf_users SET needs_rename=true WHERE id=$1',[id]);user.needs_rename=true}user.ban=await getBan(user.id)}return user;}
  function playable(req,res,next){if(req.user.ban)return res.status(403).json({code:'BANNED',reason:req.user.ban.reason,expires_at:req.user.ban.expires_at,error:'Kontoen er utestengt'});
    if(req.user.needs_rename)return res.status(403).json({code:'RENAME_REQUIRED',error:'Du må bytte brukernavn før du kan bruke chat og multiplayer.'});next();}
  function staff(req,res,next){if(!isStaff(req.user))return res.status(403).json({error:'Kun for administratorer'});next();}
  function owner(req,res,next){if(roleFor(req.user)!=='owner')return res.status(403).json({error:'Kun eieren kan gi adminrettigheter'});next();}
  const safe = fn => (req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>{if(e.status)return res.status(e.status).json({error:e.message});console.error('Social API:',e);res.status(500).json({error:'En serverfeil oppstod'})});
  const audit=(actor,target,action,details={})=>pool.query('INSERT INTO public.golf_admin_audit(actor_id,target_id,action,details) VALUES($1,$2,$3,$4)',[actor,target,action,JSON.stringify(details)]);
  const isFriend=async(a,b)=>{const lo=String(Math.min(Number(a),Number(b))),hi=String(Math.max(Number(a),Number(b)));
    const {rows}=await pool.query("SELECT 1 FROM public.golf_friendships WHERE user_low=$1 AND user_high=$2 AND status='accepted'",[lo,hi]);return !!rows.length;};
  const ownsLobby=(userId,code)=>{const r=rooms.get(code);return !!r && [...r.players.values()].some(p=>String(p.userId)===String(userId));};
  const rate=new Map();
  function rateUser(req,res,next){const key=String(req.user.id),now=Date.now(),a=rate.get(key)||{start:now,count:0,last:0};if(now-a.start>=60000){a.start=now;a.count=0;}
    if(now-a.last<750||a.count>=35)return res.status(429).json({error:'Du sender meldinger for raskt. Vent litt.'});a.last=now;a.count++;rate.set(key,a);next();}
  setInterval(()=>{const now=Date.now();for(const [k,a] of rate)if(now-a.last>120000)rate.delete(k)},120000).unref();

  app.get('/api/account/status',auth,safe(async(req,res)=>{
    const u=await sessionUser(req.user.id);assert(u,401,'Logg inn først');
    if(!u.needs_rename&&hasBadWords(u.username)){await pool.query('UPDATE golf_users SET needs_rename=true WHERE id=$1',[u.id]);u.needs_rename=true;}
    res.json({user:publicUser(u),ban:u.ban||null});
  }));
  app.post('/api/account/username',auth,safe(async(req,res)=>{
    const name=max(req.body?.username,40),password=req.body?.password;
    const problem=validateUsername(name);assert(!problem,400,problem||'');assert(typeof password==='string',400,'Bekreft med passordet ditt');
    const user=await getUser(req.user.id);assert(await bcrypt.compare(password,user.password_hash),403,'Feil passord');
    assert(user.needs_rename||!user.username_changed_at||Date.now()-new Date(user.username_changed_at).getTime()>=7*86400000,429,'Du kan bare bytte brukernavn hver 7. dag');
    try{await pool.query('UPDATE golf_users SET username=$1, needs_rename=false,username_changed_at=now() WHERE id=$2',[name,user.id])}
    catch(e){if(e.code==='23505')return res.status(409).json({error:'Brukernavnet er opptatt'});throw e}
    for(const r of rooms.values()){let changed=false;for(const p of r.players.values())if(String(p.userId)===String(user.id)){p.name=name;changed=true}if(changed)broadcast(r)}
    res.json({ok:true,username:name});
  }));
  app.patch('/api/account/profile',auth,playable,safe(async(req,res)=>{
    const bio=max(req.body?.bio,160);assert(!hasBadWords(bio),400,'Profilteksten inneholder ord som ikke er tillatt');
    await pool.query('UPDATE golf_users SET bio=$1 WHERE id=$2',[bio,req.user.id]);res.json({ok:true,bio});
  }));
  app.get('/api/profiles/:id',auth,playable,safe(async(req,res)=>{
    const id=numberId(req.params.id);assert(id,400,'Ugyldig spiller');const u=await getUser(id);assert(u,404,'Fant ikke spilleren');
    res.json({profile:publicUser(u),isFriend:u.id===req.user.id?false:await isFriend(req.user.id,u.id)});
  }));
  app.get('/api/users/search',auth,playable,safe(async(req,res)=>{
    const q=max(req.query.q,18);assert(q.length>=2,400,'Skriv minst to tegn');
    const {rows}=await pool.query('SELECT id,username,games,strokes FROM golf_users WHERE username ILIKE $1 AND id<>$2 AND needs_rename=false ORDER BY username LIMIT 15',[`%${q.replace(/[\\%_]/g,'\\$&')}%`,req.user.id]);
    res.json({users:rows.map(u=>({...u,id:String(u.id)}))});
  }));
  app.get('/api/friends',auth,playable,safe(async(req,res)=>{
    const {rows}=await pool.query(`SELECT f.id,f.status,f.requested_by,f.created_at,u.id AS user_id,u.username,u.games
      FROM golf_friendships f JOIN golf_users u ON u.id=CASE WHEN f.user_low=$1 THEN f.user_high ELSE f.user_low END
      WHERE f.user_low=$1 OR f.user_high=$1 ORDER BY f.updated_at DESC LIMIT 150`,[req.user.id]);
    res.json({friends:rows.map(r=>({id:String(r.id),userId:String(r.user_id),username:r.username,games:r.games,status:r.status,direction:String(r.requested_by)===String(req.user.id)?'outgoing':'incoming'}))});
  }));
  app.post('/api/friends/request',auth,playable,safe(async(req,res)=>{
    const target=numberId(req.body?.userId);assert(target&&target!==String(req.user.id),400,'Velg en annen spiller');assert(await getUser(target),404,'Fant ikke spilleren');
    const lo=Math.min(Number(target),Number(req.user.id)),hi=Math.max(Number(target),Number(req.user.id));
    const {rows}=await pool.query('SELECT id,status,requested_by FROM golf_friendships WHERE user_low=$1 AND user_high=$2',[lo,hi]);
    if(rows.length) return res.status(409).json({error:rows[0].status==='accepted'?'Dere er allerede venner':'En venneforespørsel finnes allerede'});
    await pool.query("INSERT INTO golf_friendships(user_low,user_high,requested_by,status) VALUES($1,$2,$3,'pending')",[lo,hi,req.user.id]);
    io.to('user:'+target).emit('social:friend-request',{from:req.user.username});res.json({ok:true});
  }));
  app.post('/api/friends/respond',auth,playable,safe(async(req,res)=>{
    const id=numberId(req.body?.id),action=req.body?.action;assert(id&&['accept','decline','remove'].includes(action),400,'Ugyldig handling');
    const {rows}=await pool.query('SELECT * FROM golf_friendships WHERE id=$1 AND (user_low=$2 OR user_high=$2)',[id,req.user.id]);assert(rows.length,404,'Fant ikke forespørselen');const f=rows[0];
    if(action==='accept'){assert(f.status==='pending'&&String(f.requested_by)!==String(req.user.id),403,'Bare mottakeren kan godta');await pool.query("UPDATE golf_friendships SET status='accepted',updated_at=now() WHERE id=$1",[id]);}
    else if(action==='decline'){assert(f.status==='pending'&&String(f.requested_by)!==String(req.user.id),403,'Bare mottakeren kan avslå');await pool.query('DELETE FROM golf_friendships WHERE id=$1',[id]);}
    else await pool.query('DELETE FROM golf_friendships WHERE id=$1',[id]);
    const other=String(f.user_low)===String(req.user.id)?f.user_high:f.user_low;io.to('user:'+other).emit('social:friends-updated',{});res.json({ok:true});
  }));
  const MESSAGE_FIELDS=`m.id,m.sender_id,m.recipient_id,m.lobby_code,m.body_public,m.flagged,m.created_at,u.username AS sender_name`;
  const formatMessage=m=>({id:String(m.id),senderId:String(m.sender_id),senderName:m.sender_name,recipientId:m.recipient_id==null?null:String(m.recipient_id),lobbyCode:m.lobby_code,text:m.body_public,flagged:m.flagged,createdAt:m.created_at});
  app.get('/api/chat/lobby/:code',auth,playable,safe(async(req,res)=>{
    const code=String(req.params.code||'').toUpperCase();assert(ownsLobby(req.user.id,code),403,'Du må være med i lobbyen for å se chatten');
    const {rows}=await pool.query(`SELECT ${MESSAGE_FIELDS} FROM golf_chat_messages m JOIN golf_users u ON m.sender_id=u.id
      WHERE lobby_code=$1 ORDER BY m.id DESC LIMIT 80`,[code]);res.json({messages:rows.reverse().map(formatMessage)});
  }));
  app.get('/api/chat/dm/:id',auth,playable,safe(async(req,res)=>{
    const other=numberId(req.params.id);assert(other&&await isFriend(req.user.id,other),403,'Privat chat er bare tilgjengelig mellom venner');
    const {rows}=await pool.query(`SELECT ${MESSAGE_FIELDS} FROM golf_chat_messages m JOIN golf_users u ON m.sender_id=u.id
      WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)
      ORDER BY m.id DESC LIMIT 80`,[req.user.id,other]);res.json({messages:rows.reverse().map(formatMessage)});
  }));
  app.post('/api/chat/send',auth,playable,rateUser,safe(async(req,res)=>{
    const kind=req.body?.type,text=req.body?.text;assert(['lobby','dm'].includes(kind),400,'Ugyldig chattype');
    assert(typeof text==='string'&&text.trim().length>=1&&text.length<=500,400,'Meldinger må være mellom 1 og 500 tegn');
    const clean=text.trim(),filtered=censorText(clean);let recipient=null,lobby=null;
    if(kind==='lobby'){lobby=max(req.body?.code,6).toUpperCase();assert(ownsLobby(req.user.id,lobby),403,'Du er ikke medlem av lobbyen');}
    else {recipient=numberId(req.body?.userId);assert(recipient&&await isFriend(req.user.id,recipient),403,'Du kan bare sende privatmeldinger til venner');}
    const {rows}=await pool.query(`INSERT INTO golf_chat_messages(sender_id,recipient_id,lobby_code,body_raw,body_public,flagged)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id,created_at`,[req.user.id,recipient,lobby,clean,filtered.text,filtered.flagged]);
    const message=formatMessage({...rows[0],sender_id:req.user.id,sender_name:req.user.username,recipient_id:recipient,lobby_code:lobby,body_public:filtered.text,flagged:filtered.flagged});
    if(lobby)io.to(lobby).emit('social:message',message);
    else {io.to('user:'+recipient).emit('social:message',message);io.to('user:'+req.user.id).emit('social:message',message);}
    res.json({message});
  }));
  app.post('/api/reports',auth,playable,safe(async(req,res)=>{
    const target=numberId(req.body?.targetUserId),category=req.body?.category,details=max(req.body?.details,1000),messageId=req.body?.messageId?numberId(req.body.messageId):null;
    assert(target&&target!==String(req.user.id),400,'Velg spilleren du vil rapportere');
    assert(['language','cheating','spam','harassment','other'].includes(category),400,'Velg en gyldig årsak');
    assert(details.length>=10,400,'Beskriv hendelsen med minst 10 tegn');
    assert(await getUser(target),404,'Spilleren finnes ikke');
    let evidence={submitted_details:details};
    if(messageId){
      const {rows}=await pool.query(`SELECT m.*,u.username AS sender_name FROM golf_chat_messages m
        JOIN golf_users u ON u.id=m.sender_id WHERE m.id=$1 AND m.sender_id=$2`,[messageId,target]);
      assert(rows.length,404,'Meldingen ble ikke funnet');const m=rows[0];
      assert(m.lobby_code?ownsLobby(req.user.id,m.lobby_code):String(m.recipient_id)===String(req.user.id),403,'Du kan bare rapportere meldinger du har tilgang til');
      // Snapshot retains the reported message even when the chat retention period ends.
      evidence={...evidence,reported_message:{id:String(m.id),text:m.body_raw,at:m.created_at,scope:m.lobby_code?'lobby':'dm',lobbyCode:m.lobby_code}};
    }
    const last=await pool.query('SELECT created_at FROM golf_reports WHERE reporter_id=$1 ORDER BY id DESC LIMIT 1',[req.user.id]);
    assert(!last.rows.length||Date.now()-new Date(last.rows[0].created_at).getTime()>20000,429,'Vent litt før du sender flere rapporter');
    await pool.query(`INSERT INTO golf_reports(reporter_id,target_id,message_id,category,details,evidence)
      VALUES($1,$2,$3,$4,$5,$6)`,[req.user.id,target,messageId,category,details,JSON.stringify(evidence)]);
    io.to('staff').emit('social:new-report',{});res.json({ok:true});
  }));
  app.get('/api/admin/overview',auth,staff,safe(async(req,res)=>{
    const [reports,flagged,anomalies]=await Promise.all([
      pool.query("SELECT COUNT(*)::int AS n FROM golf_reports WHERE status='open'"),
      pool.query("SELECT COUNT(*)::int AS n FROM golf_chat_messages WHERE flagged AND created_at > now()-interval '7 days'"),
      pool.query("SELECT COUNT(*)::int AS n FROM golf_security_events WHERE created_at>now()-interval '7 days'")]);
    res.json({reports:reports.rows[0].n,flagged:flagged.rows[0].n,anomalies:anomalies.rows[0].n});
  }));
  app.get('/api/admin/reports',auth,staff,safe(async(req,res)=>{
    const status=['open','reviewed','dismissed'].includes(req.query.status)?req.query.status:'open';
    const {rows}=await pool.query(`SELECT r.*,a.username AS reporter,b.username AS target
      FROM golf_reports r JOIN golf_users a ON a.id=r.reporter_id JOIN golf_users b ON b.id=r.target_id
      WHERE r.status=$1 ORDER BY r.id DESC LIMIT 80`,[status]);res.json({reports:rows.map(r=>({...r,id:String(r.id),target_id:String(r.target_id)}))});
  }));
  app.get('/api/admin/reports/:id',auth,staff,safe(async(req,res)=>{
    const id=numberId(req.params.id);assert(id,400,'Ugyldig rapport');
    const {rows}=await pool.query(`SELECT r.*,a.username AS reporter,b.username AS target FROM golf_reports r
     JOIN golf_users a ON a.id=r.reporter_id JOIN golf_users b ON b.id=r.target_id WHERE r.id=$1`,[id]);assert(rows.length,404,'Fant ikke rapporten');
    const report=rows[0];let context=[];
    if(report.message_id){const m=await pool.query('SELECT id,sender_id,recipient_id,lobby_code FROM golf_chat_messages WHERE id=$1',[report.message_id]);
      if(m.rows.length){const msg=m.rows[0];
        const q=msg.lobby_code
        ?await pool.query(`SELECT m.id,m.body_raw,m.flagged,m.created_at,u.username FROM golf_chat_messages m JOIN golf_users u ON u.id=m.sender_id WHERE m.lobby_code=$1 AND m.id BETWEEN $2::bigint-5 AND $2::bigint+5 ORDER BY m.id`,[msg.lobby_code,report.message_id])
        :await pool.query(`SELECT m.id,m.body_raw,m.flagged,m.created_at,u.username FROM golf_chat_messages m JOIN golf_users u ON u.id=m.sender_id WHERE ((m.sender_id=$1 AND m.recipient_id=$2) OR (m.sender_id=$2 AND m.recipient_id=$1)) AND m.id BETWEEN $3::bigint-20 AND $3::bigint+20 ORDER BY m.id LIMIT 12`,[msg.sender_id,msg.recipient_id,report.message_id]);
        context=q.rows.map(m=>({...m,id:String(m.id)}));}
    }
    const suspicious=await pool.query('SELECT event_type,details,created_at FROM golf_security_events WHERE user_id=$1 ORDER BY id DESC LIMIT 20',[report.target_id]);
    res.json({report:{...report,id:String(report.id),target_id:String(report.target_id)},context,securityEvents:suspicious.rows});
  }));
  app.post('/api/admin/reports/:id/resolve',auth,staff,safe(async(req,res)=>{
    const id=numberId(req.params.id),status=req.body?.status,notes=max(req.body?.notes,500);
    assert(id&&['reviewed','dismissed','open'].includes(status),400,'Ugyldig status');
    const result=await pool.query('UPDATE golf_reports SET status=$1,resolution=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$4 RETURNING target_id',[status,notes,req.user.id,id]);assert(result.rowCount,404,'Fant ikke rapporten');
    await audit(req.user.id,result.rows[0].target_id,'resolve-report',{reportId:id,status,notes});res.json({ok:true});
  }));
  app.get('/api/admin/messages',auth,staff,safe(async(req,res)=>{
    const scope=['lobby','dm','all'].includes(req.query.scope)?req.query.scope:'all',q=max(req.query.q,100),code=max(req.query.code,6).toUpperCase();
    let condition='TRUE',params=[];
    if(scope==='lobby')condition+=' AND m.lobby_code IS NOT NULL';
    if(scope==='dm')condition+=' AND m.recipient_id IS NOT NULL';
    if(code){params.push(code);condition+=` AND m.lobby_code=$${params.length}`}
    if(q){params.push('%'+q+'%');condition+=` AND (m.body_raw ILIKE $${params.length} OR u.username ILIKE $${params.length})`}
    const {rows}=await pool.query(`SELECT m.id,m.sender_id,m.recipient_id,m.lobby_code,m.body_raw,m.body_public,m.flagged,m.created_at,u.username AS sender_name,v.username AS recipient_name
      FROM golf_chat_messages m JOIN golf_users u ON u.id=m.sender_id LEFT JOIN golf_users v ON v.id=m.recipient_id WHERE ${condition} ORDER BY m.id DESC LIMIT 100`,params);
    await audit(req.user.id,null,'view-private-logs',{scope,query:q?'filtered':'none'});
    res.json({messages:rows.map(r=>({...r,id:String(r.id),sender_id:String(r.sender_id),recipient_id:r.recipient_id?String(r.recipient_id):null}))});
  }));
  app.get('/api/admin/users',auth,staff,safe(async(req,res)=>{
    const q=max(req.query.q,32);assert(q.length>=2,400,'Skriv minst to tegn');
    const {rows}=await pool.query('SELECT id,username,role,needs_rename,games,strokes FROM golf_users WHERE username ILIKE $1 ORDER BY username LIMIT 30',[`%${q}%`]);
    const users=await Promise.all(rows.map(async u=>({...publicUser(u),role:roleFor(u),ban:await getBan(u.id)})));res.json({users});
  }));
  app.post('/api/admin/roles',auth,owner,safe(async(req,res)=>{
    const id=numberId(req.body?.userId),role=req.body?.role;
    assert(id&&['admin','player'].includes(role),400,'Ugyldig bruker eller rolle');assert(id!==ownerId,403,'Eieren kan ikke endres');
    const target=await getUser(id);assert(target,404,'Fant ikke spilleren');
    await pool.query('UPDATE golf_users SET role=$1 WHERE id=$2',[role,id]);await audit(req.user.id,id,'change-role',{role});
    io.to('user:'+id).emit('social:role-changed',{role});res.json({ok:true});
  }));
  app.post('/api/admin/bans',auth,staff,safe(async(req,res)=>{
    const id=numberId(req.body?.userId),reason=max(req.body?.reason,500),hours=req.body?.hours;
    assert(id&&id!==String(req.user.id),400,'Du kan ikke utestenge deg selv');
    assert(reason.length>=10,400,'Oppgi en konkret grunn på minst 10 tegn');
    assert(hours===null||Number.isInteger(hours)&&hours>=1&&hours<=8760,400,'Velg 1–8760 timer, eller permanent');
    const target=await getUser(id);assert(target,404,'Fant ikke spilleren');assert(roleFor(target)==='player'||roleFor(req.user)==='owner',403,'Kun eieren kan utestenge administratorer');assert(roleFor(target)!=='owner',403,'Eieren kan ikke utestenges');
    const expires=hours===null?null:new Date(Date.now()+hours*3600000).toISOString();
    await pool.query('INSERT INTO golf_bans(user_id,moderator_id,reason,expires_at) VALUES($1,$2,$3,$4)',[id,req.user.id,reason,expires]);
    await audit(req.user.id,id,'ban',{reason,expires_at:expires});
    io.to('user:'+id).emit('social:banned',{reason,expires_at:expires});
    // Ensure all existing sessions lose access to gameplay and chat immediately.
    setTimeout(()=>io.in('user:'+id).disconnectSockets(true),125).unref();
    res.json({ok:true});
  }));
  app.post('/api/admin/unban',auth,staff,safe(async(req,res)=>{
    const id=numberId(req.body?.userId);assert(id,400,'Ugyldig spiller');
    const target=await getUser(id);assert(target,404,'Fant ikke spilleren');
    assert(roleFor(target)==='player'||roleFor(req.user)==='owner',403,'Kun eieren kan oppheve adminutestengelser');
    await pool.query('UPDATE golf_bans SET lifted_at=now(),lifted_by=$1 WHERE user_id=$2 AND lifted_at IS NULL',[req.user.id,id]);
    await audit(req.user.id,id,'unban',{});res.json({ok:true});
  }));
  app.get('/api/admin/security',auth,staff,safe(async(req,res)=>{
    const {rows}=await pool.query(`SELECT e.id,e.event_type,e.details,e.created_at,u.username FROM golf_security_events e
      JOIN golf_users u ON u.id=e.user_id ORDER BY e.id DESC LIMIT 60`);res.json({events:rows});
  }));
  app.get('/api/admin/audit',auth,staff,safe(async(req,res)=>{
    const {rows}=await pool.query(`SELECT a.action,a.details,a.created_at,u.username AS actor,v.username AS target
      FROM golf_admin_audit a LEFT JOIN golf_users u ON a.actor_id=u.id LEFT JOIN golf_users v ON a.target_id=v.id ORDER BY a.id DESC LIMIT 60`);
    res.json({events:rows});
  }));
  // Keep routine messages for 90 days, retained report snapshots for 180 days,
  // and security/audit traces for 1 year. Runs at startup and once each 24 hours.
  async function purge(){try{
    await pool.query("DELETE FROM golf_chat_messages WHERE created_at<now()-interval '90 days'");
    await pool.query("DELETE FROM golf_reports WHERE reviewed_at<now()-interval '180 days' AND status<>'open'");
    await pool.query("DELETE FROM golf_security_events WHERE created_at<now()-interval '365 days'");
    await pool.query("DELETE FROM golf_admin_audit WHERE created_at<now()-interval '365 days'");
  }catch(e){console.error('Message retention cleanup failed:',e.message)}}
  purge();setInterval(purge,24*3600000).unref();
  return {getBan,getUser,sessionUser,roleFor,isStaff,attachSocket(s){s.join('user:'+s.data.user.id);if(isStaff(s.data.user))s.join('staff')},
    async flagCheating(id,event_type,details){try{await pool.query('INSERT INTO golf_security_events(user_id,event_type,details) VALUES($1,$2,$3)',[id,event_type,JSON.stringify(details)])}catch(e){console.error('Security event:',e.message)}}
  };
}
