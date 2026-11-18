(function(){
"use strict";
/* ---------- state ---------- */
const CFG = window.PRACTICE_CONFIG;
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
let user = null, mode = "loading";
let state = { startDate: todayStr(), songs: [], benchmarks: [] };
let sessions = [];
let outbox = [];
let synced = { songs: {}, bench: {}, settings: null };
let flushing = false;

function todayStr(d){ d = d || new Date(); const z=n=>String(n).padStart(2,"0"); return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate()); }
function parseDay(s){ const p=(s||"").split("-").map(Number); return p.length===3 && !isNaN(p[0]) ? new Date(p[0],p[1]-1,p[2]) : null; }
function daysBetween(a,b){ return Math.round((b - a)/86400000); }
function uid(){ if(window.crypto && crypto.randomUUID) return crypto.randomUUID(); return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{ const r=Math.random()*16|0; return (c==="x"?r:(r&3|8)).toString(16); }); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
const $ = id => document.getElementById(id);

function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove("show"),1800); }

/* ---------- storage: Supabase, with a local copy and an offline queue ---------- */
function cacheKey(){ return "gp-cache-"+(user?user.id:"anon"); }
function saveLocal(){ try{ localStorage.setItem(cacheKey(), JSON.stringify({state, sessions, outbox, synced})); }catch(e){} }
function loadLocal(){ try{ const raw=localStorage.getItem(cacheKey()); if(raw){ const o=JSON.parse(raw); if(o.state) state=Object.assign({startDate:todayStr(),songs:[],benchmarks:[]},o.state); sessions=o.sessions||[]; outbox=o.outbox||[]; synced=o.synced||synced; return true; } }catch(e){} return false; }

const songToRow = s => ({ id:s.id, user_id:user.id, title:s.title, artist:s.artist||null, status:s.status, sing:!!s.sing, jam:!!s.jam, hard_part:s.hardPart||null, tempo:s.tempo||null, target:s.target||null, capo:s.capo||null, song_map:s.map||null, notes:s.notes||null, tempo_log:s.tempoLog||[], last_played:s.lastPlayed||null, lesson_progress:s.lessonProgress||{}, updated_at:new Date().toISOString() });
const rowToSong = r => ({ id:r.id, title:r.title, artist:r.artist||"", status:r.status, sing:r.sing, jam:r.jam, hardPart:r.hard_part||"", tempo:r.tempo, target:r.target, capo:r.capo||"", map:r.song_map||"", notes:r.notes||"", tempoLog:r.tempo_log||[], lastPlayed:r.last_played, lesson:r.lesson||null, lessonProgress:r.lesson_progress||{} });
const sessToRow = s => ({ id:s.id, user_id:user.id, played_on:s.date, created_at:new Date(s.ts).toISOString(), minutes:s.minutes, planned:s.planned, feel:s.feel, notes:s.notes||null, songs:s.songs||[], hard_part_bpm:s.hardPartBpm||null, got_through:s.gotThrough||null, phase:s.phase, week:s.week });
const rowToSess = r => ({ id:r.id, date:r.played_on, ts:Date.parse(r.created_at), minutes:r.minutes, planned:r.planned, feel:r.feel, notes:r.notes||"", songs:r.songs||[], hardPartBpm:r.hard_part_bpm, gotThrough:r.got_through, phase:r.phase, week:r.week });
const benchToRow = b => ({ id:b.id, user_id:user.id, test:b.type, value:b.value, tested_on:b.d });
const rowToBench = r => ({ id:r.id, type:r.test, value:Number(r.value), d:r.tested_on });

function enqueue(op){
  // a newer change to the same row replaces any older one still waiting
  outbox = outbox.filter(o => !(o.t===op.t && o.id===op.id));
  outbox.push(op);
}
function sig(o){ return JSON.stringify(o); }
// Compare the app's state with what was last saved, and queue only what changed.
function diffState(){
  const seen = {};
  state.songs.forEach(s=>{ if(!s.id || s.id.length<30) s.id=uid(); const j=sig(s); seen[s.id]=1; if(synced.songs[s.id]!==j){ enqueue({t:"songs",op:"upsert",id:s.id,row:songToRow(s)}); synced.songs[s.id]=j; } });
  Object.keys(synced.songs).forEach(id=>{ if(!seen[id]){ enqueue({t:"songs",op:"delete",id}); delete synced.songs[id]; } });
  (state.benchmarks||[]).forEach(b=>{ if(!b.id) b.id=uid(); const j=sig(b); if(synced.bench[b.id]!==j){ enqueue({t:"benchmarks",op:"upsert",id:b.id,row:benchToRow(b)}); synced.bench[b.id]=j; } });
  const setSig = sig({d:state.startDate, p:state.theoryProgress||{}});
  if(synced.settings!==setSig){ enqueue({t:"settings",op:"upsert",id:user.id,row:{user_id:user.id,start_date:state.startDate,lesson_progress:state.theoryProgress||{},updated_at:new Date().toISOString()}}); synced.settings=setSig; }
}
function persist(){ if(!user) return; diffState(); saveLocal(); flush(); }
async function persistSession(s){ if(!user) return; enqueue({t:"sessions",op:"upsert",id:s.id,row:sessToRow(s)}); saveLocal(); flush(); }

async function flush(){
  if(flushing || !user) return;
  if(!outbox.length){ setSync(navigator.onLine===false?"Offline":"Synced"); return; }
  flushing = true; setSync("Saving…");
  try{
    while(outbox.length){
      const o = outbox[0];
      const q = o.op==="delete" ? sb.from(o.t).delete().eq("id", o.id)
              : sb.from(o.t).upsert(o.row, { onConflict: o.t==="settings" ? "user_id" : "id" });
      const { error } = await q;
      if(error){ console.warn("[practice] save failed", o.t, error); setSync(navigator.onLine===false?"Offline · will sync":"Not saved yet", true); break; }
      outbox.shift(); saveLocal();
    }
    if(!outbox.length) setSync("Synced");
  }catch(e){ console.warn("[practice] save error", e); setSync("Offline · will sync", true); }
  finally{ flushing = false; }
}
function setSync(txt, bad){ const p=$("syncPill"); p.textContent=txt; p.className="pill "+(bad?"rust":(txt==="Synced"?"sage":"")); }

async function loadRemote(){
  await flush();
  if(outbox.length) return; // keep the local copy until queued changes are saved
  const [st, so, se, be] = await Promise.all([
    sb.from("settings").select("start_date, lesson_progress").maybeSingle(),
    sb.from("songs").select("*").order("created_at"),
    sb.from("sessions").select("*").order("created_at"),
    sb.from("benchmarks").select("*").order("tested_on")
  ]);
  const err = st.error||so.error||se.error||be.error;
  if(err){ console.warn("[practice] load failed", err); setSync("Offline copy", true); return; }
  state.songs = (so.data||[]).map(rowToSong);
  state.benchmarks = (be.data||[]).map(rowToBench);
  sessions = (se.data||[]).map(rowToSess).sort((a,b)=>a.ts-b.ts);
  synced = { songs:{}, bench:{}, settings:null };
  state.songs.forEach(s=>synced.songs[s.id]=sig(s));
  state.benchmarks.forEach(b=>synced.bench[b.id]=sig(b));
  if(st.data && st.data.start_date){ state.startDate = st.data.start_date; state.theoryProgress = st.data.lesson_progress||{}; synced.settings = sig({d:state.startDate, p:state.theoryProgress}); }
  else { state.startDate = todayStr(); }
  saveLocal(); persist(); renderAll(); setSync("Synced");
}

