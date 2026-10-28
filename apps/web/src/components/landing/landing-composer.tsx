'use client';
import {
  memo,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useRouter } from '@/lib/app-router';
import {
  ArrowUp,
  Film,
  Mic,
  Paperclip,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from 'lucide-react';
import { AuthDialog } from '@/components/auth-dialog';
import { logger } from '@/lib/logger';
import { rememberPrompt, track } from '@/lib/telemetry';
import { KimoApiError, KimoClient } from '@kimo/client';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Menu, MenuItem } from '@/components/ui/menu';
import { Popover } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { UploadList } from '@/components/uploads/upload-list';
import { uploadManager, useUploads } from '@/lib/uploads/manager';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { composerEntrance, uiTiming } from '@/lib/motion';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { FILE_ACCEPT, prompts } from '@/lib/landing-files';
import { navigateToWarmup } from '@/lib/landing-navigation';
import { useSessionStore } from '@/stores/session';

type Aspect = 'auto' | '16:9' | '9:16' | '1:1';
const aspects: Aspect[] = ['auto', '16:9', '9:16', '1:1'];
const lengths = [
  { label: 'any length', seconds: undefined },
  { label: '15s', seconds: 15 },
  { label: '30s', seconds: 30 },
  { label: '60s', seconds: 60 },
  { label: '2 min', seconds: 120 },
] as const;
const examples = [
  { label: 'trip montage', icon: Film, prompt: prompts[0] },
  { label: 'podcast to shorts', icon: Mic, prompt: prompts[1] },
  { label: 'product teaser', icon: Sparkles, prompt: prompts[2] },
] as const;

