// Lessons for the Learn tab. Block types:
// {p}: paragraph · {h}: subheading · {chords:[names]}: diagrams you can tap · {play:{label, kind, ...}}: audio button
// {try}: something to do on the guitar · {quiz:[{q, play?, options, answer, explain}]}
window.THEORY = [
{
  id:"keys", title:"Keys and Nashville numbers",
  intro:"The system country players use to talk about chords. Learn it once and you can play any song in any key, and follow friends at a jam.",
  lessons:[
  { id:"keys-1", title:"What a key is", minutes:5, body:[
    {p:"A key is a song's home base: a set of seven notes that sound like they belong together, with one note that feels like home. Most of the songs you play are in the key of G, so home is the note G."},
    {p:"Those seven notes come from the major scale. In G they are G, A, B, C, D, E and F♯, then back to G. The F♯ is the one sharp in this key."},
    {play:{label:"Hear the G major scale", kind:"scale", key:"G"}},
    {p:"Listen for how the last G sounds finished. That pull toward home is what makes a key."},
    {try:"Play the G major scale: low E string 3rd fret (G), A string 0-2-3 (A B C), D string 0-2-4 (D E F♯), G string 0 (G). Say each note name out loud as you play it."},
    {quiz:[
      {q:"What is the 4th note of the G major scale?", options:["B","C","D","E"], answer:1, explain:"G(1) A(2) B(3) C(4). C is the 4th, and you'll see why that matters next lesson."},
      {q:"How many different notes are in a major scale before it repeats?", options:["5","6","7","8"], answer:2, explain:"Seven. The eighth note is the same as the first, one octave up."},
      {q:"Which note is sharp in the key of G?", options:["C♯","F♯","G♯","B♭"], answer:1, explain:"F♯. It's the only sharp in G major."}
    ]}
  ]},
  { id:"keys-2", title:"The chords that live in a key", minutes:6, body:[
    {p:"Each note of the scale has a chord built on it. Number them 1 to 7. In G you get:"},
    {p:"1 = G · 2 = Am · 3 = Bm · 4 = C · 5 = D · 6 = Em"},
    {chords:["G","Am","Bm","C","D","Em"]},
    {p:"The 1, 4 and 5 are major chords. The 2, 3 and 6 are minor, so they're written 2m, 3m and 6m. (The 7 chord is rarely used in country, so skip it for now.)"},
    {play:{label:"Hear 1 – 2m – 3m – 4 – 5 – 6m in G", kind:"chords", chords:["G","Am","Bm","C","D","Em"], bpm:90}},
    {p:"Here's the useful part: almost every country song is built mostly from the 1, 4, 5 and 6m. In G, that's G, C, D and Em: the exact four chords in Corinthians and Shivers Down Spines."},
    {quiz:[
      {q:"In the key of G, which chord is the 5?", options:["C","D","Em","Am"], answer:1, explain:"D. Count up the scale: G A B C D, so D is 5th."},
      {q:"Which numbers are minor chords?", options:["1, 4, 5","2, 3, 6","1, 3, 5","4, 5, 6"], answer:1, explain:"2m, 3m and 6m. The 1, 4 and 5 are major."},
      {q:"Em is which number in G?", options:["2m","3m","6m","4"], answer:2, explain:"6m. E is the 6th note of the G scale and the chord is minor."}
    ]}
  ]},
  { id:"keys-3", title:"Your songs in numbers", minutes:5, body:[
    {p:"Now turn chord names into numbers. In the key of G: G = 1, C = 4, D = 5, Em = 6m."},
    {h:"Corinthians, chorus"},
    {p:"C G D G C becomes 4 – 1 – 5 – 1 – 4."},
    {play:{label:"Play the Corinthians chorus", kind:"chords", chords:["C","G","D","G","C"], bpm:80}},
    {h:"Shivers Down Spines, intro"},
    {p:"Em G C G C G D becomes 6m – 1 – 4 – 1 – 4 – 1 – 5. It starts on the 6m, which is why it feels darker than Corinthians even though it's the same four chords."},
    {play:{label:"Play the Shivers intro", kind:"chords", chords:["Em","G","C","G","C","G","D"], bpm:80}},
    {try:"Pick another song you can play. Write its chorus in numbers on the song's page under \"Song map\"."},
    {quiz:[
      {q:"G – Em – C – D in numbers is…", options:["1 – 6m – 4 – 5","1 – 3m – 4 – 5","1 – 6m – 5 – 4","4 – 6m – 1 – 5"], answer:0, explain:"G=1, Em=6m, C=4, D=5. This exact progression is in hundreds of songs."},
      {q:"A song in G goes 1 – 5 – 6m – 4. What chords do you play?", options:["G D Em C","G C Em D","C G Am F","G D Am C"], answer:0, explain:"1=G, 5=D, 6m=Em, 4=C."}
    ]}
  ]},
  { id:"keys-4", title:"Same numbers, new key", minutes:6, body:[
    {p:"The numbers stay the same when the key changes; only the chord names move. That's how a friend can say \"it's a 1-4-5 in D\" and you can play along without a chart."},
    {p:"Key of D: 1 = D · 2m = Em · 3m = F♯m · 4 = G · 5 = A · 6m = Bm"},
    {chords:["D","Em","G","A","Bm"]},
    {play:{label:"1 – 5 – 6m – 4 in G", kind:"chords", chords:["G","D","Em","C"], bpm:80}},
    {play:{label:"The same numbers in D", kind:"chords", chords:["D","A","Bm","G"], bpm:80}},
    {p:"Hear how it's the same song shape, just higher? That's a key change."},
    {try:"Play the Corinthians chorus (4 – 1 – 5 – 1 – 4) in the key of D: G – D – A – D – G."},
    {quiz:[
      {q:"In the key of D, what is the 5 chord?", options:["G","A","Bm","E"], answer:1, explain:"A. D E F♯ G A: A is the 5th note."},
      {q:"In the key of C, what is the 4 chord?", options:["F","G","Am","D"], answer:0, explain:"F. C D E F: F is the 4th."},
      {q:"A friend calls \"1 – 4 – 5 in D\". You play…", options:["D G A","G C D","D E A","A D E"], answer:0, explain:"D, G and A."}
    ]}
  ]},
  { id:"keys-5", title:"Capo math", minutes:5, body:[
    {p:"Each fret raises the pitch by a half step. A capo raises every string at once, so the chord shapes you know now sound in a higher key."},
    {p:"The half steps going up from G: G → G♯ → A → A♯ → B → C → C♯ → D. So with G shapes:"},
    {p:"Capo 2 = key of A · Capo 4 = key of B · Capo 5 = key of C · Capo 7 = key of D"},
    {play:{label:"G shapes, no capo", kind:"chords", chords:["G","C","D","G"], bpm:90}},
    {play:{label:"G shapes, capo 2 (sounds in A)", kind:"chords", chords:["G","C","D","G"], bpm:90, transpose:2}},
    {p:"Why it matters for you: if a song feels too low or too high to sing, move the capo instead of learning new chords. Your fingers play the same shapes and the numbers stay the same."},
    {quiz:[
      {q:"G shapes with a capo on fret 2 sound in which key?", options:["G","A","B","C"], answer:1, explain:"Two half steps up from G: G♯, then A."},
      {q:"You want a song in G to sound one half step higher. Capo on…", options:["Fret 1","Fret 2","Fret 3","Fret 5"], answer:0, explain:"One fret = one half step."},
      {q:"Capo 5 with G shapes sounds in…", options:["B","C","D","E"], answer:1, explain:"G♯, A, A♯, B, C: five half steps up is C."}
    ]}
  ]},
  { id:"keys-6", title:"Hearing 1, 4 and 5", minutes:6, body:[
    {p:"Numbers aren't just names; each chord has a feeling. Learning to hear them is how you'll eventually play songs by ear."},
    {p:"The 1 feels like home and rest. The 4 feels like lifting away, open and hopeful. The 5 feels tense, like it wants to resolve back home."},
    {play:{label:"1 → 4 → 1", kind:"chords", chords:["G","C","G"], bpm:70}},
    {play:{label:"1 → 5 → 1", kind:"chords", chords:["G","D","G"], bpm:70}},
    {p:"Listen to each a few times. Focus on the middle chord: does it lift (4) or lean back toward home (5)?"},
    {quiz:[
      {q:"Listen. Is the middle chord the 4 or the 5?", play:{kind:"chords", chords:["G","D","G"], bpm:70}, options:["4","5"], answer:1, explain:"That was G → D → G. The D is the 5: it pulls back home."},
      {q:"Listen. Is the middle chord the 4 or the 5?", play:{kind:"chords", chords:["G","C","G"], bpm:70}, options:["4","5"], answer:0, explain:"G → C → G. The C is the 4: it lifts away."},
      {q:"Listen. Which chord is the song resting on at the end?", play:{kind:"chords", chords:["C","D","G"], bpm:70}, options:["The 1","The 4","The 5"], answer:0, explain:"4 → 5 → 1, the most common ending there is. The last chord is home."}
    ]}
  ]}
  ]
},
{
  id:"sing", title:"Singing while playing",
  intro:"The step-by-step method guitar teachers use: get the guitar part on autopilot, learn the vocal on its own, then layer them.",
  lessons:[
  { id:"sing-1", title:"Find your range", minutes:5, body:[
    {p:"Everyone has a range where singing feels easy. Knowing yours tells you which key or capo to use for each song."},
    {p:"Tap a note, then hum or sing it. Start low and work up. Your comfortable range is the notes you can hit without straining or going breathy."},
    {play:{label:"G (low)", kind:"note", midi:43}}, {play:{label:"C", kind:"note", midi:48}}, {play:{label:"E", kind:"note", midi:52}},
    {play:{label:"G (middle)", kind:"note", midi:55}}, {play:{label:"B", kind:"note", midi:59}}, {play:{label:"D", kind:"note", midi:62}}, {play:{label:"E (high)", kind:"note", midi:64}},
    {try:"Write your lowest and highest comfortable notes in your session notes today. Warm up first with 30 seconds of gentle humming. A rusty voice is normal and comes back quickly."}
  ]},
  { id:"sing-2", title:"Guitar on autopilot", minutes:5, body:[
    {p:"You can't think about chords and sing at the same time. The guitar part has to run without your attention first."},
    {p:"The test teachers use: can you play the song while talking, counting out loud or reading something aloud? If your hands stumble, the guitar isn't automatic yet."},
    {try:"Play the verse of Shivers Down Spines while counting \"1, 2, 3, 4\" out loud. Then try it while describing your day out loud."},
    {p:"If it falls apart, simplify the strum to four downstrokes per bar. A simpler strum frees up your attention for your voice."},
    {quiz:[
      {q:"What's the best sign a guitar part is ready for singing?", options:["You can play it fast","You can play it while talking","You know the tab by heart","You've played it 10 times"], answer:1, explain:"If you can talk over it, your hands are running without your attention."}
    ]}
  ]},
  { id:"sing-3", title:"Hum, speak, then sing", minutes:6, body:[
    {p:"Layer the voice in small steps, so each one only adds one new thing:"},
    {p:"1. Sing along with the recording, no guitar. Learn the melody and where each line starts."},
    {p:"2. Strum and hum the melody. No words."},
    {p:"3. Strum and speak the lyrics in rhythm, like talking."},
    {p:"4. Sing slowly with the metronome. Then work up to full tempo."},
    {p:"Most lines start just before or just after a chord change, so notice which chord you're on when each line begins."},
    {try:"Do steps 2 and 3 on one verse of Doing Fine or Shivers Down Spines today."},
    {quiz:[
      {q:"What comes right after strumming and humming?", options:["Singing at full speed","Speaking the lyrics in rhythm","Adding a harder strum","Playing without the recording"], answer:1, explain:"Speaking in rhythm lines your mouth up with your hands before adding pitch."}
    ]}
  ]},
  { id:"sing-4", title:"Pick a key that fits your voice", minutes:5, body:[
    {p:"If a song feels too low or strains at the top, it's usually the key, not your voice. Move the capo to change the key while keeping the same shapes."},
    {p:"Test it: sing the highest line of the chorus. If it strains, try the capo one or two frets lower (or no capo). If the verse is too low to sing clearly, move the capo up."},
    {play:{label:"Chorus shape in G", kind:"chords", chords:["C","G","D","G"], bpm:80}},
    {play:{label:"Same shapes, capo 2", kind:"chords", chords:["C","G","D","G"], bpm:80, transpose:2}},
    {try:"Heading South felt harder to sing. Try its chorus with the capo in two different spots and note which one feels better."}
  ]}
  ]
}
];
