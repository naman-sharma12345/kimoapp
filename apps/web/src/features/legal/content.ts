import type { LegalContent, LegalContentMap } from './types/legal-page';

export const PRIVACY_CONTENT: LegalContent = {
  title: 'privacy',
  updated: 'last updated oct 28, 2026',
  shortVersion: [
    'we keep only what an account needs: your sign-in id, email, name and avatar, your projects, your preferences and daily usage counts.',
    "kimo doesn't store uploads or rendered videos yet. we'll update this page before that changes.",
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
        'we also keep the projects you create (title, prompt, aspect and status), your editor preferences, and daily counts of videos and render minutes used to enforce the free limits.',
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
        "your data is stored in a cloudflare d1 database and served by cloudflare workers, so it may be processed on cloudflare's servers outside india. github and google handle the sign-in step under their own privacy policies. we don't use cloudflare r2 or any other file storage yet.",
      ],
    },
    {
      id: 'files-and-ai',
      heading: 'files and ai',
      paragraphs: [
        "video editing isn't live on our servers yet, so kimo doesn't receive or store your uploads, and no prompts or files are sent to ai models. when editing launches we will update this page first and say exactly which models process your files and for how long they are kept.",
      ],
    },
    {
      id: 'how-long-we-keep-things',
      heading: 'how long we keep things',
      paragraphs: [
        'sign-in sessions end after 30 days, or when you sign out. we store only a one-way hash of the session token, never the token itself.',
        'a sign-in attempt that is not finished expires after 10 minutes.',
        'projects stay until you delete them. a deleted project can be restored for 30 days, then it is removed for good.',
        'your account, preferences and usage counts stay until you delete your account.',
      ],
    },
    {
      id: 'cookies',
      heading: 'cookies',
      paragraphs: [
        "kimo uses only essential cookies, so there is no cookie banner: kimo_session keeps you signed in (http-only, secure, 30 days) and kimo_oauth_state protects the sign-in step from forgery (10 minutes). the app also saves a few settings in your browser's local storage on your own device.",
        'there are no ad trackers, no marketing pixels, no cross-site cookies and no analytics running on kimo. if we ever add product analytics, they will stay off unless you opt in.',
      ],
    },
    {
      id: 'your-rights',
      heading: 'your rights',
      paragraphs: [
        'you can access and download everything we keep about you with "export my data" on /account: your profile, linked sign-ins, active sessions, projects (including the bin), preferences and usage.',
        'you can correct your name, email or avatar by updating them on github or google and signing in again, or by writing to us.',
        'you can delete your account from /account. that removes your profile, linked sign-ins, sessions, projects, preferences and usage counts from our database straight away.',
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
  updated: 'last updated oct 28, 2026',
  shortVersion: [
    'you own what you make in kimo.',
    'kimo is free, within daily fair use limits, and provided as is.',
    "video editing isn't live on our servers yet; accounts, projects and preferences are.",
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
        "today the hosted service keeps your account, projects and preferences. uploading and rendering video on our servers isn't available yet; we will update these terms and the privacy page before it is.",
      ],
    },
    {
      id: 'your-content-stays-yours',
      heading: 'your content stays yours',
      paragraphs: [
        'you keep all rights to the prompts, titles and any footage, audio or images you bring into kimo, and to the videos you make.',
        'you give us a limited permission to store and process that content only to run kimo for you.',
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
