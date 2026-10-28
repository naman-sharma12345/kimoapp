'use client';
import Link from 'next/link';
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  Paperclip,
  ArrowUp,
  Film,
  Mic,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import { prompts, FILE_ACCEPT } from '@/lib/landing-files';
type Props = {
  onExit: (value: boolean) => void;
  exiting: boolean;
  initialPrompt?: string;
  initialFiles?: File[];
  initialAction?: string;
  initialDragging?: boolean;
  initialFocus?: boolean;
};
export function ComposerGate(props: Props) {
  const [Composer, setComposer] = useState<ComponentType<Props>>();
  const value = useRef('');
  const [hasText, setHasText] = useState(false);
  const files = useRef<File[]>([]);
  const action = useRef('');
  const requestedFocus = useRef<boolean | undefined>(undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const automatic = useRef(false);
  useEffect(() => {
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      automatic.current = true;
      textarea.current?.focus({ preventScroll: true });
      automatic.current = false;
    }
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [error, setError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const loaded = useRef<ComponentType<Props> | undefined>(undefined);
  const finishSetup = () => {
    if (!loaded.current || !action.current) return;
    const Component = loaded.current;
    startTransition(() => setComposer(() => Component));
  };
  const activate = () => {
    if (pending.current) {
      finishSetup();
      return;
    }
    pending.current = true;
    void import('./composer-experience')
      .then((m) => {
        loaded.current = m.ComposerExperience;
        finishSetup();
      })
      .catch(() => {
        pending.current = false;
        setError(true);
      });
  };
  const activateRef = useRef(activate);
  activateRef.current = activate;
  useEffect(() => {
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length || Composer) return;
      e.preventDefault();
      action.current = 'attach';
      files.current = Array.from(e.dataTransfer.files);
      activateRef.current();
    };
    const enter = (e: DragEvent) => {
      if (
        Array.from(e.dataTransfer?.types ?? []).includes('Files') &&
        !Composer
      ) {
        e.preventDefault();
        action.current = 'drag';
        setDragging(true);
        activateRef.current();
      }
    };
    const over = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes('Files'))
        e.preventDefault();
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('drop', drop);
    window.addEventListener('dragover', over);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('drop', drop);
      window.removeEventListener('dragover', over);
    };
  }, [Composer]);
  if (Composer)
    return (
      <Composer
        {...props}
        initialPrompt={value.current}
        initialFiles={files.current}
        initialAction={action.current}
        initialDragging={dragging}
        initialFocus={requestedFocus.current}
      />
    );
  return (
    <>
      <div className="landing-composer-wrap">
        <div className="landing-horizon" aria-hidden="true" />
        <div className="landing-composer">
          <div className="landing-composer-content">
            <div className="landing-text-wrap">
              <textarea
                className="ui-textarea"
                data-variant="composer"
                aria-label="describe your video"
                rows={1}
                onPaste={(e) => {
                  if (e.clipboardData.files.length) {
                    e.preventDefault();
                    files.current = Array.from(e.clipboardData.files);
                    action.current = 'attach';
                    activate();
                  }
                }}
                maxLength={4000}
                defaultValue=""
                placeholder={prompts[0]}
                ref={textarea}
                onFocus={() => {
                  if (!automatic.current) {
                    requestedFocus.current = true;
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    requestedFocus.current = false;
                    e.currentTarget.blur();
                  }
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    action.current = 'send';
                    activate();
                  }
                }}
                onChange={(e) => {
                  value.current = e.target.value;
                  if (Boolean(value.current) !== hasText)
                    setHasText(Boolean(value.current));
                }}
              />
              {
                <span
                  className="landing-placeholder"
                  data-visible
                  aria-hidden="true"
                >
                  {prompts[0]}
                </span>
              }
            </div>
            <div className="landing-controls">
              <button
                className="ui-button ui-button-ghost ui-size-md"
                aria-label="attach files"
                onClick={() => input.current?.click()}
              >
                <Paperclip size={16} aria-hidden="true" />
              </button>
              <input
                hidden
                ref={input}
                type="file"
                multiple
                accept={FILE_ACCEPT}
                onChange={(e) => {
                  action.current = 'attach';
                  files.current = Array.from(e.target.files ?? []);
                  activate();
                }}
              />
              <div className="landing-desktop-selectors">
                <button
                  className="ui-button ui-button-ghost ui-size-sm"
                  aria-label="aspect ratio: auto"
                  onClick={() => {
                    action.current = 'aspect';
                    activate();
                  }}
                >
                  auto
                </button>
                <button
                  className="ui-button ui-button-ghost ui-size-sm"
                  aria-label="video length: any length"
                  onClick={() => {
                    action.current = 'duration';
                    activate();
                  }}
                >
                  any length
                </button>
              </div>
              <div className="landing-mobile-settings">
                <button
                  className="ui-button ui-button-ghost ui-size-md"
                  aria-label="video settings"
                  onClick={() => {
                    action.current = 'settings';
                    activate();
                  }}
                >
                  <SlidersHorizontal size={16} aria-hidden="true" />
                </button>
              </div>
              <span className="landing-spacer" />
              <span className="landing-drop-hint">drop files anywhere</span>
              <span className="landing-send">
                <button
                  className="ui-button ui-button-primary ui-size-lg"
                  aria-label="start editing"
                  disabled={!hasText}
                  onClick={() => {
                    action.current = 'send';
                    activate();
                  }}
                >
                  <ArrowUp size={20} aria-hidden="true" />
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="landing-examples" aria-label="example prompts">
        {[Film, Mic, Sparkles].map((Icon, i) => (
          <button
            key={i}
            className={`landing-example landing-example-${i}`}
            onClick={() => {
              action.current = 'example';
              value.current = prompts[i] ?? '';
              if (textarea.current) textarea.current.value = value.current;
              setHasText(Boolean(value.current));
              activate();
            }}
          >
            <Icon size={14} aria-hidden="true" />
            {['trip montage', 'podcast to shorts', 'product teaser'][i]}
          </button>
        ))}
      </div>
      <p className="landing-privacy">
        by sending, you agree that your files are processed by ai models. don’t
        upload anything private. <a href="/privacy">privacy</a>
      </p>
      {error ? (
        <p role="alert">
          could not open the editor ·{' '}
          <button onClick={activate}>try again</button>
        </p>
      ) : null}
      {dragging ? (
        <div className="landing-drop-overlay" aria-hidden="true">
          <div className="landing-drop-target">
            <p>drop to add to your video</p>
            <span>video, images, audio, pdf · up to 2 GB each</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
export function SignInGate() {
  return (
    <Link className="ui-button ui-button-secondary ui-size-sm" href="/signin">
      sign in
    </Link>
  );
}

export function ComposerIsland() {
  const [exiting, setExiting] = useState(false);
  return (
    <ComposerGate
      exiting={exiting}
      onExit={(next) => {
        setExiting(next);
        const main = document.getElementById('main');
        if (!main) return;
        if (next) main.dataset.exiting = 'true';
        else {
          delete main.dataset.exiting;
          main.dataset.recovering = 'true';
        }
      }}
    />
  );
}