async function loadStarter(){
  const btn=$("starterBtn"); btn.disabled=true; btn.textContent="Loading…";
  try{
    const res = await fetch("data/starter-songs.json"); const list = await res.json();
    const have = new Set(state.songs.map(s=>s.title.toLowerCase()));
    list.forEach(x=>{ if(!have.has(x.title.toLowerCase())) state.songs.push({ id:uid(), title:x.title, artist:x.artist||"", status:x.status, sing:false, jam:false, notes:x.notes||"", tempoLog:[] }); });
    persist(); renderAll(); toast("Song library loaded");
  }catch(e){ toast("Couldn't load the library. Check your connection."); btn.disabled=false; btn.textContent="Load my song library"; }
}

/* ---------- sign in ---------- */
let signingUp = false;
function showAuth(){ $("authView").classList.remove("hidden"); $("app").classList.add("hidden-app"); document.querySelector("nav.tabs").classList.add("hidden"); }
function showApp(){ $("authView").classList.add("hidden"); $("app").classList.remove("hidden-app"); document.querySelector("nav.tabs").classList.remove("hidden"); }
function setAuthMode(up){
  signingUp = up; $("authTitle").textContent = up?"Create your account":"Sign in"; $("authSubmit").textContent = up?"Create account":"Sign in";
  $("authToggle").textContent = up?"Have an account? Sign in":"New here? Create an account";
  $("aPass").setAttribute("autocomplete", up?"new-password":"current-password"); $("authErr").textContent="";
}
async function submitAuth(e){
  e.preventDefault();
  const email=$("aEmail").value.trim(), password=$("aPass").value; const err=$("authErr"); err.textContent=""; err.style.color="";
  $("authSubmit").disabled=true;
  try{
    if(signingUp){
      const { data, error } = await sb.auth.signUp({ email, password, options:{ emailRedirectTo: location.origin+location.pathname } });
      if(error) throw error;
      if(!data.session){ err.style.color="var(--sage)"; err.textContent="Check your email and tap the confirmation link, then sign in here."; setAuthMode(false); $("authErr").textContent="Check your email and tap the confirmation link, then sign in here."; $("authErr").style.color="var(--sage)"; }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if(error) throw error;
    }
  }catch(ex){ err.style.color=""; err.textContent = /invalid login/i.test(ex.message||"") ? "That email and password don't match. Try again." : /not confirmed/i.test(ex.message||"") ? "Confirm your email first. Check your inbox for the link." : (ex.message||"Something went wrong. Try again."); }
  finally{ $("authSubmit").disabled=false; }
}
async function boot(u){
  if(user && user.id===u.id) return;
  user = u; $("acctEmail").textContent = "Signed in as "+(u.email||"");
  state = { startDate: todayStr(), songs: [], benchmarks: [] }; sessions=[]; outbox=[]; synced={songs:{},bench:{},settings:null};
  loadLocal(); showApp(); renderAll(); restoreRun(); setSync(navigator.onLine===false?"Offline":"Loading…");
  try{ await loadRemote(); }catch(e){ setSync("Offline copy", true); }
}
async function init(){
  loadSongLessons().then(()=>renderAll());
  sb.auth.onAuthStateChange((evt, session)=>{
    if(session && session.user) boot(session.user);
    else if(evt==="SIGNED_OUT"){ user=null; showAuth(); }
  });
  const { data } = await sb.auth.getSession();
  if(data && data.session) boot(data.session.user); else showAuth();
  window.addEventListener("online", ()=>{ if(user) loadRemote(); });
  window.addEventListener("offline", ()=>setSync("Offline · will sync", true));
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
}

/* ---------- curriculum ---------- */
function weekNum(){ const s=parseDay(state.startDate)||new Date(); return Math.max(1, Math.floor(daysBetween(s, parseDay(todayStr()))/7)+1); }
function phase(){ const w=weekNum(); if(w<=2) return 1; if(w<=6) return 2; if(w<=10) return 3; return 4; }
const PHASE_NAMES = {1:"Comeback",2:"Finish songs",3:"Jam-ready",4:"Expand"};
const CONTENT = {
  warm: [
    "One-minute changes: G ↔ C. Count clean switches.",
    "One-minute changes: C ↔ D, then G ↔ Em.",
    "One-minute changes: D ↔ A. Keep the strum hand moving even if a chord is late.",
    "Slow chromatic 1-2-3-4 across all strings to wake up the fingers."
  ],
  tech: {
    1:["Steady down-up 8th notes on G–C–D at 70 BPM. Smooth beats fast.","Strum pattern D–D–U–U–D–U on G–Em–C–D at a slow tempo.","Re-tighten a fingerpicked part you already know. Clean, even volume."],
    2:["Travis picking: thumb alternates bass strings on a C chord at 60 BPM.","Travis picking on G: thumb on 6th and 4th strings, fingers on 3rd and 2nd.","Hammer-ons inside chords: C (hammer the 2nd fret D string), then G and D shapes.","Pull-offs inside a D chord on the high E string. Keep the rhythm going."],
    3:["Bass run G → C: G A B C on the low strings, landing on beat 1.","Bass run G → D and back. Use it in a song you know.","Dynamics: play a verse quiet and the chorus big, without speeding up.","Play a song start to finish without stopping, whatever happens."],
    4:["G major pentatonic, open position. Play it up and down at 70 BPM.","Make up a 2-bar fill between chord changes using the G pentatonic.","Learn the intro lick of a new song from another artist."]
  },
  mind: {
    1:["Theory: Nashville numbers in G. G=1 · Am=2m · Bm=3m · C=4 · D=5 · Em=6m. Write the numbers for a song you know.","Voice: play a G note (3rd fret, low E) and hum it. Check against a tuner app. Repeat on C and D.","Voice: find your lowest and highest comfortable notes. Write them in the notes.","Theory: name the 1, 4 and 5 of the key of G out loud while you strum them."],
    2:["Theory: Nashville numbers in C and D. Map one song's verse in numbers.","Theory: capo math. Capo 2 + G shapes = key of A. What key is capo 4 + G shapes?","Voice: layer a song. Strum and hum the melody, then speak the lyrics in rhythm.","Ear: play 1, 4 and 5 in G in random order with your eyes closed and name each."],
    3:["Ear: put on a song and name each chord change as 1, 4, 5 or 6m.","Voice: sing the singing song slowly, then at tempo. Is the key right for your voice?","Jam: count a song in (\"1, 2, 3, 4\") and end it together on the 1 chord.","Jam: have someone call numbers (1–5–6m–4) and follow along in a new key."],
    4:["Write 4 lines over 1–5–6m–4 in G. Keep it rough.","Ear: figure out a new song's progression by ear before looking at the tab.","Voice: record yourself singing one song and listen back once."]
  },
  free: ["Play anything you love. No rules, no metronome."]
};
function pick(arr, salt){ const d=parseDay(todayStr()); const n=Math.floor(d.getTime()/86400000)+(salt||0); return arr[((n%arr.length)+arr.length)%arr.length]; }

const TEMPLATES = {
  5:  [["songs",5]],
  20: [["warm",3],["songs",12],["mind",5]],
  30: [["warm",4],["tech",6],["songs",15],["mind",5]],
  45: [["warm",5],["tech",10],["songs",20],["mind",7],["free",3]],
  60: [["warm",5],["tech",12],["songs",28],["mind",10],["free",5]]
};
let chosenMinutes = 30;

