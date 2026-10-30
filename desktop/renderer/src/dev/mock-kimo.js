// Browser test harness for the renderer: a fake window.kimo (the preload bridge)
// with canned projects and a simulated live AI edit. No AI, SAM or network calls.
// Load it before the bundle (Playwright addInitScript). Not shipped in the app.
(() => {
  const M = (window.__MEDIA_BASE = window.__MEDIA_BASE || '/media/');
  const subs = { project: [], event: [], progress: [], update: [] };
  const on = (k) => (fn) => (subs[k].push(fn), () => (subs[k] = subs[k].filter((f) => f !== fn)));
  const emit = (k, v) => subs[k].forEach((f) => f(v));
  const now = Date.now();
  const presets = {
    youtube: { label: 'YouTube 16:9 · 1080p', width: 1920, height: 1080, mbps: 16 },
    youtube4k: { label: 'YouTube 16:9 · 4K', width: 3840, height: 2160, mbps: 45 },
    shorts: { label: 'Shorts / Reels 9:16 · 1080p', width: 1080, height: 1920, mbps: 12 },
    square: { label: 'Square 1:1 · 1080p', width: 1080, height: 1080, mbps: 10 },
    portrait: { label: 'Portrait 4:5 · 1080p', width: 1080, height: 1350, mbps: 10 },
  };
  const styles = { auto: 'Auto', punchy: 'Punchy (fast cuts, bold captions)', clean: 'Clean (calm, minimal)', cinematic: 'Cinematic (graded, slow)', vlog: 'Vlog (warm, chatty)' };
  const tl = (n) => ({
    duration: 42,
    tracks_bottom_to_top: [
      { track_id: 'v1', clips: [
        { id: 'c1', src: 'C:/clips/manali_drive.mp4', start: 0, end: 11.5, in: 4 },
        { id: 'c2', src: 'C:/clips/river_walk.mp4', start: 11.5, end: 24, in: 0 },
        { id: 'c3', src: 'C:/clips/sunset_pass.mp4', start: 24, end: 42, in: 2 },
      ].slice(0, n) },
      { track_id: 'a1', clips: [{ id: 'm1', src: 'C:/music/lofi_track.mp3', start: 0, end: 42, in: 0 }] },
      { track_id: 't1', clips: [
        { id: 't1a', src: 'text: the road to manali', start: 0.4, end: 6 },
        { id: 't1b', src: 'text: we left before sunrise', start: 12, end: 18 },
        { id: 't1c', src: 'text: snow on the pass', start: 25, end: 31 },
      ].slice(0, n) },
      { track_id: 't2', clips: [
        { id: 'w1', src: 'text: THE', start: 0.4, end: 0.9 }, { id: 'w2', src: 'text: ROAD', start: 0.9, end: 1.5 },
        { id: 'w3', src: 'text: TO', start: 1.5, end: 1.9 }, { id: 'w4', src: 'text: MANALI', start: 1.9, end: 3.2 },
        { id: 'w5', src: 'text: we left', start: 12, end: 13.4 }, { id: 'w6', src: 'text: before sunrise', start: 13.4, end: 15.5 },
      ].slice(0, n * 2) },
    ],
  });
  const quality = {
    final: { width: 1920, height: 1080, fps: 30, mbps: 15.8, lufs: -14.1, truePeak: -1.2, bytes: 84e6, duration: 42 },
    checks: [
      { ok: true, label: 'resolution', value: '1920×1080', want: '1920×1080' },
      { ok: true, label: 'loudness', value: '-14.1 LUFS', want: '-14 ±1' },
      { ok: true, label: 'true peak', value: '-1.2 dBTP', want: '≤ -1' },
      { warn: true, label: 'dead air', value: '0.9 s', want: '< 0.6 s' },
      { ok: true, label: 'black frames', value: 'none', want: 'none' },
    ],
    passes: [
      { pass: 1, verdict: 'fix', lufs: -16.2, faults: ['caption overlaps the subject at 0:12', 'hook pacing slow in first 2 s'] },
      { pass: 2, verdict: 'clean', lufs: -14.3, faults: [] },
    ],
  };
  const youtube = {
    thumbnail: 'thumb.jpg',
    thumbnail_text: 'MANALI IN 40s',
    title: 'the road to manali — a 40 second trip reel',
    description: 'we left before sunrise and drove up to the snow line.\n\n0:00 the road\n0:12 river walk\n0:24 snow on the pass\n\nshot on a phone, edited with kimo.',
    chapters: [{ t: 0 }, { t: 12 }, { t: 24 }],
  };
  const files = (name, kind = 'video', d = 128) => [{ path: `C:/Users/naman/Videos/${name}`, kind, duration: d, width: 1920, height: 1080, bytes: 412e6 }];
  const library = [
    { id: 'p1', name: 'manali trip reel', status: 'running', started: now - 74_000, preset: 'youtube', style: 'punchy', mode: 'ai', note: 'a punchy 40 second reel of the manali trip, strong hook, word captions, clean grade', files: files('manali_drive.mp4', 'video', 318), timeline: tl(2), projectFile: 'x' },
    { id: 'p2', name: 'podcast ep 12 cut', status: 'done', took: 252_000, updated: 3, preset: 'youtube4k', style: 'clean', mode: 'ai', note: 'cut the dead air, chapters', files: files('ep12.mp4', 'video', 3120), output: 'clip.mp4', timeline: tl(3), projectFile: 'x', quality, youtube },
    { id: 'p3', name: 'gym vlog', status: 'queued', preset: 'shorts', style: 'auto', mode: 'ai', files: files('gym.mp4') },
    { id: 'p4', name: 'drone b-roll', status: 'done', took: 41_000, preset: 'shorts', mode: 'sam', sam: { effect: 'text_behind', prompt: 'person' }, files: files('drone.mp4'), output: 'master.mp4', timeline: tl(1), projectFile: 'x' },
    { id: 'p5', name: 'lecture captions', status: 'failed', error: 'ffmpeg exited with code 1: invalid data found when processing input', preset: 'youtube', mode: 'captions', files: files('lecture.mkv') },
  ];
  const mockEdl = (timeline) => {
    const e={edl_version:1,canvas:{w:1920,h:1080,fps:30,bg:'#000000'},sources:[],video:[],audio:[],overlays:[],master:{lufs:-14,true_peak:-1}};
    for(const track of timeline.tracks_bottom_to_top){const video={track:track.track_id,clips:[]},audio={track:track.track_id,clips:[]};for(const c of track.clips){
      if(c.src.startsWith('text:'))e.overlays.push({id:c.id,track:track.track_id,kind:'caption_word_group',at:c.start,dur:c.end-c.start,props:{text:c.src.replace(/^text:\s*/, '')}});
      else{const id='src-'+c.id,isAudio=/\.(mp3|wav)$/i.test(c.src);e.sources.push({id,path:c.src,w:isAudio?0:1920,h:isAudio?0:1080,fps:30,duration:3600});(isAudio?audio:video).clips.push({id:c.id,src:id,in:c.in??0,out:(c.in??0)+c.end-c.start,at:c.start,speed:1});}
    }if(video.clips.length)e.video.push(video);if(audio.clips.length)e.audio.push(audio);}
    return e;
  };
  for(const p of library)if(p.timeline)p.edl=mockEdl(p.timeline);
  const ops = [
    ['probe', 'probe the footage', '318 s, 4K 30p, stereo'],
    ['transcribe', 'transcribe speech with whisper', 'offline, word timings'],
    ['find_hook', 'find the strongest 3 s hook', 'the sunrise line lands best'],
    ['cut', 'cut the drive to the best 11.5 s', null],
    ['add_clip', 'add river_walk at 0:11.5', null],
    ['captions', 'word captions · bold, 2 words a line', null],
    ['grade', 'grading colour on river_walk', 'warmer, lift the shadows'],
  ];
  const log = {
    p1: [
      { t: 'run', mode: 'edit', text: 'a punchy 40 second reel of the manali trip, strong hook, word captions, clean grade' },
      { t: 'think', text: 'long drive footage with one great sunrise moment. i will open on it, then cut the drive down to the best beats.' },
      { kind: 'script', text: '1. hook: sunrise over the pass (0–3 s)\n2. the road: best 8 s of the drive\n3. river walk, slow push-in\n4. snow on the pass, music drop\n5. word captions throughout, punchy style\n6. grade: warm, lifted shadows, -14 LUFS master' },
      ...ops.slice(0, 6).flatMap(([tool, title, why], i) => [
        { t: 'op', phase: 'start', id: `o${i}`, tool, title, why },
        { t: 'op', id: `o${i}`, ok: true, ms: [820, 14200, 3100, 640, 410, 2200][i] },
      ]),
      { t: 'frame', image: M + 'y2.jpg', time: 2.1 }, { t: 'frame', image: M + 'y3.jpg', time: 6.4 }, { t: 'frame', image: M + 'y5.jpg', time: 13 },
      { t: 'think', text: 'the caption at 0:12 sits on the subject’s face. moving it to the lower third and grading the river walk warmer.' },
      { t: 'op', phase: 'start', id: 'o6', tool: 'grade', title: 'grading colour on river_walk', why: 'warmer, lift the shadows' },
    ],
    p2: [
      { t: 'run', mode: 'edit', text: 'cut the dead air, chapters' },
      { t: 'think', text: 'a 52 minute conversation. removing silences over 0.6 s and building chapters from topic changes.' },
      { kind: 'script', text: '1. remove dead air\n2. chapters at topic changes\n3. clean captions\n4. 4K master' },
      ...ops.slice(0, 5).flatMap(([tool, title, why], i) => [{ t: 'op', phase: 'start', id: `q${i}`, tool, title, why }, { t: 'op', id: `q${i}`, ok: true, ms: 900 + i * 700 }]),
      { t: 'op', phase: 'start', id: 'qx', tool: 'qa', title: 'check 18 frames', why: null }, { t: 'op', id: 'qx', ok: false, ms: 5200, error: 'caption overlaps the subject at 0:12' },
      { t: 'op', phase: 'start', id: 'qy', tool: 'fix', title: 'move caption to lower third', why: null }, { t: 'op', id: 'qy', ok: true, ms: 380 },
      { t: 'say', text: 'done. 52:00 → 41:12 with 9 chapters. the youtube pack is ready.' },
      { t: 'run', mode: 'followup', text: 'make the captions a bit bigger' },
      { t: 'op', phase: 'start', id: 'qz', tool: 'captions', title: 'caption size 64 → 76 px', why: null }, { t: 'op', id: 'qz', ok: true, ms: 1900 },
      { t: 'say', text: 'captions are bigger now. re-rendered the master.' },
    ],
  };
  window.kimo = {
    mediaUrl: (p) => M + String(p).split(/[\\/]/).pop().replace(/\.mp4$/, '.webm') + '?',
    status: async () => ({ version: '0.3.1', kimo: true, ffmpeg: '7.1-full_build-www.gyan.dev', whisper: true, model: window.__noModel ? false : true, gpu: 'h264_nvenc', presets, styles }),
    library: async () => library.map((p) => ({ ...p })),
    edl: async (id) => structuredClone(library.find(p=>p.id===id)?.edl??null),
    log: async (id) => log[id] ?? [],
    pathsOf: () => [],
    expand: async () => [],
    pick: async () => [
      { path: 'C:/Users/naman/Videos/manali_drive.mp4', kind: 'video', duration: 318, width: 3840, height: 2160, bytes: 2.4e9 },
      { path: 'C:/Users/naman/Videos/river_walk.mp4', kind: 'video', duration: 46, width: 1920, height: 1080, bytes: 210e6 },
      { path: 'C:/Users/naman/Music/lofi_track.mp3', kind: 'audio', duration: 124, bytes: 4.1e6 },
    ],
    create: async (o) => [{ ...library[0], id: 'new' + Date.now(), status: 'queued', files: o.files }],
    rerun: async () => null, stop: async () => {}, remove: async () => {}, save: async () => 'C:/Users/naman/Videos/kimo/manali.mp4',
    followup: async () => null, apply: async ({id,ops}) => {
      const p=library.find(p=>p.id===id);if(!p?.edl)return null;
      for(const op of ops){const e=p.edl,c=e.video.flatMap(t=>t.clips).find(c=>c.id===op.args.clip_id)??e.overlays.find(c=>c.id===op.args.clip_id);if(!c)continue;
        if(op.tool==='move_clip')c.at=op.args.start;
        if(op.tool==='trim_clip'){if(c.props)c.dur=op.args.duration;else{c.in=op.args.in_point??c.in;c.out=c.in+op.args.duration*c.speed;}}
        if(op.tool==='edit_caption')c.props.text=op.args.text;
        if(op.tool==='delete_clip'){for(const t of e.video)t.clips=t.clips.filter(x=>x!==c);e.overlays=e.overlays.filter(x=>x!==c);}
      }
      emit('project',structuredClone(p));return structuredClone(p);
    }, saveThumb: async () => 'thumb.jpg', copy: async () => {}, reveal: async () => {},
    downloadModel: () => new Promise((r) => { let f = 0; const t = setInterval(() => { f += 0.1; emit('progress', { id: 'model', label: 'downloading the captions model', f }); if (f >= 1) (clearInterval(t), r()); }, 300); }),
    openLog: async () => {},
    samPreview: async () => ({ image: M + 'f3.jpg', objects: 2 }),
    pickImage: async () => 'C:/Users/naman/Pictures/bg.jpg',
    installUpdate: async () => {},
    onProject: on('project'), onEvent: on('event'), onProgress: on('progress'), onUpdate: on('update'),
  };
  // simulate the live edit of p1
  window.__mock = {
    emit,
    live() {
      emit('event', { id: 'p1', t: 'preview', image: M + 'y4.jpg', after: 'grade', time: 12.4 });
      emit('event', { id: 'p1', t: 'progress', label: 'rendering preview', f: 0.62, eta: 48, estimated: true });
        emit('event', { id: 'p1', t: 'timeline', timeline: { edl:mockEdl(tl(3)) } });
      emit('event', { id: 'p1', t: 'op', opId: 'o6', ok: true, ms: 2600 });
      emit('event', { id: 'p1', t: 'op', phase: 'start', opId: 'o7', tool: 'render', title: 'render the 1080p preview', why: 'NVENC, 2 passes' });
    },
    update() { emit('update', { version: '0.3.2' }); },
  };
})();
