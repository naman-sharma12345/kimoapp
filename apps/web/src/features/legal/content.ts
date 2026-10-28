import type { LegalContent, LegalContentMap } from './types/legal-page';

export const PRIVACY_CONTENT: LegalContent = {
  title: 'privacy',
  updated: 'last updated oct 28, 2026',
  shortVersion: [
    'your uploaded files are deleted after 24 hours.',
    'finished videos are kept for 30 days, then deleted.',
    "your prompts and files are processed by meta model api models, which may use them to improve their models. don't upload anything private.",
    'we never sell your data.',
  ],
  sections: [
    {
      id: 'what-we-collect',
      heading: 'what we collect',
      paragraphs: [
        'when you sign in with google, we receive your name, email address, and profile avatar so we can create your workspace and keep your projects tied to you.',
        'while you edit in kimo, we store the prompts you type, the raw video and audio files you upload, and the timeline edits made by the ai or by your own hand.',
        'we also record basic usage counts, such as render minutes and daily prompt runs, to keep the service reliable and enforce fair use limits.',
      ],
    },
    {
      id: 'how-your-files-are-processed',
      heading: 'how your files are processed',
      paragraphs: [
        'when you ask kimo to build or change an edit, specialized models work together on your timeline. muse spark plans the edit, muse voice transcribe makes captions, sam 3.1 finds subjects for masks, web image search finds images with their source shown, and the kimo engine renders the final 1080p mp4.',
        "because these requests run through meta model api models, those providers may process your prompts and media according to their terms and may use them to improve their models. please don't upload anything private or confidential.",
      ],
    },
    {
      id: 'how-long-we-keep-things',
      heading: 'how long we keep things',
      paragraphs: [
        'raw source uploads stay on our storage while you work and are permanently deleted after 24 hours.',
        'finished rendered videos are kept for 30 days so you have time to download or share them, and are deleted automatically after that window.',
        'your basic account data stays on file until you delete your account.',
      ],
    },
    {
      id: 'who-can-see-your-videos',
      heading: 'who can see your videos',
      paragraphs: [
        'your projects and renders are private to your account by default. only you can view or edit them inside kimo.',
        'if you copy a share link for a finished video, anyone with that link can watch or download that render until it expires.',
      ],
    },
    {
      id: 'analytics',
      heading: 'analytics',
      paragraphs: [
        'we use privacy-friendly page and performance metrics to understand whether the editor is fast and where renders fail.',
        'there are no ad trackers, no third-party marketing pixels, and no cross-site cookies anywhere on kimo.',
      ],
    },
    {
      id: 'your-choices',
      heading: 'your choices',
      paragraphs: [
        'you can export a copy of your account data or permanently delete your account and all remaining renders at any time from /account.',
        'when you delete your account, your profile, project history, and stored files are queued for immediate removal.',
      ],
    },
    {
      id: 'contact',
      heading: 'contact',
      paragraphs: [
        'if you have a question about how kimo handles your files or privacy, write to us at hello@getkimo.tech.',
      ],
    },
  ],
};

export const TERMS_CONTENT: LegalContent = {
  title: 'terms',
  updated: 'last updated oct 28, 2026',
  shortVersion: [
    'you own the videos you make in kimo.',
    'only upload footage, music, and images you have the right to use.',
    'kimo is free to use, no credit card needed, within daily fair use limits and is provided as is.',
    'the core kimo editing engine is open source on github.',
  ],
  sections: [
    {
      id: 'using-kimo',
      heading: 'using kimo',
      paragraphs: [
        'kimo is an ai video editor on the web at app.getkimo.tech. by signing in or running an edit, you agree to follow these terms and use the editor responsibly.',
        'you must be old enough to form a binding agreement in your country to create an account.',
      ],
    },
    {
      id: 'your-content-stays-yours',
      heading: 'your content stays yours',
      paragraphs: [
        'you keep all ownership and rights to the footage, audio, images, and prompts you bring into kimo, as well as the finished videos you export.',
        'you give us a limited permission only to host, process, and render your files so the editor can work for you.',
      ],
    },
    {
      id: 'what-you-cant-upload',
      heading: "what you can't upload",
      paragraphs: [
        "do not use kimo to upload or generate illegal content, content you don't have rights to use, or private data about others without their clear consent.",
        'we may remove projects or suspend accounts that abuse the service, harm others, or violate copyright.',
      ],
    },
    {
      id: 'fair-use-limits',
      heading: 'fair use limits',
      paragraphs: [
        'to keep kimo responsive for everyone, accounts have free daily limits on prompts, uploads, and 1080p renders to stop bots and automated scraping.',
        'please do not script, resell, or bypass these limits without talking to us first.',
      ],
    },
    {
      id: 'the-service-is-provided-as-is',
      heading: 'the service is provided as is',
      paragraphs: [
        'kimo is built with care, but ai edits and cloud renders can occasionally make mistakes, drop frames, or go offline. the service is provided as is, without warranties of uninterrupted availability.',
        'always keep your own backups of important source footage before uploading.',
      ],
    },
    {
      id: 'open-source',
      heading: 'open source',
      paragraphs: [
        'the kimo engine is open source on github at github.com/naman-sharma12345/kimo. you are welcome to read the code, self-host the engine, or contribute under the repository license.',
        'these terms cover the hosted web app at app.getkimo.tech.',
      ],
    },
    {
      id: 'changes',
      heading: 'changes',
      paragraphs: [
        'when we update these terms or our privacy practices, we will update the date at the top of this page. for major changes, we will let you know inside the app or by email.',
      ],
    },
    {
      id: 'contact',
      heading: 'contact',
      paragraphs: [
        'questions about these terms or open-source licensing can be sent any time to hello@getkimo.tech.',
      ],
    },
  ],
};

export const LEGAL_CONTENT_MAP: LegalContentMap = {
  privacy: PRIVACY_CONTENT,
  terms: TERMS_CONTENT,
};
