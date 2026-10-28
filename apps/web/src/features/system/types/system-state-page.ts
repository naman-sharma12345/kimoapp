export type SystemStateVariant = 'not-found' | 'error' | 'offline';

export interface SystemErrorInfo {
  message: string;
  digest?: string;
}

export interface SystemStatePageProps {
  variant: SystemStateVariant;
  error?: SystemErrorInfo;
  reset?: () => void;
  onReport?: (error: SystemErrorInfo) => void;
  onReconnected?: () => void;
  /** Optional initial state for the error details disclosure (used by state switcher) */
  defaultDetailsOpen?: boolean;
  /** Optional navigation callback for SPA routing integration */
  onNavigate?: (href: string) => void;
}

export interface SystemBannerProps {
  /** Whether the user is currently offline (defaults to true when mounted in offline mode) */
  isOffline?: boolean;
  /** Fired 800ms after online reconnection completes */
  onReconnected?: () => void;
}

export type SwitcherStateId =
  'not-found' | 'error' | 'error-details' | 'offline' | 'banner';

export interface SwitcherStateOption {
  id: SwitcherStateId;
  label: string;
}