function lastSessionDays(){ if(!sessions.length) return null; const last=sessions[sessions.length-1]; const d=parseDay(last.date); return d?daysBetween(d, parseDay(todayStr())):null; }
function reviewSong(excludeIds){
  const pool = state.songs.filter(s=>s.status==="known" && !excludeIds.includes(s.id));
  pool.sort((a,b)=> (a.lastPlayed||"0000").localeCompare(b.lastPlayed||"0000"));
  return pool[0]||null;
}
function buildPlan(minutes){
  const ph = phase();
  const gap = lastSessionDays();
  const comeback = gap!==null && gap>=5;
  const learning = state.songs.find(s=>s.status==="learning")||null;
  const polishing = state.songs.find(s=>s.status==="polishing")||null;
  const blocks = [];
  TEMPLATES[minutes].forEach(([kind,min],i)=>{
    if(kind==="warm") blocks.push({kind,min,name:"Warm-up",tip:pick(CONTENT.warm,i)});
    else if(kind==="tech"){
      if(comeback) blocks.push({kind,min,name:"Easy songs you know",tip:"Coming back from a break. Play known songs loosely to get your hands back."});
      else blocks.push({kind,min,name:"Technique",tip:pick(CONTENT.tech[ph],i)});
    }
    else if(kind==="mind"){
      const pol = state.songs.find(s=>s.status==="polishing");
      const dayOdd = Math.floor(Date.now()/86400000)%2===1;
      const nx = nextTheory(pol && !pol.sing && dayOdd ? "sing" : "keys");
      if(nx) blocks.push({kind,min,name:"Lesson: "+nx.title,tip:nx.unitTitle+". Read it, play the examples, and take the quick check at the end.",lessonId:nx.id});
      else blocks.push({kind,min,name: ph===1?"Theory & voice":"Theory · ear · voice",tip:pick(CONTENT.mind[ph],i)});
    }
    else if(kind==="free") blocks.push({kind,min,name:"Free play",tip:CONTENT.free[0]});
    else if(kind==="songs"){
      const parts = [];
      const used = [];
      if(minutes===5){
        const r = reviewSong([]) ; if(r){ parts.push([r,5,"review"]); used.push(r.id); }
        else if(learning) parts.push([learning,5,"learning"]);
      } else if(comeback){
        const r1=reviewSong([]); if(r1){used.push(r1.id);} const r2=reviewSong(used);
        const rem = learning? min-3 : min;
        if(r1 && r2){ parts.push([r1,Math.ceil(rem/2),"review"]); parts.push([r2,Math.floor(rem/2),"review"]); }
        else if(r1) parts.push([r1,rem,"review"]);
        if(learning) parts.push([learning,3,"peek"]);
      } else {
        const review = reviewSong([learning&&learning.id, polishing&&polishing.id].filter(Boolean));
        let wL=learning?0.5:0, wP=polishing?0.3:0, wR=review?0.2:0; const tot=wL+wP+wR||1;
        let left=min;
        if(learning){ const m=Math.max(3,Math.round(min*wL/tot)); parts.push([learning,m,"learning"]); left-=m; }
        if(polishing){ const m=review?Math.max(3,Math.round(min*wP/tot)):left; parts.push([polishing,Math.min(m,left),"polishing"]); left-=Math.min(m,left); }
        if(review && left>0) parts.push([review,left,"review"]);
      }
      if(!parts.length) blocks.push({kind,min,name:"Songs",tip:"No songs set yet. Open Songs and mark one as Learning."});
      parts.forEach(([s,m,role])=>{
        let tip="";
        if(role==="learning") tip = "Whole song simply first: strum the chords start to finish with the recording."+(s.hardPart?" Then loop the hard part slowly: "+s.hardPart+(s.tempo?" (last clean at "+s.tempo+" BPM).":"."):" Then loop the hardest 2 bars slowly.");
        if(role==="polishing") tip = s.sing ? "Play and sing it all the way through. Don't stop for mistakes." : "Play it through with the recording. Once that's steady, add singing with the layering method.";
        if(role==="review") tip = "Review: play it once, start to finish."+(s.sing?" Sing it.":"");
        if(role==="peek") tip = "Just touch the hard part. No pressure today.";
        const label = {learning:"Learning",polishing:"Polishing",review:"Review",peek:"Learning"}[role];
        blocks.push({kind:"songs",min:m,name:label+": "+s.title,tip,songId:s.id,role});
      });
    }
  });
  return {blocks, comeback, gap, learning, polishing};
}

