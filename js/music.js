// Music helpers: chord shapes and diagrams, a plucked-string synth, and a progression player.
(function(){
"use strict";
const STRINGS = [40,45,50,55,59,64]; // MIDI notes of open strings, low E to high E
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

// frets per string, low E first; -1 = don't play
const SHAPES = {
  "G":[3,2,0,0,0,3], "C":[-1,3,2,0,1,0], "D":[-1,-1,0,2,3,2], "Em":[0,2,2,0,0,0],
  "Am":[-1,0,2,2,1,0], "A":[-1,0,2,2,2,0], "E":[0,2,2,1,0,0], "Dm":[-1,-1,0,2,3,1],
  "Cadd9":[-1,3,2,0,3,3], "Em7":[0,2,2,0,3,3], "Dsus4":[-1,-1,0,2,3,3], "Dsus2":[-1,-1,0,2,3,0],
  "G/B":[-1,2,0,0,3,3], "D/F#":[2,0,0,2,3,2], "Bm":[-1,2,4,4,3,2], "F":[1,3,3,2,1,1],
  "F#m":[2,4,4,2,2,2], "B7":[-1,2,1,2,0,2], "A7":[-1,0,2,0,2,0], "E7":[0,2,0,1,0,0], "D7":[-1,-1,0,2,1,2],
  "Asus2":[-1,0,2,2,0,0], "Asus4":[-1,0,2,2,3,0], "C/G":[3,3,2,0,1,0]
};
// which finger to use (1 index … 4 pinky), same order; 0 = none
const FINGERS = {
  "G":[2,1,0,0,0,3], "C":[0,3,2,0,1,0], "D":[0,0,0,1,3,2], "Em":[0,2,3,0,0,0], "Am":[0,0,2,3,1,0],
  "A":[0,0,1,2,3,0], "E":[0,2,3,1,0,0], "Dm":[0,0,0,2,3,1], "Cadd9":[0,2,1,0,3,4], "Em7":[0,1,2,0,3,4],
  "Dsus4":[0,0,0,1,2,3], "Dsus2":[0,0,0,1,3,0], "G/B":[0,1,0,0,3,4], "D/F#":[2,0,0,1,3,4],
  "Bm":[0,1,3,4,2,1], "F":[1,3,4,2,1,1], "F#m":[1,3,4,1,1,1], "B7":[0,2,1,3,0,4],
  "A7":[0,0,2,0,3,0], "E7":[0,2,0,1,0,0], "D7":[0,0,0,2,1,3], "Asus2":[0,0,1,2,0,0], "Asus4":[0,0,1,2,3,0], "C/G":[3,4,2,0,1,0]
};

function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

function chordSVG(name){
  const f = SHAPES[name]; if(!f) return `<div class="chordbox unknown"><b>${esc(name)}</b><span>Look up on the tab</span></div>`;
  const fing = FINGERS[name]||[];
  const played = f.filter(x=>x>0); const min = played.length?Math.min(...played):1, max = played.length?Math.max(...played):1;
  const base = max>4 ? min : 1; // starting fret shown
  const W=100,H=120,l=14,r=86,t=26,b=112, sx=(r-l)/5, fy=(b-t)/5;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chordsvg" role="img" aria-label="${esc(name)} chord diagram">`;
  if(base===1) s += `<rect x="${l}" y="${t-3}" width="${r-l}" height="4" fill="currentColor"/>`;
  else s += `<text x="${l-4}" y="${t+fy*0.65}" font-size="10" text-anchor="end" fill="currentColor">${base}fr</text>`;
  for(let i=0;i<6;i++) s += `<line x1="${l+i*sx}" y1="${t}" x2="${l+i*sx}" y2="${b}" stroke="currentColor" stroke-width="1" opacity=".7"/>`;
  for(let j=0;j<=5;j++) s += `<line x1="${l}" y1="${t+j*fy}" x2="${r}" y2="${t+j*fy}" stroke="currentColor" stroke-width="1" opacity=".5"/>`;
  f.forEach((fr,i)=>{
    const x=l+i*sx;
    if(fr<0) s += `<text x="${x}" y="${t-8}" font-size="11" text-anchor="middle" fill="currentColor">×</text>`;
    else if(fr===0) s += `<circle cx="${x}" cy="${t-11}" r="3.6" fill="none" stroke="currentColor" stroke-width="1.3"/>`;
    else { const y=t+(fr-base+0.5)*fy; s += `<circle cx="${x}" cy="${y}" r="7" class="dot"/>`; if(fing[i]) s += `<text x="${x}" y="${y+3.6}" font-size="10" text-anchor="middle" class="dotnum">${fing[i]}</text>`; }
  });
  return s + `</svg>`;
}

/* ---------- synth ---------- */
let ctx = null; const bufCache = {};
function audio(){ if(!ctx){ const AC = window.AudioContext||window.webkitAudioContext; if(AC) ctx = new AC(); } if(ctx && ctx.state==="suspended") ctx.resume(); return ctx; }
function pluckBuffer(midi){
  if(bufCache[midi]) return bufCache[midi];
  const sr = ctx.sampleRate, f = 440*Math.pow(2,(midi-69)/12), len = Math.floor(sr*2.2);
  const N = Math.max(2, Math.round(sr/f)), buf = ctx.createBuffer(1,len,sr), d = buf.getChannelData(0);
  const ring = new Float32Array(N); for(let i=0;i<N;i++) ring[i] = Math.random()*2-1;
  const decay = 0.996 - Math.max(0,(midi-52))*0.0004;
  let idx = 0;
  for(let i=0;i<len;i++){ const nx=(idx+1)%N; const v = ring[idx]; d[i]=v; ring[idx] = decay*0.5*(v+ring[nx]); idx = nx; }
  return bufCache[midi] = buf;
}
let master = null;
function out(){ if(!master){ master = ctx.createGain(); master.gain.value = 0.55; const comp = ctx.createDynamicsCompressor(); master.connect(comp).connect(ctx.destination); } return master; }
const voices = new Set();
function playMidi(midi, when, vel){
  const c = audio(); if(!c) return;
  const src = c.createBufferSource(); src.buffer = pluckBuffer(midi);
  const g = c.createGain(); g.gain.value = (vel==null?0.5:vel);
  src.connect(g).connect(out()); src.start(when||c.currentTime); voices.add(src); src.onended=()=>voices.delete(src);
}
function chordNotes(name){ const f = SHAPES[name]; if(!f) return []; return f.map((fr,i)=> fr<0?null:STRINGS[i]+fr).filter(x=>x!=null); }
function strum(name, when, dir, vel, tr){
  const c = audio(); if(!c) return; when = when||c.currentTime;
  let notes = chordNotes(name).map(m=>m+(tr||0)); if(!notes.length) return;
  if(dir==="U") notes = notes.slice(-4).reverse();
  notes.forEach((m,i)=> playMidi(m, when + i*(dir==="U"?0.009:0.013), (vel||0.5)*(dir==="U"?0.7:1)));
}
function stopAll(){ voices.forEach(v=>{ try{ v.stop(); }catch(e){} }); voices.clear(); }
function noteName(midi){ return NOTE_NAMES[midi%12]; }

// play a sequence of items: {chord, pattern:"D-DU-UDU" (8 eighths per bar), bars}
let seqTimer = null, seqStop = null;
function playSequence(items, bpm, opts){
  stop(); const c = audio(); if(!c) return;
  opts = opts||{}; const eighth = 60/bpm/2; let t = c.currentTime + 0.12;
  const marks = [];
  items.forEach((it,idx)=>{
    const pat = (it.pattern||"D-D-D-D-").replace(/\s/g,"");
    const bars = it.bars||1;
    for(let b=0;b<bars;b++){
      marks.push({t, idx});
      for(let k=0;k<pat.length;k++){
        const ch = pat[k];
        if(it.note!=null){ if(k===0) playMidi(it.note, t, 0.6); }
        else if(ch==="D"||ch==="U") strum(it.chord, t + k*eighth, ch, 0.5, opts.transpose||0);
        if(opts.click && k%2===0) clickAt(t + k*eighth, k===0);
      }
      t += pat.length*eighth;
    }
  });
  const start = c.currentTime;
  const timers = marks.map(m=> setTimeout(()=> opts.onStep && opts.onStep(m.idx), Math.max(0,(m.t-start)*1000)));
  timers.push(setTimeout(()=>{ opts.onEnd && opts.onEnd(); }, Math.max(0,(t-start)*1000)));
  seqStop = ()=>{ timers.forEach(clearTimeout); stopAll(); opts.onEnd && opts.onEnd(); };
}
function clickAt(t, accent){ const o=ctx.createOscillator(), g=ctx.createGain(); o.frequency.value=accent?1500:1000; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.25,t+0.002); g.gain.exponentialRampToValueAtTime(0.0001,t+0.05); o.connect(g).connect(out()); o.start(t); o.stop(t+0.06); }
function stop(){ if(seqStop){ const f=seqStop; seqStop=null; f(); } else stopAll(); }

// major scale and keys
const MAJOR = [0,2,4,5,7,9,11];
const KEY_ROOT = {C:48,"C#":49,D:50,"D#":51,E:52,F:53,"F#":54,G:43,"G#":44,A:45,"A#":46,B:47};
function scaleMidis(key){ const r = KEY_ROOT[key]; return MAJOR.map(i=>r+i).concat([r+12]); }
const NUMBERS = { // diatonic chords by key
  G:["G","Am","Bm","C","D","Em"], C:["C","Dm","Em","F","G","Am"], D:["D","Em","F#m","G","A","Bm"],
  A:["A","Bm","C#m","D","E","F#m"], E:["E","F#m","G#m","A","B","C#m"]
};
const NUM_LABELS = ["1","2m","3m","4","5","6m"];
function chordNumber(chord, key){ const list = NUMBERS[key]; if(!list) return ""; const i = list.indexOf(chord.replace(/(add9|sus2|sus4|7)$/,"")); return i<0?"":NUM_LABELS[i]; }

window.Music = { SHAPES, chordSVG, strum, playMidi, playSequence, stop, audio, scaleMidis, NUMBERS, NUM_LABELS, chordNumber, noteName, chordNotes };
})();
