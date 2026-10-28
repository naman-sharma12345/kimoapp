# Worked examples (abbreviated)

## "make this a tiktok, cut the pauses, add captions"

Plan: switch to 9:16, scale the 16:9 A-roll to fill, remove 7 silences (18.4 s total), open on the strongest line at 0:42, word-timed pop captions.
Ops (sketch):

- project.update {width:1080, height:1920}
- clip.update a1 {transform:{x:0,y:0,scale:1.78,rotation:0,opacity:1}}
- clip.split a1 at 42.0 -> a1b; clip.move a1b to start 0; reorder the rest after it
- clip.split / clip.remove for each silence > 0.25 s; close the gaps with clip.move
- every 2nd segment: clip.update {transform.scale: 1.95} (punch-in)
- track.add {id:"t-cap", kind:"text"}; clip.add caption clips from words[], style caption-pop, animation pop words, position middle
- clip.add music (if present) volume 0.18, duckUnderVoice true, fadeIn 0.5, fadeOut 1.5

## "make it look cinematic"

Plan: teal & orange grade, light grain, vignette, letterbox, crossfades between scenes only.

- effect.set on each video clip {id:"grade", type:"color_grade", params:{lut:"teal & orange", contrast:1.12}}
- effect.set {type:"film_grain", params:{amount:0.05}}, {type:"vignette", params:{amount:0.25}}
- clip.update each {transform.crop:{l:0,t:0.06,r:0,b:0.06}}
- clip.update scene boundaries {transitionIn:{type:"crossfade", duration:0.5}}

## "beat-synced montage with this song"

Plan: cut each shot on a beat from the music's beats[], fastest in the chorus, zoom_punch on drops, warm grade.

- place shots back to back so each clip boundary equals a beat time
- effect.set zoom_punch on clips that start on the 1st beat of each bar in the drop