/* ---------- today view ---------- */
let plan = null, run = null, tick = null;
function renderToday(){
  const chips = $("minuteChips");
  chips.innerHTML = [5,20,30,45,60].map(m=>`<button class="chip" data-min="${m}" aria-pressed="${m===chosenMinutes}">${m===5?"5 min (minimum)":m+" min"}</button>`).join("");
  if(run){ drawBlocks(run.done?plan.blocks.length:run.i); return; } // keep live plan steady while a session runs
  plan = buildPlan(chosenMinutes);
  const cb = $("comebackBanner");
  if(plan.comeback){ cb.textContent = "It's been "+plan.gap+" days. Today starts with songs you know. Welcome back."; cb.classList.remove("hidden"); } else cb.classList.add("hidden");
  const warn = $("planWarn"); const msgs=[];
  if(!plan.learning) msgs.push("No song is marked Learning. Pick one in Songs.");
  if(!plan.polishing) msgs.push("No song is marked Polishing.");
  if(phase()===1 && chosenMinutes>30) msgs.push("Weeks 1–2: keep sessions around 20–30 min while calluses rebuild.");
  warn.innerHTML = msgs.map(esc).join("<br>"); warn.classList.toggle("hidden", !msgs.length);
  drawBlocks(-1);
  $("planTotal").textContent = chosenMinutes+" min";
  $("timerDisplay").textContent = fmt(plan.blocks[0]?plan.blocks[0].min*60:0);
}
function drawBlocks(cur){
  $("planBlocks").innerHTML = plan.blocks.map((b,i)=>{
    let extra = "";
    if(b.songId){ const s = state.songs.find(x=>x.id===b.songId); const L = s && lessonFor(s);
      if(L){ const nx = nextStep(s, L); extra += nx ? `<div class="nextstep">Next step: ${esc(nx.title)}</div>` : `<div class="nextstep">All lesson steps done</div>`; extra += `<button class="btn small" data-lesson-song="${b.songId}">Open lesson</button>`; }
      else if(b.role==="learning"||b.role==="peek") extra += `<button class="btn small ghost" data-metro-song="${b.songId}">Metronome at hard-part tempo</button>`;
    }
    if(b.lessonId) extra += `<button class="btn small" data-theory="${b.lessonId}">Open lesson</button>`;
    return `<div class="block ${i===cur?"now":""} ${cur>-1&&i<cur?"done":""}"><div class="min">${b.min}<small>min</small></div><div><div class="name">${esc(b.name)}</div><div class="tip">${esc(b.tip)}</div>${extra?`<div class="row" style="margin-top:8px">${extra}</div>`:""}</div></div>`;
  }).join("");
}
function fmt(sec){ sec=Math.max(0,Math.round(sec)); return String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0"); }

/* The timer runs on the real clock: block end times are stored, so leaving the app
   (or the phone locking) doesn't stop it. When you come back it catches up. */
const RUN_KEY = "gp-run";
function saveRun(){ try{ if(run) localStorage.setItem(RUN_KEY, JSON.stringify({run, plan, chosenMinutes})); else localStorage.removeItem(RUN_KEY); }catch(e){} }
function restoreRun(){
  try{ const o = JSON.parse(localStorage.getItem(RUN_KEY)||"null"); if(!o||!o.run) return;
    if(Date.now() - o.run.startedAt > 4*3600*1000){ localStorage.removeItem(RUN_KEY); return; }
    run = o.run; plan = o.plan; chosenMinutes = o.chosenMinutes||chosenMinutes;
    $("nextBtn").disabled=false; $("finishBtn").disabled=false; $("startBtn").textContent = run.paused?"Resume":"Pause";
    clearInterval(tick); tick=setInterval(step,500); step(true);
  }catch(e){}
}
function startRun(){
  if(!plan||!plan.blocks.length) return;
  const now = Date.now();
  run = {i:0, startedAt:now, blockEnd: now + plan.blocks[0].min*60000, paused:false, pausedLeft:0, done:false};
  $("startBtn").textContent="Pause"; $("nextBtn").disabled=false; $("finishBtn").disabled=false;
  saveRun(); step(true); clearInterval(tick); tick=setInterval(step,500);
  scheduleAlerts();
}
function remaining(){ return run.paused ? run.pausedLeft : Math.max(0, run.blockEnd - Date.now()); }
function showBlock(){ const b=plan.blocks[run.i]; $("timerLabel").textContent=b.name; $("timerStep").textContent="Block "+(run.i+1)+" of "+plan.blocks.length+(run.paused?" · paused":""); $("timerDisplay").textContent=fmt(remaining()/1000); drawBlocks(run.i); }
function step(force){
  if(!run || run.done) return;
  if(run.paused){ if(force) showBlock(); return; }
  let moved = false;
  while(Date.now() >= run.blockEnd){
    if(run.i < plan.blocks.length-1){ run.i++; run.blockEnd += plan.blocks[run.i].min*60000; moved = true; }
    else { finishRun(); return; }
  }
  if(moved){ if(document.visibilityState==="visible") chime(); saveRun(); showBlock(); }
  else if(force) showBlock();
  else $("timerDisplay").textContent = fmt(remaining()/1000);
}
function finishRun(){ run.done = true; saveRun(); $("startBtn").textContent="Log session"; $("timerDisplay").textContent="Done"; $("timerLabel").textContent="Session complete"; drawBlocks(plan.blocks.length); clearInterval(tick); if(document.visibilityState==="visible") chime(); openLog(); }
function nextBlock(){
  if(!run) return;
  if(run.i < plan.blocks.length-1){ run.i++; const ms = plan.blocks[run.i].min*60000; if(run.paused) run.pausedLeft = ms; else run.blockEnd = Date.now()+ms; saveRun(); showBlock(); if(!run.paused) scheduleAlerts(); }
  else { cancelAlerts(); finishRun(); }
}
function togglePause(){
  if(!run){ startRun(); return; }
  if(run.done){ openLog(); return; }
  if(!run.paused){ run.pausedLeft = remaining(); run.paused = true; cancelAlerts(); }
  else { run.blockEnd = Date.now() + run.pausedLeft; run.paused = false; scheduleAlerts(); }
  $("startBtn").textContent = run.paused?"Resume":"Pause"; saveRun(); showBlock();
}
function clearRun(){ clearInterval(tick); run=null; saveRun(); $("startBtn").textContent="Start session"; $("nextBtn").disabled=true; $("finishBtn").disabled=true; $("timerLabel").textContent="Ready when you are"; $("timerStep").textContent=""; }
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible" && run) step(true); });

/* ---------- block-end alerts (push notifications) ---------- */
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isiOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function b64u(s){ const p="=".repeat((4-s.length%4)%4); const b=atob((s+p).replace(/-/g,"+").replace(/_/g,"/")); return Uint8Array.from([...b].map(c=>c.charCodeAt(0))); }
function alertsOn(){ try{ return localStorage.getItem("gp-alerts")==="1" && Notification.permission==="granted"; }catch(e){ return false; } }
function renderAlertsRow(){
  const el = $("alertsRow"); if(!el) return;
  if(alertsOn()){ el.innerHTML = `<span class="pill sage">Block alerts on</span>`; return; }
  if(isiOS() && !isStandalone()){ el.innerHTML = `<div class="sub">To get an alert when each block ends, add this app to your Home Screen (Share → Add to Home Screen) and open it from there.</div>`; return; }
  if(!pushSupported()){ el.innerHTML = `<div class="sub">This browser can't show block alerts. The timer still keeps time while you're away.</div>`; return; }
  if(Notification.permission==="denied"){ el.innerHTML = `<div class="sub">Notifications are blocked for this app. Turn them on in your phone's Settings to get block alerts.</div>`; return; }
  el.innerHTML = `<button class="btn small" id="alertsBtn">Turn on block alerts</button><span class="sub">Your phone buzzes when each block ends, even with the app closed.</span>`;
  $("alertsBtn").onclick = enableAlerts;
}
async function enableAlerts(){
  try{
    const perm = await Notification.requestPermission(); if(perm!=="granted"){ renderAlertsRow(); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:b64u(CFG.vapidPublic) });
    const j = sub.toJSON();
    const { error } = await sb.from("push_subscriptions").upsert({ user_id:user.id, endpoint:j.endpoint, p256dh:j.keys.p256dh, auth:j.keys.auth }, { onConflict:"endpoint" });
    if(error) throw error;
    localStorage.setItem("gp-alerts","1"); toast("Block alerts on"); renderAlertsRow();
    if(run && !run.paused) scheduleAlerts();
  }catch(e){ console.warn("[practice] alerts", e); toast("Couldn't turn on alerts. Try again online."); }
}
async function cancelAlerts(){ if(!user) return; try{ await sb.from("scheduled_pushes").delete().is("sent_at", null); }catch(e){} }
async function scheduleAlerts(){
  if(!user || !run || run.paused || !alertsOn()) return;
  await cancelAlerts();
  const rows = []; let t = run.blockEnd;
  for(let i=run.i; i<plan.blocks.length; i++){
    if(i>run.i) t += plan.blocks[i].min*60000;
    const next = plan.blocks[i+1];
    rows.push({ user_id:user.id, send_at:new Date(t).toISOString(),
      title: next ? "Next: "+next.name : "Session done",
      body: next ? next.tip.slice(0,140) : "Nice work. Open the app to log how it went." });
  }
  try{ await sb.from("scheduled_pushes").insert(rows); }catch(e){}
}

/* ---------- log ---------- */
function openLog(){
  const mins = run ? Math.max(1, Math.round((Date.now()-run.startedAt)/60000)) : chosenMinutes;
  $("logSummary").textContent = mins+" min played · "+chosenMinutes+" min planned";
  const L = plan && plan.learning && state.songs.find(z=>z.id===plan.learning.id);
  $("lActive").classList.toggle("hidden", !L);
  if(L){ $("lActiveName").textContent = "Learning: "+L.title+(L.hardPart?" · "+L.hardPart:""); $("lTempo").value = L.tempo||""; $("lThrough").checked=false; }
  $("lNotes").value=""; $("lFeel").value="3";
  openSheet("logSheet");
}
async function saveLog(){
  const mins = run ? Math.max(1, Math.round((Date.now()-run.startedAt)/60000)) : chosenMinutes;
  const songIds = plan ? plan.blocks.filter(b=>b.songId).map(b=>b.songId) : [];
  const s = { id: uid(), ts: Date.now(), date: todayStr(), minutes: mins, planned: chosenMinutes, feel: Number($("lFeel").value), notes: $("lNotes").value.trim(), songs: songIds.map(id=>{const x=state.songs.find(z=>z.id===id); return x?x.title:id;}), phase: phase(), week: weekNum() };
  const L = plan && plan.learning && state.songs.find(z=>z.id===plan.learning.id);
  if(L){
    const t = Number($("lTempo").value);
    if(t>0 && t!==L.tempo){ L.tempo=t; (L.tempoLog=L.tempoLog||[]).push({d:todayStr(),bpm:t}); s.hardPartBpm=t; }
    if($("lThrough").checked){ s.gotThrough=L.title; }
  }
  songIds.forEach(id=>{ const x=state.songs.find(z=>z.id===id); if(x) x.lastPlayed=todayStr(); });
  sessions.push(s);
  await persistSession(s); persist();
  closeSheet("logSheet");
  cancelAlerts(); clearRun();
  toast("Session saved");
  if(L && $("lThrough").checked){ setTimeout(()=>{ if(confirmInline("You got through "+L.title+". Move it to Polishing?")){} },0); }
  renderAll();
}
function confirmInline(msg){ // no native confirm in this frame: show a banner with an action
  const w=$("planWarn"); const L = plan && plan.learning && state.songs.find(z=>z.id===plan.learning.id);
  w.innerHTML = esc(msg)+' <button class="btn small" id="promoteBtn" style="margin-left:6px">Move it</button>';
  w.classList.remove("hidden");
  $("promoteBtn").onclick=()=>{ const s=state.songs.find(z=>z.id===L.id); if(s){ const pol=state.songs.find(z=>z.status==="polishing"); if(pol) pol.status="known"; s.status="polishing"; persist(); toast(s.title+" moved to Polishing"); renderAll(); } };
  return false;
}

