export type DefaultAspect = 'auto' | '16:9' | '9:16' | '1:1';

export type AccountPageState =
  | 'loaded'
  | 'loading'
  | 'limit-reached'
  | 'save-error'
  | 'signed-out'
  | 'deleting';

export interface AccountUser {
  name: string;
  email: string;
  avatarUrl?: string;
  /** The provider this session signed in with. */
  provider?: 'github' | 'google';
}

export interface AccountUsage {
  videosToday: number;
  videosLimit: number;
  renderMinutes: number;
  renderMinutesLimit: number;
  resetsAt: string;
}

export interface AccountStorage {
  bytesUsed: number;
}

export interface AccountPreferences {
  defaultAspect: DefaultAspect;
  captionsDefault: boolean;
  webImages: boolean;
  reduceMotion: boolean;
  soundOnApproval: boolean;
}

export type PreferenceKey = keyof AccountPreferences;

export interface AccountPageProps {
  user: AccountUser | null;
  usage: AccountUsage;
  storage: AccountStorage;
  preferences: AccountPreferences;
  onUpdatePreference: <K extends PreferenceKey>(
    key: K,
    value: AccountPreferences[K],
  ) => Promise<void>;
  onSignOut: () => void | Promise<void>;
  onExportData: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onDeleted: () => void;
  onContinueWithGoogle?: () => Promise<void>;
  state: AccountPageState;
}
