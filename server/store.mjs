import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
export class Store {
  constructor(dir) {
    this.dir = resolve(dir || '.arena-data');
    mkdirSync(this.dir,{recursive:true,mode:0o700});
    this.lockPath=join(this.dir,'runtime.lock');
    this.lockToken=randomUUID();
    const acquire=()=>writeFileSync(this.lockPath,JSON.stringify({pid:process.pid,token:this.lockToken}),{flag:'wx',mode:0o600});
    try{acquire();}catch(error){
      if(error.code!=='EEXIST')throw error;
      let previous;try{previous=JSON.parse(readFileSync(this.lockPath,'utf8'));}catch{throw new Error('Runtime storage lock is invalid; verify no runtime is active before removing runtime.lock');}
      if(!Number.isInteger(previous.pid)||previous.pid<=0)throw new Error('Runtime storage lock has an invalid process ID');
      let stale=false;try{process.kill(previous.pid,0);}catch(error){if(error.code==='ESRCH')stale=true;}
      if(!stale)throw new Error('ARENA_DATA_DIR is already in use by another runtime; choose a separate directory');
      const reclaimPath=this.lockPath+'.reclaim';
      try{writeFileSync(reclaimPath,this.lockToken,{flag:'wx',mode:0o600});}catch{throw new Error('Storage lock recovery in progress; retry after checking other runtimes');}
      try{
        const current=JSON.parse(readFileSync(this.lockPath,'utf8'));
        if(current.token!==previous.token||current.pid!==previous.pid)throw new Error('Storage lock changed; another runtime acquired it');
        unlinkSync(this.lockPath);acquire();
      }finally{unlinkSync(reclaimPath);}
    }
    this.releaseLock=()=>{try{if(JSON.parse(readFileSync(this.lockPath,'utf8')).token===this.lockToken)unlinkSync(this.lockPath);}catch{/* Another process owns the lock or it was already removed. */}};
    process.once('exit',this.releaseLock);
    try {
    this.db = new DatabaseSync(join(this.dir,'arena.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE, salt TEXT, password TEXT);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, userId TEXT, expires INTEGER);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, ownerId TEXT, data TEXT);
      CREATE INDEX IF NOT EXISTS runs_owner ON runs(ownerId);`);
    for (const row of this.db.prepare('SELECT data FROM runs').all()) {
      const run = JSON.parse(row.data);
      if (run.status === 'running') this.saveRun({...run,status:'interrupted',error:'Runtime restarted; submit a new run to continue.',updatedAt:Date.now()});
    }
    }catch(error){this.db?.close();process.removeListener('exit',this.releaseLock);this.releaseLock();throw error;}
  }
  register(username,password) {
    if (this.db.prepare('SELECT COUNT(*) AS n FROM users').get().n >= 1000) throw Object.assign(new Error('Account capacity reached'),{status:429});
    const salt = randomBytes(16).toString('hex');
    const user = {id:randomUUID(),username};
    try { this.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(user.id,username,salt,scryptSync(password,salt,64).toString('hex')); }
    catch (error) { if (String(error.message).includes('UNIQUE')) throw Object.assign(new Error('Username unavailable'),{status:409}); throw error; }
    return this.session(user);
  }
  login(username,password) {
    const user = this.db.prepare('SELECT * FROM users WHERE username=?').get(username);
    const actual = scryptSync(password,user?.salt || 'constant-dummy-salt',64);
    if (!user || !timingSafeEqual(actual,Buffer.from(user.password,'hex'))) throw Object.assign(new Error('Invalid credentials'),{status:401});
    return this.session({id:user.id,username:user.username});
  }
  session(user) {
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    this.db.prepare('DELETE FROM sessions WHERE userId=?').run(user.id);
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),user.id,Date.now()+86400000);
    return {token,user};
  }
  user(token) { return this.db.prepare('SELECT u.id,u.username FROM users u JOIN sessions s ON s.userId=u.id WHERE s.hash=? AND s.expires>?').get(hash(token),Date.now()); }
  logout(token) { this.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token)); }
  saveRun(run) { this.db.prepare('INSERT INTO runs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(run.id,run.ownerId,JSON.stringify(run)); }
  getRun(id) { const row=this.db.prepare('SELECT data FROM runs WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
  listRuns(owner) { return this.db.prepare('SELECT data FROM runs WHERE ownerId=?').all(owner).map(row=>JSON.parse(row.data)).sort((a,b)=>b.createdAt-a.createdAt); }
  deleteRun(id) { this.db.prepare('DELETE FROM runs WHERE id=?').run(id); }
  close() { if (!this.closed) {this.closed=true;this.db.close();process.removeListener('exit',this.releaseLock);this.releaseLock();} }
}