/* ---------- songs view ---------- */
const STATUS_LABEL = {want:"Want to learn",partial:"Partly learned",learning:"Learning",polishing:"Polishing",known:"Play through"};
const ORDER = ["learning","polishing","partial","want","known"];
let filter = "all", editing = null;
function renderSongs(){
  $("starterCard").classList.toggle("hidden", !(user && state.songs.length===0 && mode!=="loading-x"));
  const L = state.songs.find(s=>s.status==="learning"), P = state.songs.find(s=>s.status==="polishing");
  $("activeLine").textContent = "Active (max 2): " + (L?L.title:"no Learning song") + " · " + (P?P.title:"no Polishing song");
  const counts = {all:state.songs.length}; ORDER.forEach(k=>counts[k]=state.songs.filter(s=>s.status===k).length);
  $("songFilters").innerHTML = ["all"].concat(ORDER).map(k=>`<button class="chip" data-filter="${k}" aria-pressed="${filter===k}">${k==="all"?"All":STATUS_LABEL[k]} ${counts[k]}</button>`).join("");
  const list = state.songs.filter(s=>filter==="all"||s.status===filter).sort((a,b)=> ORDER.indexOf(a.status)-ORDER.indexOf(b.status) || a.title.localeCompare(b.title));
  $("songList").innerHTML = list.length ? list.map(s=>`<button class="song" data-song="${s.id}"><div><div class="t">${esc(s.title)}</div><div class="a">${esc(s.artist||"")}</div></div><div class="badges"><span class="pill ${s.status==="learning"||s.status==="polishing"?"brass":s.status==="known"?"sage":""}">${STATUS_LABEL[s.status]}</span>${s.sing?'<span class="pill sage">Sing</span>':""}${s.jam?'<span class="pill brass">Jam</span>':""}</div></button>`).join("") : `<div class="empty">No songs here yet.</div>`;
  $("tempoSong").innerHTML = state.songs.filter(s=>s.status!=="want").sort((a,b)=>ORDER.indexOf(a.status)-ORDER.indexOf(b.status)).map(s=>`<option value="${s.id}">${esc(s.title)}</option>`).join("");
}
function openSong(id){
  editing = id ? state.songs.find(s=>s.id===id) : null;
  const s = editing || {title:"",artist:"",status:"want"};
  $("songSheetTitle").textContent = editing ? s.title : "Add song";
  $("fTitle").value=s.title||""; $("fArtist").value=s.artist||""; $("fStatus").value=s.status||"want";
  $("fSing").checked=!!s.sing; $("fJam").checked=!!s.jam; $("fHard").value=s.hardPart||""; $("fTempo").value=s.tempo||""; $("fTarget").value=s.target||"";
  $("fCapo").value=s.capo||""; $("fMap").value=s.map||""; $("fNotes").value=s.notes||"";
  const q = encodeURIComponent(((s.artist||"")+" "+(s.title||"")).trim());
  $("songLinks").innerHTML = (editing ? `<button class="btn small primary" data-open-lesson="${editing.id}">${lessonFor(editing)?"Open lesson":"Lesson"}</button>` : "") + (s.title ? `<a class="btn small" href="https://www.ultimate-guitar.com/search.php?search_type=title&value=${q}" target="_blank" rel="noopener">Find tab on Ultimate Guitar</a><a class="btn small" href="https://music.apple.com/us/search?term=${q}" target="_blank" rel="noopener">Open in Apple Music</a>` : "");
  const tl = (s.tempoLog||[]).slice(-6);
  $("tempoHistory").textContent = tl.length ? "Hard-part tempo: " + tl.map(x=>x.bpm).join(" → ") + " BPM" : "";
  $("delSongBtn").classList.toggle("hidden", !editing);
  $("capWarn").classList.add("hidden");
  openSheet("songSheet");
}
function saveSong(){
  const title=$("fTitle").value.trim(); if(!title){ $("fTitle").focus(); return; }
  const status=$("fStatus").value;
  if(status==="learning"||status==="polishing"){
    const other = state.songs.find(x=>x.status===status && (!editing || x.id!==editing.id));
    if(other && !saveSong._swap){
      const w=$("capWarn"); w.innerHTML = esc(other.title)+" is already "+STATUS_LABEL[status]+". One at a time keeps songs getting finished. "+'<button class="btn small" id="swapBtn">Park '+esc(other.title)+' and save</button>';
      w.classList.remove("hidden"); $("swapBtn").onclick=()=>{ other.status = status==="polishing" ? "known" : "partial"; saveSong._swap=true; saveSong(); saveSong._swap=false; };
      return;
    }
  }
  const s = editing || {id:uid(), tempoLog:[]};
  s.title=title; s.artist=$("fArtist").value.trim(); s.status=status; s.sing=$("fSing").checked; s.jam=$("fJam").checked;
  s.hardPart=$("fHard").value.trim(); const t=Number($("fTempo").value)||null;
  if(t && t!==s.tempo){ (s.tempoLog=s.tempoLog||[]).push({d:todayStr(),bpm:t}); }
  s.tempo=t; s.target=Number($("fTarget").value)||null; s.capo=$("fCapo").value.trim(); s.map=$("fMap").value; s.notes=$("fNotes").value;
  if(!editing) state.songs.push(s);
  persist(); closeSheet("songSheet"); toast("Saved"); renderAll();
}
let delArmed=false;
function deleteSong(){
  if(!editing) return;
  if(!delArmed){ delArmed=true; $("delSongBtn").textContent="Tap again to delete"; setTimeout(()=>{delArmed=false; $("delSongBtn").textContent="Delete song";},3000); return; }
  state.songs = state.songs.filter(s=>s.id!==editing.id); delArmed=false; $("delSongBtn").textContent="Delete song";
  persist(); closeSheet("songSheet"); toast("Deleted"); renderAll();
}

