import type { LegalContent, LegalContentMap } from './types/legal-page';

export const PRIVACY_CONTENT: LegalContent = {
  title: 'privacy',
  updated: 'last updated oct 29, 2026',
  shortVersion: [
    'we keep only what an account needs: your sign-in id, email, name and avatar, your projects and their edit timelines, your preferences and daily usage counts.',
    "your clips stay on your device: they live only in the open browser tab while you edit, are never uploaded to kimo's storage or saved on our servers, and are gone when you close or refresh the tab. exports are made in your browser and downloaded straight to you.",
    "only when you ask the ai to edit, kimo sends meta your instruction and the timeline, and for each clip once a few small still frames and the clip's sound so the ai can see and hear it (passed straight through, never stored by kimo). with the model kimo uses today, meta may train on those requests, including the frames and sound.",
    'if you bring your own ai key, it stays in that tab only: we forward it to the provider you picked for that one request and never store it.',
    'one essential cookie keeps you signed in. no ads, no trackers, no analytics cookies.',
    'export or delete everything from /account at any time. we never sell your data.',
  ],
  sections: [
    {
      id: 'who-we-are',
      heading: 'who we are',
      paragraphs: [
        "kimo (app.getkimo.tech and api.getkimo.tech) is run by naman sharma in india, who decides how your data is used. under india's digital personal data protection act, 2023 that makes us the data fiduciary, and under the eu and uk gdpr the controller.",
      ],
    },
    {
      id: 'what-we-collect',
      heading: 'what we collect',
      paragraphs: [
        "when you sign in with github or google we receive and keep only four things: the provider's account id, your email address if the provider has verified it, your display name, and your avatar link. github is asked only for your verified email (scope user:email); google only for openid, email and profile. we never see your password.",
        'if you sign in with github and google using the same verified email, both sign-ins open the same kimo account.',
        "we also keep the projects you create (title, prompt, aspect and status) and each project's edit timeline: where clips sit, trims, text, effects and markers, plus each clip's file name, type, size, length and dimensions so a reopened project can ask you to add the same clips again. we keep your editor preferences and daily counts of exports, export minutes and ai edits used to enforce the free limits.",
        'to stop abuse we count sign-in and write requests per visitor for 10 minutes. the ip address is turned into a one-way hash before it is counted and the counters are deleted within an hour.',
      ],
    },
    {
      id: 'why-we-use-it',
      heading: 'why we use it',
      paragraphs: [
        'we use this data only to run your account: signing you in, showing your projects and settings, enforcing fair use limits and keeping the service secure. you give consent when you choose to sign in, and you can withdraw it at any time by deleting your account. for gdpr, the lawful bases are performing our agreement with you and our legitimate interest in keeping kimo secure.',
      ],
    },
    {
      id: 'where-it-is-stored',
      heading: 'where it is stored',
      paragraphs: [
        "your account data is stored in a cloudflare d1 database and served by cloudflare workers, with cloudflare durable objects passing live editing updates between your open tabs, so it may be processed on cloudflare's servers outside india. github and google handle the sign-in step under their own privacy policies. we don't use cloudflare r2 or any other file storage, and no video, audio or image file is ever stored by kimo.",
      ],
    },
    {
      id: 'files-and-ai',
      heading: 'your video and ai',
      paragraphs: [
        "your video file never leaves your device. when you add clips, the browser keeps them in the memory of that one open tab so you can preview and edit. they are not uploaded to kimo's storage and not saved to your device's storage; the only thing that leaves the tab is the small look-and-listen sample described below, and only when you use ai editing. when you close or refresh the tab they are gone, and reopening the project asks you to add the same files again.",
        'exports are recorded in your browser and downloaded straight to you. kimo does not receive, host or keep a copy of the finished video.',
        "ai editing is optional. only when you send an edit request, kimo sends meta platforms (through the meta model api) your written instruction and the project timeline: clip names, kinds, lengths, positions, trims, any on-screen text and marker labels. the first time you ask the ai to edit a clip, kimo also sends a look-and-listen sample of it: up to 12 small still frames (about 512 pixels wide) and the clip's sound as low-quality mono audio (up to 5 minutes). these pass through kimo's server straight to meta and are never written to kimo's database, logs or any storage. meta returns a short text summary, scene notes and a timed transcript, which kimo keeps with your project (as text) so later edits can use them; delete the project or your account to remove them. meta processes all of this to suggest edits. kimo currently uses meta's muse spark contributor model, and under meta's terms for that model meta may use these requests (your instruction, the timeline details above, the frames and sound, and the ai's answer) to train and improve its models; meta keeps request data under its own policies. never put anything private in an edit note or a clip name, and don't use ai editing on footage you don't want meta to see or hear. if kimo moves to a model meta does not train on, this page will say so. kimo does not keep the ai's raw answer, only the timeline changes you see.",
        "ai suggestions are checked against kimo's edit format before anything changes, and anything invalid is rejected without touching your project.",
        "you can bring your own ai key instead (openai, anthropic, google gemini, groq, openrouter, meta or another openai-compatible service). your key is kept only in the memory of the open tab, never in your device's storage or cookies, and a refresh clears it. it travels over https with each ai request to kimo's server, which forwards it to the provider you chose for that one request and then drops it: kimo never stores your key in its database, logs or error messages. with your own key, that request (your instruction and the timeline; with a meta key also the look-and-listen sample) goes to that provider, and the provider's own terms and privacy policy apply to it. your provider and model choice, but never the key, may be remembered in your browser.",
        "kimo for windows (the desktop app) runs the kimo engine, ffmpeg and whisper on your own pc: your videos, audio, captions and renders stay on your computer and are never uploaded. captions-only mode works fully offline. when you use ai edit in the app, it sends kimo's server only your written instruction, the file paths and lengths of your clips, the engine's text results and, for each render check, three small jpeg frames (about 640 pixels) and a text audio-level report; kimo's server forwards them straight to meta under the same terms as above and does not store them. the app keeps its library (project names, notes, edit history and op logs) on your pc only.",
      ],
    },
    {
      id: 'how-long-we-keep-things',
      heading: 'how long we keep things',
      paragraphs: [
        'sign-in sessions end after 30 days, or when you sign out. we store only a one-way hash of the session token, never the token itself.',
        'a sign-in attempt that is not finished expires after 10 minutes.',
        'projects and their timelines stay until you delete them. a deleted project can be restored for 30 days, then it is removed for good, along with its timeline.',
        'clips you add are kept only in the open tab and are gone when it closes or refreshes. finished videos are never kept by kimo.',
        'your account, preferences and usage counts stay until you delete your account.',
      ],
    },
    {
      id: 'cookies',
      heading: 'cookies',
      paragraphs: [
        "kimo uses only essential cookies, so there is no cookie banner: kimo_session keeps you signed in (http-only, secure, 30 days) and kimo_oauth_state protects the sign-in step from forgery (10 minutes). the app also saves a few settings in your browser's local storage on your own device, and briefly keeps edits that haven't reached your account yet (timeline changes only, never media) so they are not lost if you go offline.",
        'there are no ad trackers, no marketing pixels, no cross-site cookies and no analytics running on kimo. if we ever add product analytics, they will stay off unless you opt in.',
      ],
    },
    {
      id: 'your-rights',
      heading: 'your rights',
      paragraphs: [
        'you can access and download everything we keep about you with "export my data" on /account: your profile, linked sign-ins, active sessions, projects (including the bin), preferences and usage.',
        'you can correct your name, email or avatar by updating them on github or google and signing in again, or by writing to us.',
        'you can delete your account from /account. that removes your profile, linked sign-ins, sessions, projects, timelines, clip details, preferences and usage counts from our database straight away.',
        'you can also withdraw consent, ask questions about how your data is processed, or name someone to act for you if you cannot. under the gdpr you can object, restrict processing and complain to your local data protection authority. in india you can complain to the data protection board of india after contacting us.',
      ],
    },
    {
      id: 'security',
      heading: 'security',
      paragraphs: [
        'all traffic uses https. sign-in uses oauth with state checks and pkce, sessions are stored hashed, and every database query is parameterised. if we learn of a breach that affects your data we will tell you and the authorities as the law requires. report security issues to the address in /.well-known/security.txt.',
      ],
    },
    {
      id: 'children',
      heading: 'children',
      paragraphs: [
        "kimo is not for children. you must be 18 or older, or have a parent or guardian's permission where the law allows, to create an account.",
      ],
    },
    {
      id: 'contact',
      heading: 'contact and grievances',
      paragraphs: [
        'for any privacy question, request or complaint, write to our grievance contact, naman sharma, at namanthesharma123@gmail.com (or hello@getkimo.tech). we reply within 30 days.',
      ],
    },
  ],
};