function AspectIcon({ value }: { value: Aspect }) {
  const shape =
    value === '9:16'
      ? { x: 4, y: 1, width: 6, height: 12 }
      : value === '1:1'
        ? { x: 2, y: 2, width: 10, height: 10 }
        : { x: 1, y: 3, width: 12, height: 8 };
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
    >
      <rect {...shape} rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      {value === 'auto' ? (
        <path d="M5 7h4" stroke="currentColor" strokeWidth="1.5" />
      ) : null}
    </svg>
  );
}
function lengthLabel(value: number | undefined) {
  return (
    lengths.find((item) => item.seconds === value)?.label ??
    (value === undefined ? 'any length' : `${value}s`)
  );
}
function SelectorFields({
  aspect,
  setAspect,
  duration,
  setDuration,
  inline = false,
  initialMenu,
}: {
  aspect: Aspect;
  setAspect: (value: Aspect) => void;
  duration: number | undefined;
  setDuration: (value: number | undefined) => void;
  inline?: boolean;
  initialMenu?: string;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState('');
  if (inline)
    return (
      <div className="landing-sheet-fields">
        <fieldset>
          <legend>aspect ratio</legend>
          <div className="landing-sheet-options">
            {aspects.map((value) => (
              <Button
                key={value}
                size="sm"
                variant="ghost"
                aria-pressed={aspect === value}
                onClick={() => setAspect(value)}
              >
                <AspectIcon value={value} />
                {value}
              </Button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>length</legend>
          <div className="landing-sheet-options">
            {lengths.map((item) => (
              <Button
                key={item.label}
                size="sm"
                variant="ghost"
                aria-pressed={duration === item.seconds}
                onClick={() => {
                  setDuration(item.seconds);
                  setCustomOpen(false);
                }}
              >
                {item.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={customOpen}
              onClick={() => setCustomOpen(!customOpen)}
            >
              custom…
            </Button>
          </div>
          {customOpen ? (
            <div className="landing-custom-length">
              <label htmlFor="mobile-custom-length">seconds</label>
              <Input
                id="mobile-custom-length"
                type="number"
                min={1}
                step={1}
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
              />
              <Button
                size="sm"
                disabled={
                  !Number.isInteger(Number(custom)) || Number(custom) <= 0
                }
                onClick={() => {
                  setDuration(Number(custom));
                  setCustomOpen(false);
                }}
              >
                apply
              </Button>
            </div>
          ) : null}
        </fieldset>
      </div>
    );
  return (
    <>
      <Menu
        defaultOpen={initialMenu === 'aspect'}
        trigger={
          <Button
            size="sm"
            variant="ghost"
            aria-label={`aspect ratio: ${aspect}`}
          >
            <AspectIcon value={aspect} />
            {aspect}
          </Button>
        }
      >
        {aspects.map((value) => (
          <MenuItem key={value} onSelect={() => setAspect(value)}>
            <AspectIcon value={value} />
            {value}
          </MenuItem>
        ))}
      </Menu>
      {customOpen ? (
        <Popover
          label="custom length"
          open={customOpen}
          onOpenChange={setCustomOpen}
          trigger={
            <Button size="sm" variant="ghost">
              custom…
            </Button>
          }
        >
          <div className="landing-custom-length">
            <label htmlFor="custom-length">seconds</label>
            <Input
              id="custom-length"
              type="number"
              min={1}
              step={1}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
            />
            <Button
              size="sm"
              disabled={
                !Number.isInteger(Number(custom)) || Number(custom) <= 0
              }
              onClick={() => {
                setDuration(Number(custom));
                setCustomOpen(false);
              }}
            >
              apply
            </Button>
          </div>
        </Popover>
      ) : (
        <Menu
          defaultOpen={initialMenu === 'duration'}
          trigger={
            <Button
              size="sm"
              variant="ghost"
              aria-label={`video length: ${lengthLabel(duration)}`}
            >
              {lengthLabel(duration)}
            </Button>
          }
        >
          {lengths.map((item) => (
            <MenuItem
              key={item.label}
              onSelect={() => setDuration(item.seconds)}
            >
              {item.label}
            </MenuItem>
          ))}
          <MenuItem onSelect={() => setCustomOpen(true)}>custom…</MenuItem>
        </Menu>
      )}
    </>
  );
}

const Selectors = memo(SelectorFields);
export function LandingComposer({
  onExit,
  exiting,
  initialPrompt,
  initialFiles,
  initialAction,
  initialDragging,
  initialFocus,
}: {
  onExit: (exiting: boolean) => void;
  exiting: boolean;
  initialPrompt?: string;
  initialFiles?: File[];
  initialAction?: string;
  initialDragging?: boolean;
  initialFocus?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const reduced = useReducedMotion();
  const draft = useSessionStore((state) => state.draft);
  const [prompt, setPrompt] = useState(initialPrompt ?? draft?.prompt ?? '');
  const [aspect, setAspect] = useState<Aspect>(draft?.aspect ?? 'auto');
  const [duration, setDuration] = useState<number | undefined>(
    draft?.durationHint,
  );
  const [localIds, setLocalIds] = useState<string[]>(draft?.localIds ?? []);
  const uploadItems = useUploads((state) => state.items);
  const attachments = useMemo(
    () =>
      uploadItems.filter(
        (item) => localIds.includes(item.localId) && item.status !== 'canceled',
      ),
    [uploadItems, localIds],
  );
  const [focused, setFocused] = useState(false);
  const [typing, setTyping] = useState(false);
  const [dragging, setDragging] = useState(initialDragging ?? false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exitStyle, setExitStyle] = useState<CSSProperties>({});
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const submittingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredDraft = useRef(Boolean(draft));
  useEffect(() => {
    if (restoredDraft.current || !draft) return;
    restoredDraft.current = true;
    if (draft.localIds?.length && !localIds.length && !prompt) {
      setPrompt(draft.prompt);
      setLocalIds(draft.localIds);
      setAspect(draft.aspect);
      setDuration(draft.durationHint);
    }
  }, [draft, localIds.length, prompt]);

  useEffect(() => {
    if (
      initialFocus !== false &&
      (!initialAction ||
        initialAction === 'send' ||
        initialAction === 'example') &&
      (initialFocus ||
        window.matchMedia('(hover: hover) and (pointer: fine)').matches)
    ) {
      textarea.current?.focus({ preventScroll: true });
      if (initialPrompt)
        textarea.current?.setSelectionRange(
          initialPrompt.length,
          initialPrompt.length,
        );
    }
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [initialPrompt, initialAction, initialFocus]);
  useEffect(() => {
    if (focused || prompt || reduced) {
      setPlaceholderVisible(true);
      return;
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      setPlaceholderVisible(false);
      timeout = setTimeout(() => {
        setPlaceholderIndex((index) => (index + 1) % prompts.length);
        setPlaceholderVisible(true);
      }, uiTiming.placeholderFade);
    }, uiTiming.placeholderRotation);
    return () => {
      clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [focused, prompt, reduced]);
  const addFiles = useCallback(
    (files: File[]) => {
      if (submittingRef.current) return;
      const { localIds: added, rejected } = uploadManager.add(files, localIds);
      for (const { file, reason } of rejected)
        toast({
          tone: 'error',
          message: `${file.name} can’t be used: ${reason}`,
        });
      setLocalIds((current) => [...current, ...added]);
    },
    [toast, localIds],
  );
  const addedInitial = useRef(false);
  useEffect(() => {
    if (initialFiles?.length && !addedInitial.current) {
      addedInitial.current = true;
      addFiles(initialFiles);
    }
  }, [initialFiles, addFiles]);
  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event)) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      }
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      addFiles(Array.from(event.dataTransfer?.files ?? []));
    };
    const key = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        input.current?.click();
      }
      if (event.key === 'Escape') {
        dragDepth.current = 0;
        setDragging(false);
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      window.removeEventListener('keydown', key);
    };
  }, [addFiles]);
  const chooseExample = (text: string) => {
    setPrompt(text);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(text.length, text.length);
    });
  };
  const onType = (text: string) => {
    setPrompt(text);
    setTyping(Boolean(text));
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () => setTyping(false),
      uiTiming.typingIdle,
    );
  };
  const [authOpen, setAuthOpen] = useState(false);
  const send = async () => {
    if (submittingRef.current || (!prompt.trim() && !attachments.length))
      return;
    submittingRef.current = true;
    setSubmitting(true);
    const fileList = attachments.map((item) => item.file);
    const finalPrompt = prompt.trim()
      ? prompt
      : 'make a great video from these';
    useSessionStore.getState().setDraft({
      prompt,
      files: fileList,
      localIds,
      aspect,
      durationHint: duration,
    });
    const rect = composer.current?.getBoundingClientRect();
    if (rect)
      setExitStyle({
        '--exit-y': `${innerHeight / 2 - (rect.top + rect.height / 2)}px`,
        '--exit-scale-y': Math.min(1, 48 / rect.height),
      } as CSSProperties);
    onExit(true);
    const startedAt = Date.now();
    try {
      const client = new KimoClient();
      const auth = await client.auth();
      if (!auth.signedIn && !auth.remaining) {
        setAuthOpen(true);
        onExit(false);
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }
      const assetLocalMap = await uploadManager.start(
        attachments.map((item) => item.localId),
      );
      const session = await client.createSession({
        prompt: finalPrompt,
        assetIds: Object.values(assetLocalMap),
        aspect,
        durationHint: duration,
      });
      rememberPrompt(finalPrompt);
      track('prompt_sent', {
        length: finalPrompt.length,
        video: attachments.filter((a) => a.file.type.startsWith('video/'))
          .length,
        image: attachments.filter((a) => a.file.type.startsWith('image/'))
          .length,
        audio: attachments.filter((a) => a.file.type.startsWith('audio/'))
          .length,
        doc: attachments.filter(
          (a) => !/^(video|image|audio)\//.test(a.file.type),
        ).length,
      });
      useSessionStore.getState().startSession({
        sessionId: session.sessionId,
        prompt,
        assetLocalMap,
        aspect,
        durationHint: duration,
        attachments: attachments
          .filter((item) => assetLocalMap[item.localId])
          .map((item) => ({
            localId: item.localId,
            name: item.file.name,
            size: item.file.size,
            mime: item.file.type,
          })),
      });
      useSessionStore.getState().setWsUrl(session.wsUrl);
      const delay = Math.max(
        0,
        (reduced ? uiTiming.landingReduced : uiTiming.landingExit) -
          (Date.now() - startedAt),
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      navigateToWarmup(router, session.sessionId, reduced);
    } catch (error) {
      logger.error('session_start_failed');
      if (error instanceof KimoApiError && error.code === 'anonymous_limit')
        setAuthOpen(true);
      onExit(false);
      setSubmitting(false);
      submittingRef.current = false;
      toast({
        tone: 'error',
        message:
          'couldn’t start a session. your files are still here, try again.',
      });
    }
  };
  const sendCurrent = useRef(send);
  sendCurrent.current = send;
  useEffect(() => {
    if (initialAction === 'send') void sendCurrent.current();
  }, [initialAction]);
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    } else if (event.key === 'Escape') event.currentTarget.blur();
  };
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length) {
      event.preventDefault();
      addFiles(files);
    }
  };
  const selected = { aspect, setAspect, duration, setDuration };
  return (
    <>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      <div
        className="landing-composer-wrap"
        data-focused={focused || undefined}
        data-typing={typing || undefined}
        data-exiting={exiting || undefined}
      >
        <div className="landing-horizon" aria-hidden="true" />
        <motion.div
          {...composerEntrance(reduced)}
          initial={initialPrompt !== undefined ? false : undefined}
          ref={composer}
          className="landing-composer"
          style={exitStyle}
          data-exiting={exiting || undefined}
        >
          <div className="landing-composer-content">
            {
              <div
                className="landing-attachments"
                data-many={attachments.length > 1 || undefined}
                aria-label="attached files"
              >
                <UploadList items={attachments} />
              </div>
            }
            <div className="landing-text-wrap">
              <Textarea
                ref={textarea}
                variant="composer"
                maxRows={9}
                aria-label="describe your video"
                placeholder={prompts[placeholderIndex]}
                maxLength={4000}
                value={prompt}
                disabled={submitting}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false);
                  setTyping(false);
                }}
                onChange={(event) => onType(event.target.value)}
                onKeyDown={keyDown}
                onPaste={handlePaste}
              />
              <span
                className="landing-placeholder"
                data-visible={placeholderVisible || undefined}
                aria-hidden="true"
              >
                {!prompt ? prompts[placeholderIndex] : ''}
              </span>
            </div>
            <div className="landing-controls">
              <input
                ref={input}
                type="file"
                multiple
                accept={FILE_ACCEPT}
                className="landing-file-input"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  addFiles(Array.from(event.currentTarget.files ?? []));
                  event.currentTarget.value = '';
                }}
              />
              <Button
                variant="ghost"
                size="md"
                iconOnly
                icon={Paperclip}
                aria-label="attach files"
                tooltip="attach files"
                shortcut="⌘ U"
                onClick={() => input.current?.click()}
                disabled={submitting}
              />
              <div className="landing-desktop-selectors">
                <Selectors {...selected} initialMenu={initialAction} />
              </div>
              <div className="landing-mobile-settings">
                <Dialog
                  defaultOpen={initialAction === 'settings'}
                  trigger={
                    <Button
                      variant="ghost"
                      size="md"
                      iconOnly
                      icon={SlidersHorizontal}
                      aria-label="video settings"
                      tooltip="video settings"
                      disabled={submitting}
                    />
                  }
                >
                  <DialogContent
                    data-landing-sheet
                    title="video settings"
                    description="choose the aspect ratio and length."
                    actions={
                      <DialogClose asChild>
                        <Button>done</Button>
                      </DialogClose>
                    }
                  >
                    <Selectors {...selected} inline />
                  </DialogContent>
                </Dialog>
              </div>
              <span className="landing-spacer" />
              {prompt.length >= 3600 ? (
                <span
                  className="landing-counter"
                  data-limit={prompt.length >= 4000 || undefined}
                >
                  {prompt.length} / 4000
                </span>
              ) : null}
              <span className="landing-drop-hint">drop files anywhere</span>
              <span className="landing-send">
                <Button
                  variant="primary"
                  size="lg"
                  iconOnly
                  icon={ArrowUp}
                  aria-label="start editing"
                  tooltip="start editing"
                  shortcut="↵"
                  disabled={
                    (!prompt.trim() && !attachments.length) || submitting
                  }
                  loading={submitting}
                  onClick={() => void send()}
                />
              </span>
            </div>
          </div>
        </motion.div>
      </div>
      <div className="landing-examples" aria-label="example prompts">
        {examples.map(({ label, icon: Icon, prompt: example }, index) => (
          <button
            type="button"
            key={label}
            className={`landing-example landing-example-${index}`}
            onClick={() => chooseExample(example)}
            disabled={submitting}
          >
            <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <p className="landing-privacy">
        by sending, you agree that your files are processed by ai models. don’t
        upload anything private. <a href="/privacy">privacy</a>
      </p>
      <span className="landing-sr-only" role="status" aria-live="polite">
        {dragging ? 'drop to add to your video' : ''}
      </span>
      {dragging ? (
        <div className="landing-drop-overlay" aria-hidden="true">
          <div className="landing-drop-target">
            <span className="landing-upload-icon">
              <Upload size={20} strokeWidth={1.5} />
            </span>
            <p>drop to add to your video</p>
            <span>video, images, audio, pdf · up to 2 GB each</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