/* ---------- metronome ---------- */
let actx=null, metroOn=false, bpm=80, beats=4, nextTime=0, beatIdx=0, timerId=null, taps=[];
function ensureAudio(){ actx = Music.audio(); return actx; }
function click(t, accent){
  const o=actx.createOscillator(), g=actx.createGain();
  o.frequency.value = accent?1600:1000; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(accent?0.6:0.35,t+0.002); g.gain.exponentialRampToValueAtTime(0.0001,t+0.06);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t+0.08);
}
function chime(){ try{ ensureAudio(); if(!actx) return; const t=actx.currentTime; [880,1320].forEach((f,i)=>{ const o=actx.createOscillator(), g=actx.createGain(); o.frequency.value=f; g.gain.setValueAtTime(0.0001,t+i*.18); g.gain.exponentialRampToValueAtTime(.4,t+i*.18+.01); g.gain.exponentialRampToValueAtTime(.0001,t+i*.18+.5); o.connect(g).connect(actx.destination); o.start(t+i*.18); o.stop(t+i*.18+.55); }); }catch(e){} }
function scheduler(){
  while(nextTime < actx.currentTime + 0.12){
    const b = beatIdx % beats; click(nextTime, b===0);
    const delay = Math.max(0,(nextTime-actx.currentTime)*1000); setTimeout(()=>lightBeat(b), delay);
    nextTime += 60/bpm; beatIdx++;
  }
}
function lightBeat(b){ document.querySelectorAll(".beat").forEach((d,i)=>{ d.classList.toggle("on", i===b); d.classList.toggle("first", i===0); }); }
function drawDots(){ $("beatDots").innerHTML = Array.from({length:beats},(_,i)=>`<span class="beat"></span>`).join(""); }
function setBpm(v){ bpm=Math.min(200,Math.max(40,Math.round(v))); $("bpmDisplay").textContent=bpm; $("bpmRange").value=bpm; }
function toggleMetro(){
  if(!ensureAudio()){ toast("Audio isn't available here"); return; }
  metroOn=!metroOn; $("metroBtn").textContent=metroOn?"Stop":"Start";
  if(metroOn){ nextTime=actx.currentTime+0.05; beatIdx=0; timerId=setInterval(scheduler,25); } else { clearInterval(timerId); lightBeat(-1); }
}
function tap(){ const n=performance.now(); taps=taps.filter(t=>n-t<2500); taps.push(n); if(taps.length>=2){ const iv=(taps[taps.length-1]-taps[0])/(taps.length-1); setBpm(60000/iv); } }

/* ---------- progress ---------- */
function streak(){
  const days = new Set(sessions.map(s=>s.date)); let n=0; let d=parseDay(todayStr());
  if(!days.has(todayStr())) d.setDate(d.getDate()-1);
  while(days.has(todayStr(d))){ n++; d.setDate(d.getDate()-1); }
  return n;
}
function renderProgress(){
  const known=state.songs.filter(s=>s.status==="known"||s.status==="polishing").length;
  $("stJam").textContent = state.songs.filter(s=>s.jam).length+"/10";
  $("stSing").textContent = state.songs.filter(s=>s.sing).length;
  $("stKnown").textContent = state.songs.filter(s=>s.status==="known").length;
  $("stStreak").textContent = streak();
  const days=[]; for(let i=6;i>=0;i--){ const d=parseDay(todayStr()); d.setDate(d.getDate()-i); days.push(d); }
  const mins = days.map(d=> sessions.filter(s=>s.date===todayStr(d)).reduce((a,s)=>a+(s.minutes||0),0));
  $("stWeek").textContent = mins.reduce((a,b)=>a+b,0);
  $("stSessions").textContent = sessions.length;
  const mx=Math.max(30,...mins);
  $("bars").innerHTML = mins.map(m=>`<div class="bar ${m?"":"zero"}" style="height:${m?Math.max(6,m/mx*100):2}%" title="${m} min"></div>`).join("");
  $("barLabels").innerHTML = days.map((d,i)=>`<span>${i===6?"Today":"SMTWTFS"[d.getDay()]}</span>`).join("");
  const byType={}; (state.benchmarks||[]).forEach(b=>{ (byType[b.type]=byType[b.type]||[]).push(b); });
  const keys=Object.keys(byType);
  $("bmList").innerHTML = keys.length ? keys.map(k=>{ const a=byType[k]; const first=a[0].value, last=a[a.length-1].value; const diff=last-first; return `<div class="li"><span>${esc(k)}</span><span class="mono">${a.length>1?first+" → ":""}${last}${a.length>1?` <span style="color:${diff>=0?"var(--sage)":"var(--rust)"}">(${diff>=0?"+":""}${diff})</span>`:""}</span></div>`; }).join("") : `<div class="empty">No results yet. Take the baseline in week 1.</div>`;
  const recent = sessions.slice(-8).reverse();
  $("sessionList").innerHTML = recent.length ? recent.map(s=>`<div class="li"><div><div>${esc(s.date)} · ${s.minutes} min</div><div class="sub">${esc((s.songs||[]).join(", "))}${s.notes?" · "+esc(s.notes):""}</div></div><span class="mono">${"●".repeat(s.feel||0)}</span></div>`).join("") : `<div class="empty">No sessions yet. Your first one shows up here.</div>`;
  $("startDate").value = state.startDate||"";
}


/* ---------- lessons ---------- */
let SONG_LESSONS = {};
async function loadSongLessons(){ try{ const r = await fetch("data/song-lessons.json"); SONG_LESSONS = await r.json(); }catch(e){} }
function lessonFor(s){ return s && (s.lesson || SONG_LESSONS[(s.title||"").toLowerCase()]) || null; }
function nextStep(s, L){ const done = (s.lessonProgress||{}).steps||{}; return (L.steps||[]).find(x=>!done[x.id])||null; }
function theoryDone(id){ return !!((state.theoryProgress||{})[id]); }
function allTheory(){ const out=[]; (window.THEORY||[]).forEach(u=>u.lessons.forEach(l=>out.push(Object.assign({unit:u.id, unitTitle:u.title}, l)))); return out; }
function nextTheory(preferUnit){
  const all = allTheory();
  if(preferUnit){ const x = all.find(l=>l.unit===preferUnit && !theoryDone(l.id)); if(x) return x; }
  return all.find(l=>!theoryDone(l.id)) || null;
}

