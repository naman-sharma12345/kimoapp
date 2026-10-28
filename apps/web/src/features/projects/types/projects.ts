export type ProjectStatus =
  'editing' | 'awaiting_review' | 'rendering' | 'done' | 'failed' | 'draft';

export type ProjectAspect = '16:9' | '9:16' | '1:1';

export type Project = {
  id: string;
  sessionId: string;
  videoId?: string;
  title: string; // ai-written, user-editable, lowercase
  prompt: string; // the user's original prompt
  status: ProjectStatus;
  aspect: ProjectAspect;
  durationSec: number;
  posterUrl?: string; // still frame
  previewUrl?: string; // short muted mp4 loop for hover preview
  renderProgress?: number; // 0..1 when rendering
  agentActivity?: string; // e.g. "adding captions" when editing
  clipCount: number;
  trackCount: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  expiresAt?: string; // final videos are kept 30 days
};

export type ProjectsPageState =
  | 'loaded'
  | 'loading'
  | 'empty'
  | 'no_results'
  | 'error'
  | 'signed_out'
  | 'many';

export type FilterSegment = 'all' | 'in_progress' | 'finished';

export type SortOption = 'recent' | 'oldest' | 'longest' | 'a_to_z';

export type ListSortColumn =
  'title' | 'status' | 'aspect' | 'duration' | 'edited';

export type ViewMode = 'grid' | 'list';

export type UserProfile = {
  name: string;
  email: string;
  avatarInitials: string;
};

export type ToastItem = {
  id: string;
  message: string;
  undoProjectId?: string;
  createdAt: number;
};

export type ProjectsPageProps = {
  projects: Project[] | null;
  state: ProjectsPageState;
  user: UserProfile | null;
  onOpenStudio: (sessionId: string) => void;
  onOpenRender: (sessionId: string) => void;
  onOpenVideo: (videoId: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<Project>;
  onDelete: (id: string) => Promise<void>;
  onUndoDelete: (id: string) => Promise<void>;
  onDownload: (videoId: string) => void;
  onCopyLink: (videoId: string) => void;
  onStartWithFiles: (files: File[]) => void;
  onRetry: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
};
