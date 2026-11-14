import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const { Pool } = pg;
if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  console.error('DATABASE_URL og JWT_SECRET må settes. Se README.md');
  process.exit(1);
}
const ssl = { rejectUnauthorized: false };
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl });
await pool.query(`CREATE TABLE IF NOT EXISTS golf_users (
 id BIGSERIAL PRIMARY KEY, username VARCHAR(18) UNIQUE NOT NULL,
 password_hash TEXT NOT NULL, games INTEGER NOT NULL DEFAULT 0,
 strokes INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(express.static('public'));
app.get('/health', (_req,res) => res.json({ ok:true }));
const tokenFor = u => jwt.sign({id:String(u.id), username:u.username},process.env.JWT_SECRET,{expiresIn:'7d'});
async function auth(req,res,next){try{const p=jwt.verify((req.headers.authorization||'').replace(/^Bearer /,''),process.env.JWT_SECRET);const {rows}=await pool.query('SELECT id FROM golf_users WHERE id=$1',[p.id]);if(!rows.length)throw Error();req.user=p;next()}catch{res.status(401).json({error:'Logg inn først'})}}
const attempts = new Map();
function throttle(req,res,next){const key=req.ip;const now=Date.now();const a=attempts.get(key)||{count:0,until:now+60000};if(now>a.until){a.count=0;a.until=now+60000}if(++a.count>15)return res.status(429).json({error:'For mange forsøk. Prøv igjen om litt.'});attempts.set(key,a);next()}
setInterval(()=>{for(const [key,v] of attempts)if(v.until<Date.now())attempts.delete(key)},60000).unref();
app.post('/api/register',throttle,async(req,res)=>{const {username,password}=req.body||{};if(typeof username!=='string'||!/^[a-zA-Z0-9_]{3,18}$/.test(username)||typeof password!=='string'||password.length<8||password.length>128)return res.status(400).json({error:'Brukernavn: 3–18 tegn. Passord: 8–128 tegn.'});try{const hash=await bcrypt.hash(password,12);const {rows}=await pool.query('INSERT INTO golf_users(username,password_hash) VALUES($1,$2) RETURNING id,username',[username,hash]);res.json({token:tokenFor(rows[0]),username})}catch(e){if(e.code==='23505')return res.status(409).json({error:'Brukernavnet er opptatt'});console.error(e);res.status(500).json({error:'Kunne ikke opprette bruker'})}});
app.post('/api/login',throttle,async(req,res)=>{const {username,password}=req.body||{};try{const {rows}=typeof username==='string'&&username.length<=18?await pool.query('SELECT * FROM golf_users WHERE username=$1',[username]):{rows:[]};const u=rows[0];if(!u||typeof password!=='string'||!await bcrypt.compare(password,u.password_hash))return res.status(401).json({error:'Feil brukernavn eller passord'});res.json({token:tokenFor(u),username:u.username})}catch(e){console.error(e);res.status(500).json({error:'Innlogging feilet'})}});
app.get('/api/me',auth,async(req,res)=>{try{const {rows}=await pool.query('SELECT username,games,strokes FROM golf_users WHERE id=$1',[req.user.id]);res.json(rows[0])}catch{res.status(500).json({error:'Databasefeil'})}});
const rooms=new Map(),courses=['Kystbanen','Skogsbanen','Fjellbanen'];
function publicRoom(r){return {code:r.code,course:r.course,hole:r.hole,started:r.started,host:r.host,players:[...r.players.values()].map(p=>({id:p.id,name:p.name,strokes:p.strokes,finished:p.finished,x:p.x,y:p.y,score:p.score})),shots:r.shots}}
function broadcast(r){io.to(r.code).emit('room',publicRoom(r))}
function cleanRoom(s){const code=s.data.room;if(!code)return;const r=rooms.get(code);if(!r)return;r.players.delete(s.id);s.leave(code);s.data.room=null;if(!r.players.size)rooms.delete(code);else{if(r.host===s.id)r.host=r.players.keys().next().value;broadcast(r)}}
io.use(async(s,next)=>{try{const p=jwt.verify(s.handshake.auth?.token,process.env.JWT_SECRET);const {rows}=await pool.query('SELECT id,username FROM golf_users WHERE id=$1',[p.id]);if(!rows.length)throw Error();s.data.user=rows[0];next()}catch{next(new Error('Du må logge inn'))}});
io.on('connection',s=>{
 s.on('create',({course}={},ack=()=>{})=>{cleanRoom(s);if(!Number.isInteger(course)||course<0||course>=courses.length)return ack({error:'Ugyldig bane'});let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code));const r={code,course,hole:0,started:false,host:s.id,players:new Map(),shots:[]};rooms.set(code,r);join(r,s);ack({ok:true,code})});
 s.on('join',({code}={},ack=()=>{})=>{const r=rooms.get(String(code||'').trim().toUpperCase());if(!r)return ack({error:'Fant ikke lobbyen'});if(r.started)return ack({error:'Spillet har allerede startet'});if(r.players.size>=8)return ack({error:'Lobbyen er full'});cleanRoom(s);join(r,s);ack({ok:true,code:r.code})});
 s.on('start',(_,ack=()=>{})=>{const r=rooms.get(s.data.room);if(!r||r.host!==s.id)return ack({error:'Bare lobbyverten kan starte'});r.started=true;broadcast(r);ack({ok:true})});
 s.on('shot',({dx,dy}={},ack=()=>{})=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id);if(!r?.started||!p||p.finished)return ack({error:'Kan ikke slå nå'});if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)>110||Math.hypot(dx,dy)<5)return ack({error:'Ugyldig slag'});if(Date.now()-p.lastShot<450)return ack({error:'Vent før neste slag'});p.lastShot=Date.now();p.strokes++;r.shots.push({id:s.id,dx,dy,t:Date.now()});if(r.shots.length>30)r.shots.shift();io.to(r.code).emit('shot',{id:s.id,dx,dy,strokes:p.strokes});broadcast(r);ack({ok:true})});
 s.on('position',({x,y,finished}={})=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id);if(!r?.started||!p||!Number.isFinite(x)||!Number.isFinite(y))return;p.x=Math.max(0,Math.min(900,x));p.y=Math.max(0,Math.min(560,y));broadcast(r)});
 s.on('finish',({putts,strokes}={},ack=()=>{})=>{const r=rooms.get(s.data.room),p=r?.players.get(s.id);if(!r?.started||!p||p.finished)return ack({error:'Ugyldig fullføring'});if(!Number.isInteger(putts)||putts<1||putts>3||!Number.isInteger(strokes)||strokes<p.strokes+putts||strokes>p.strokes+putts+20)return ack({error:'Ugyldig score'});p.strokes=strokes;p.finished=true;p.x=760;p.y=280;p.score[r.hole]=strokes;if(r.hole===8&&!p.saved){p.saved=true;pool.query('UPDATE golf_users SET games=games+1, strokes=strokes+$1 WHERE id=$2',[p.score.reduce((a,b)=>a+(b||0),0),s.data.user.id]).catch(e=>console.error('Score save failed:',e))}broadcast(r);ack({ok:true})});
 s.on('next',async(_,ack=()=>{})=>{const r=rooms.get(s.data.room);if(!r||r.host!==s.id)return ack({error:'Bare lobbyverten kan gå videre'});if(![...r.players.values()].every(p=>p.finished))return ack({error:'Alle må fullføre hullet først'});if(r.hole>=8){r.started=false;io.to(r.code).emit('round-complete',publicRoom(r));broadcast(r);return ack({ok:true,complete:true})}r.hole++;r.shots=[];for(const p of r.players.values()){p.x=105;p.y=280;p.finished=false;p.strokes=0}broadcast(r);io.to(r.code).emit('new-hole');ack({ok:true})});
 s.on('leave',(_,ack=()=>{})=>{cleanRoom(s);ack({ok:true})});
 s.on('disconnect',()=>cleanRoom(s));
});
function join(r,s){s.join(r.code);s.data.room=r.code;r.players.set(s.id,{id:s.id,name:s.data.user.username,strokes:0,score:Array(9).fill(null),finished:false,x:105,y:280,lastShot:0});broadcast(r)}
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Daily Golf kjører på port '+(process.env.PORT||3000)));