// song lesson sheet
let lessonSong = null;
function chordGrid(chords, key){
  return `<div class="chordgrid">${chords.map(c=>`<button class="chordbox" data-strum="${esc(c)}" aria-label="Hear ${esc(c)}">${Music.chordSVG(c)}<b>${esc(c)}</b>${key&&Music.chordNumber(c,key)?`<span class="num">${Music.chordNumber(c,key)}</span>`:""}</button>`).join("")}</div>`;
}
function openSongLesson(id){
  const s = state.songs.find(x=>x.id===id); const L = lessonFor(s); if(!s) return;
  lessonSong = s;
  const done = (s.lessonProgress||{}).steps||{};
  const box = $("lessonBody");
  if(!L){
    box.innerHTML = `<h2>${esc(s.title)}</h2><div class="sub">No lesson written for this song yet. Ask Claude in your Guitar Practice project to "write a lesson for ${esc(s.title)}".</div>`+songLinks(s);
    openSheet("lessonSheet"); return;
  }
  const doneCount = (L.steps||[]).filter(x=>done[x.id]).length;
  const nums = L.chords.map(c=>Music.chordNumber(c,L.key)).filter(Boolean);
  box.innerHTML = `
    <div><h2>${esc(s.title)}</h2><div class="sub">${esc(s.artist||"")} · Key of ${esc(L.key)} · Capo: ${esc(L.capo)}</div></div>
    <div class="card"><h3>Chords</h3><div class="sub">Tap a chord to hear it. Small numbers on the dots are which finger to use (1 = index). In the key of ${esc(L.key)} these are the ${nums.join(", ")} chords.</div>${chordGrid(L.chords, L.key)}</div>
    <div class="card"><h3>Steps · ${doneCount} of ${L.steps.length} done</h3>
      <div class="steps">${L.steps.map((st,i)=>`<label class="stepitem ${done[st.id]?"isdone":""}"><input type="checkbox" data-step="${st.id}" ${done[st.id]?"checked":""}><div><b>${i+1}. ${esc(st.title)}</b><div class="sub">${esc(st.detail)}</div></div></label>`).join("")}</div></div>
    ${L.hard?`<div class="card accent"><h3>Hard part</h3><b>${esc(L.hard.title)}</b><div class="sub">${esc(L.hard.why)}</div>${seqPlayer("hard", L.hard.chords, L.hard.startBpm, L.key)}</div>`:""}
    <div class="card"><h3>Strum patterns</h3>${L.strums.map((p,i)=>`<div class="strum"><b>${esc(p.name)}</b><div class="pattern">${patternHTML(p.pattern)}</div><div class="sub">${esc(p.note)}</div><button class="btn small" data-pattern="${i}">Hear it on G</button></div>`).join("")}</div>
    <div class="card"><h3>Song sections</h3><div class="sub">The player gives each chord one bar so you can practice the changes. The recording moves some chords faster.</div>
      ${L.sections.map((sec,i)=>`<div class="section"><div class="spread"><b>${esc(sec.name)}</b>${sec.repeat?`<span class="sub">${esc(sec.repeat)}</span>`:""}</div>${seqPlayer("sec"+i, sec.chords, 60, L.key)}</div>`).join("")}
    </div>
    ${songLinks(s, L)}`;
  openSheet("lessonSheet");
}
function patternHTML(p){ const counts=["1","&","2","&","3","&","4","&"]; return p.split("").map((c,i)=>`<span class="slot ${c==="-"?"rest":""}"><i>${counts[i]}</i>${c==="-"?"·":c}</span>`).join(""); }
function seqPlayer(id, chords, bpm, key){
  return `<div class="seq" data-seq="${id}" data-chords="${esc(chords.join(","))}">
    <div class="seqchords">${chords.map((c,i)=>`<span class="sc" data-i="${i}">${esc(c)}${key&&Music.chordNumber(c,key)?`<small>${Music.chordNumber(c,key)}</small>`:""}</span>`).join("")}</div>
    <div class="row"><button class="btn small primary" data-play-seq="${id}">Play</button>
    <label class="row" style="flex-direction:row;align-items:center;gap:6px">BPM <input type="number" class="bpmin" value="${bpm}" min="40" max="160" style="width:80px"></label>
    <label class="check" style="font-size:14px"><input type="checkbox" class="loopin"> Loop</label></div></div>`;
}
function songLinks(s, L){
  const q = encodeURIComponent(((s.artist||"")+" "+(s.title||"")).trim());
  return `<div class="row">${L&&L.tab?`<a class="btn small" href="${esc(L.tab)}" target="_blank" rel="noopener">Full chord chart (Ultimate Guitar)</a>`:`<a class="btn small" href="https://www.ultimate-guitar.com/search.php?search_type=title&value=${q}" target="_blank" rel="noopener">Find tab</a>`}${L&&L.video?`<a class="btn small" href="${esc(L.video)}" target="_blank" rel="noopener">Video lesson</a>`:""}<a class="btn small" href="https://music.apple.com/us/search?term=${q}" target="_blank" rel="noopener">Apple Music</a></div>`;
}
let playingSeq = null;
function playSeq(id){
  const el = document.querySelector(`[data-seq="${id}"]`); if(!el) return;
  if(playingSeq===id){ Music.stop(); return; }
  Music.stop();
  const chords = el.dataset.chords.split(","); const bpm = Number(el.querySelector(".bpmin").value)||60; const loop = el.querySelector(".loopin").checked;
  const btn = el.querySelector("[data-play-seq]"); playingSeq = id; btn.textContent = "Stop";
  const pattern = el.closest("#lessonBody") ? "D-D-D-D-" : "D-D-D-D-";
  const go = () => Music.playSequence(chords.map(c=>({chord:c, pattern})), bpm, { click:true,
    onStep:i=>{ el.querySelectorAll(".sc").forEach((x,j)=>x.classList.toggle("on", j===i)); },
    onEnd:()=>{ el.querySelectorAll(".sc").forEach(x=>x.classList.remove("on")); if(playingSeq===id && loop && el.querySelector(".loopin").checked && document.body.contains(el)){ setTimeout(()=>{ if(playingSeq===id) go(); }, 30); } else { if(playingSeq===id){ playingSeq=null; btn.textContent="Play"; } } } });
  go();
}
function stopSeq(){ const id = playingSeq; playingSeq = null; Music.stop(); if(id){ const el=document.querySelector(`[data-seq="${id}"] [data-play-seq]`); if(el) el.textContent="Play"; } }

// Learn tab
function renderLearn(){
  const box = $("learnUnits"); if(!box) return;
  const nx = nextTheory();
  $("learnNext").innerHTML = nx ? `<div class="sub">Up next</div><b>${esc(nx.title)}</b><div class="sub">${esc(nx.unitTitle)} · about ${nx.minutes} min</div><button class="btn primary" data-theory="${nx.id}">Start lesson</button>` : `<b>You've finished every lesson so far.</b><div class="sub">Ask Claude for the next unit.</div>`;
  box.innerHTML = (window.THEORY||[]).map(u=>{
    const n = u.lessons.filter(l=>theoryDone(l.id)).length;
    return `<div class="card"><div class="spread"><h2>${esc(u.title)}</h2><span class="pill ${n===u.lessons.length?"sage":""}">${n}/${u.lessons.length}</span></div><div class="sub">${esc(u.intro)}</div>
      <div class="list">${u.lessons.map((l,i)=>`<button class="song" data-theory="${l.id}"><div><div class="t">${i+1}. ${esc(l.title)}</div><div class="a">about ${l.minutes} min</div></div>${theoryDone(l.id)?'<span class="pill sage">Done</span>':'<span class="pill">Start</span>'}</button>`).join("")}</div></div>`;
  }).join("");
}
let theoryOpen = null, quizState = {};
function openTheory(id){
  const l = allTheory().find(x=>x.id===id); if(!l) return;
  theoryOpen = l; quizState = {};
  let qn = 0;
  const html = l.body.map((b,bi)=>{
    if(b.p) return `<p>${esc(b.p)}</p>`;
    if(b.h) return `<h3>${esc(b.h)}</h3>`;
    if(b.chords) return chordGrid(b.chords, null);
    if(b.try) return `<div class="try"><b>Try it on guitar</b><div>${esc(b.try)}</div></div>`;
    if(b.play) return `<button class="btn playbtn" data-tplay="${bi}">▶ ${esc(b.play.label)}</button>`;
    if(b.quiz) return `<div class="quiz"><h3>Check yourself</h3>${b.quiz.map((q,qi)=>{ const key=bi+"-"+qi; qn++; return `<div class="q" data-q="${key}"><b>${esc(q.q)}</b>${q.play?`<button class="btn small" data-qplay="${key}">▶ Listen</button>`:""}<div class="opts">${q.options.map((o,oi)=>`<button class="opt" data-ans="${key}" data-oi="${oi}">${esc(o)}</button>`).join("")}</div><div class="explain sub"></div></div>`; }).join("")}</div>`;
    return "";
  }).join("");
  $("theoryBody").innerHTML = `<div class="sub">${esc(l.unitTitle)}</div><h2>${esc(l.title)}</h2>${html}
    <button class="btn primary" id="theoryDoneBtn">${theoryDone(l.id)?"Done · back to lessons":"Mark lesson done"}</button>`;
  $("theoryDoneBtn").onclick = ()=>{ (state.theoryProgress = state.theoryProgress||{})[l.id] = todayStr(); persist(); closeSheet("theorySheet"); Music.stop(); toast("Lesson done"); renderAll(); };
  openSheet("theorySheet");
}
function playTheory(spec){
  if(!spec) return; Music.stop();
  if(spec.kind==="scale"){ const ms = Music.scaleMidis(spec.key); Music.playSequence(ms.map(m=>({note:m, pattern:"D-"})), 100, {}); }
  else if(spec.kind==="note"){ Music.playSequence([{note:spec.midi, pattern:"D-------"},{note:spec.midi, pattern:"D-------"}], 60, {}); }
  else if(spec.kind==="chords"){ Music.playSequence(spec.chords.map(c=>({chord:c, pattern:"D-D-D-D-"})), spec.bpm||80, {transpose:spec.transpose||0}); }
}
function answer(key, oi){
  const [bi,qi] = key.split("-").map(Number); const q = theoryOpen.body[bi].quiz[qi];
  const wrap = document.querySelector(`[data-q="${key}"]`);
  wrap.querySelectorAll(".opt").forEach((b,i)=>{ b.classList.toggle("right", i===q.answer && oi===q.answer); b.classList.toggle("wrong", i===oi && oi!==q.answer); });
  wrap.querySelector(".explain").textContent = (oi===q.answer?"Right. ":"Not quite. ") + q.explain;
  if(oi!==q.answer) wrap.querySelector(".explain").textContent += " Try another answer if you like.";
}

