export type SignInState =
  | 'idle'
  | 'redirecting'
  | 'returning'
  | 'error'
  | 'limit-reached'
  | 'already-signed-in';

export type SignInReason = 'limit' | 'expired' | null;

export type SignInErrorKind = 'popup_closed' | 'network' | 'not_allowed';

export interface SignInError {
  kind: SignInErrorKind;
}

export interface SignInUser {
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface SignInPageProps {
  onContinueWithGoogle: () => Promise<void>;
  onSkip: () => void;
  onSuccess: (user: SignInUser) => void;
  reason?: SignInReason;
  initialState?: SignInState;
  user?: SignInUser | null;
  error?: SignInError | null;
  onUseDifferentAccount?: () => void;
}

export type ViewerScene = 'empty' | 'dawn' | 'road' | 'title';

export interface AgentStep {
  id: string;
  text: string;
  tool: string;
  statusIcon: 'pulse' | 'check';
}

export interface StageFrameState {
  loopTime: number;
  playheadSec: number;
  timecode: string;
  scene: ViewerScene;
  sceneProgress: number;
  isWarmGraded: boolean;
  showGradeTag: boolean;
  showCaptions: boolean;
  activeWordCount: number;
  v1DawnVisible: boolean;
  v1RoadVisible: boolean;
  v1TitleVisible: boolean;
  isRoadTrimmed: boolean;
  showTrimBracket: boolean;
  t1Visible: boolean;
  a1Visible: boolean;
  a2Visible: boolean;
  fxBarVisible: boolean;
  stageFadingOut: boolean;
  agentStep: AgentStep;
}