export const TERMS_CONTENT: LegalContent = {
  title: 'terms',
  updated: 'last updated oct 29, 2026',
  shortVersion: [
    'you own what you make in kimo.',
    'kimo is free, within daily fair use limits, and provided as is.',
    'your video file stays on your device: clips live only in the open tab and exports download straight to you. ai editing sends meta a few small frames and the sound of each clip, which meta may train on.',
    'ai editing is optional and sends meta only your instruction and the timeline, never your video.',
    "you can use your own ai key; it is forwarded to the provider you pick for each request only, never stored, and that provider's terms apply.",
    'the core kimo editing engine is open source on github.',
  ],
  sections: [
    {
      id: 'using-kimo',
      heading: 'using kimo',
      paragraphs: [
        'kimo is an ai video editor on the web at app.getkimo.tech, run by naman sharma in india. by signing in you agree to these terms and to use kimo responsibly.',
        "you must be 18 or older, or have a parent or guardian's permission where the law allows, to create an account. you sign in with github or google and are responsible for keeping that account secure.",
      ],
    },
    {
      id: 'what-is-live-today',
      heading: "what's live today",
      paragraphs: [
        'the hosted service keeps your account, projects, edit timelines and preferences. you edit, preview and export video in your own browser: clips stay in the open tab and are never uploaded or stored by kimo, so keep your original files and export before you close or refresh the tab. we will update these terms and the privacy page before kimo ever stores video.',
        "optional ai editing sends your written instruction, the project timeline and, once per clip, a few small frames and the clip's sound (never the video file, never stored by kimo) to meta's model api and applies the edits it suggests after checking them. kimo currently uses meta's contributor model, whose terms let meta use those requests, frames, sound and answers to train its models, so keep private details out of notes and clip names and don't use ai editing on footage you can't share with meta. ai suggestions can be wrong; review your cut before you export.",
        "if you add your own ai key, kimo forwards it with your instruction and timeline to the provider you chose for that request only and never stores it. you are responsible for that key, its use and any charges from your provider, and the provider's own terms apply to those requests.",
      ],
    },
    {
      id: 'your-content-stays-yours',
      heading: 'your content stays yours',
      paragraphs: [
        'you keep all rights to the prompts, titles and any footage, audio or images you bring into kimo, and to the videos you make.',
        'you give us a limited permission to store and process your project details and timelines, and to send edit requests to our ai provider when you ask, only to run kimo for you. your footage, audio and images stay on your device.',
      ],
    },
    {
      id: 'acceptable-use',
      heading: 'acceptable use',
      paragraphs: [
        "don't use kimo for illegal content, content you don't have the rights to, or private data about others without their consent. don't try to break, overload or get around the security or limits of the service.",
        'we may remove projects or suspend accounts that abuse the service, harm others or infringe copyright.',
      ],
    },
    {
      id: 'fair-use-limits',
      heading: 'fair use limits',
      paragraphs: [
        "accounts have free daily limits, and sign-in and write requests are rate limited, to stop bots and keep kimo fast for everyone. please don't script, resell or bypass these limits without talking to us first.",
      ],
    },
    {
      id: 'the-service-is-provided-as-is',
      heading: 'the service is provided as is',
      paragraphs: [
        'kimo is built with care but is free and early. it is provided as is, without warranties of availability or fitness for a purpose, and to the extent the law allows we are not liable for indirect losses or lost data. keep your own copies of anything important.',
      ],
    },
    {
      id: 'ending-your-account',
      heading: 'ending your account',
      paragraphs: [
        'you can delete your account at any time from /account; that deletes your data as the privacy page describes. we may close accounts that break these terms.',
      ],
    },
    {
      id: 'open-source',
      heading: 'open source',
      paragraphs: [
        'the kimo engine is open source on github at github.com/naman-sharma12345/kimo. you are welcome to read the code, self-host the engine, or contribute under the repository license. these terms cover the hosted web app at app.getkimo.tech.',
      ],
    },
    {
      id: 'law-and-changes',
      heading: 'law and changes',
      paragraphs: [
        'these terms are governed by the laws of india. when we change them we update the date at the top; for major changes we will tell you in the app or by email.',
      ],
    },
    {
      id: 'contact',
      heading: 'contact',
      paragraphs: [
        'questions about these terms can be sent to namanthesharma123@gmail.com or hello@getkimo.tech.',
      ],
    },
  ],
};

export const LEGAL_CONTENT_MAP: LegalContentMap = {
  privacy: PRIVACY_CONTENT,
  terms: TERMS_CONTENT,
};