/* ---------- shell ---------- */
function renderAll(){
  $("phaseLine").textContent = "Week "+weekNum()+" · "+PHASE_NAMES[phase()];
  renderToday(); renderSongs(); renderProgress(); renderLearn(); renderAlertsRow();
}
function show(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("hidden", v.id!=="view-"+view));
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-current", b.dataset.view===view?"page":"false"));
  window.scrollTo(0,0);
}
function openSheet(id){ $(id).classList.add("open"); }
function closeSheet(id){ $(id).classList.remove("open"); }

document.addEventListener("click", e=>{
  const t=e.target.closest("button, a"); if(!t) return;
  if(t.dataset.view) show(t.dataset.view);
  else if(t.dataset.min){ if(run){ toast("Finish or log the current session first"); return; } chosenMinutes=Number(t.dataset.min); renderToday(); }
  else if(t.dataset.filter){ filter=t.dataset.filter; renderSongs(); }
  else if(t.dataset.song) openSong(t.dataset.song);
  else if(t.dataset.bpm) setBpm(bpm+Number(t.dataset.bpm));
  else if(t.dataset.metroSong){ const s=state.songs.find(x=>x.id===t.dataset.metroSong); setBpm(s&&s.tempo?s.tempo:60); $("tempoSong").value=t.dataset.metroSong; show("metro"); }
  else if(t.dataset.lessonSong){ openSongLesson(t.dataset.lessonSong); }
  else if(t.dataset.theory){ openTheory(t.dataset.theory); }
  else if(t.dataset.strum){ Music.strum(t.dataset.strum, 0, "D", 0.6); }
  else if(t.dataset.playSeq){ playSeq(t.dataset.playSeq); }
  else if(t.dataset.pattern!=null && lessonSong){ const L=lessonFor(lessonSong); const p=L.strums[Number(t.dataset.pattern)]; Music.playSequence([{chord:"G",pattern:p.pattern,bars:2},{chord:"C",pattern:p.pattern,bars:1},{chord:"G",pattern:p.pattern,bars:1}], 80, {click:true}); }
  else if(t.dataset.tplay!=null && theoryOpen){ playTheory(theoryOpen.body[Number(t.dataset.tplay)].play); }
  else if(t.dataset.qplay && theoryOpen){ const [bi,qi]=t.dataset.qplay.split("-").map(Number); playTheory(theoryOpen.body[bi].quiz[qi].play); }
  else if(t.dataset.ans){ answer(t.dataset.ans, Number(t.dataset.oi)); }
  else if(t.dataset.openLesson){ closeSheet("songSheet"); openSongLesson(t.dataset.openLesson); }
  else if(t.hasAttribute("data-close")){ const bg=t.closest(".sheet-bg"); bg.classList.remove("open"); if(bg.id==="lessonSheet"||bg.id==="theorySheet"){ stopSeq(); } }
});
document.addEventListener("change", e=>{
  const c = e.target; if(c.dataset && c.dataset.step && lessonSong){
    const lp = lessonSong.lessonProgress = lessonSong.lessonProgress||{}; lp.steps = lp.steps||{};
    if(c.checked) lp.steps[c.dataset.step] = todayStr(); else delete lp.steps[c.dataset.step];
    c.closest(".stepitem").classList.toggle("isdone", c.checked); persist(); renderToday();
  }
});
document.querySelectorAll(".sheet-bg").forEach(bg=>bg.addEventListener("click",e=>{ if(e.target===bg){ bg.classList.remove("open"); stopSeq(); } }));
$("startBtn").onclick=()=>{ ensureAudio(); togglePause(); };
$("nextBtn").onclick=nextBlock;
$("finishBtn").onclick=()=>{ if(run && !run.paused && !run.done){ run.pausedLeft=remaining(); run.paused=true; cancelAlerts(); saveRun(); $("startBtn").textContent="Resume"; } openLog(); };
$("saveLogBtn").onclick=saveLog;
$("addSongBtn").onclick=()=>openSong(null);
$("saveSongBtn").onclick=saveSong;
$("delSongBtn").onclick=deleteSong;
$("bpmRange").oninput=e=>setBpm(Number(e.target.value));
$("beatsSel").onchange=e=>{ beats=Number(e.target.value); drawDots(); };
$("metroBtn").onclick=toggleMetro;
$("tapBtn").onclick=tap;
const APP_VERSION = "4";
$("soundTestBtn").onclick=()=>{
  const c = Music.audio(); const info = [];
  info.push("app v"+APP_VERSION);
  info.push("web audio: "+(c?c.state:"not available"));
  if(c){ try{ const t=c.currentTime; const o=c.createOscillator(), g=c.createGain(); o.frequency.value=660; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.5,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+0.6); o.connect(g).connect(c.destination); o.start(t); o.stop(t+0.65); }catch(e){ info.push("tone error: "+e.message); } }
  setTimeout(()=>{
    try{ const a = new Audio(Music.beepWav()); a.setAttribute("playsinline",""); const p=a.play(); if(p&&p.then) p.then(()=>{ info.push("media beep: played"); show(); }).catch(e=>{ info.push("media beep: blocked ("+e.name+")"); show(); }); }catch(e){ info.push("media beep error"); }
    show();
  }, 800);
  function show(){ $("soundInfo").textContent = info.join(" · ")+" · audioSession: "+(navigator.audioSession?navigator.audioSession.type:"n/a")+" · standalone: "+(window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true); }
  setTimeout(()=>{ info[1]="web audio: "+(c?c.state:"n/a"); show(); }, 300);
};
$("saveTempoBtn").onclick=()=>{ const s=state.songs.find(x=>x.id===$("tempoSong").value); if(!s){ toast("Add a song first"); return; } s.tempo=bpm; (s.tempoLog=s.tempoLog||[]).push({d:todayStr(),bpm}); persist(); toast(s.title+": "+bpm+" BPM saved"); renderAll(); };
$("saveBmBtn").onclick=()=>{ const v=Number($("bmVal").value); if(!(v>0)){ $("bmVal").focus(); return; } (state.benchmarks=state.benchmarks||[]).push({id:uid(),type:$("bmType").value,value:v,d:todayStr()}); $("bmVal").value=""; persist(); toast("Result saved"); renderProgress(); };
$("authForm").addEventListener("submit", submitAuth);
$("authToggle").onclick=()=>setAuthMode(!signingUp);
$("signOutBtn").onclick=async()=>{ await flush(); await sb.auth.signOut(); };
$("starterBtn").onclick=loadStarter;
$("saveStart").onclick=()=>{ const v=$("startDate").value.trim(); if(!parseDay(v)){ toast("Use YYYY-MM-DD"); return; } state.startDate=v; persist(); toast("Start date saved"); renderAll(); };
drawDots(); setBpm(80);
init();
})();
