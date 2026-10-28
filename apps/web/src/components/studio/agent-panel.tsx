'use client';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import type { Asset, ClientEvent, KimoProject } from '@kimo/client';
import { ArrowUp, Paperclip, PanelLeftClose, History } from 'lucide-react';
import type { AgentFeed } from '@/lib/agent-feed';
import { agentTiming } from '@/lib/agentLabels';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { AttachmentChip } from '@/components/ui/attachment-chip';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ActionGroup,
  ActionStatus,
  AgentMessage,
  ImageStrip,
  UserBubble,
  clipName,
} from './agent-cards';
export function AgentPanel({
  feed,
  project,
  assets,
  acting,
  paused,
  connected,
  tab,
  onTab,
  onCollapse,
  composerRef,
  note,
  onNote,
  onSend,
  onControl,
  onUndo,
  onRender,
  onShow,
  onRevert,
  onUpload,
  onPlay,
}: {
  feed: AgentFeed;
  project: KimoProject;
  assets: Asset[];
  acting: boolean;
  paused: boolean;
  connected: boolean;
  tab: string;
  onTab: (tab: string) => void;
  onCollapse: () => void;
  composerRef: RefObject<HTMLDivElement | null>;
  note: string;
  onNote: (text: string) => void;
  onSend: (
    text: string,
    attachments: Asset[],
    interrupt: boolean,
  ) => Promise<void>;
  onControl: (event: ClientEvent) => void;
  onUndo: () => void;
  onRender: () => void;
  onShow: (id?: string, mask?: boolean) => void;
  onRevert: (ids: string[]) => void;
  onUpload: (files: File[]) => Promise<Asset[]>;
  onPlay: () => void;
}) {
  const state = useSyncExternalStore(
    feed.subscribe,
    feed.getSnapshot,
    feed.getSnapshot,
  );
  const scroll = useRef<HTMLDivElement>(null);
  const bottom = useRef(true);
  const [newActivity, setNewActivity] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const [sent, setSent] = useState(false);
  const [notificationChoice, setNotificationChoice] = useState(false);

  useEffect(() => {
    try {
      setNotificationChoice(
        localStorage.getItem('kimo.notifications.choice') !== null,
      );
    } catch {
      /* Storage is optional. */
    }
  }, []);
  useEffect(() => {
    if (!state.runningId) return;
    const timer = setInterval(() => setNow(Date.now()), agentTiming.clock);
    return () => clearInterval(timer);
  }, [state.runningId]);
  useLayoutEffect(() => {
    const node = scroll.current;
    if (!node) return;
    if (bottom.current) {
      node.scrollTop = node.scrollHeight;
      setNewActivity(false);
    } else setNewActivity(true);
  }, [state.revision, tab]);
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const observer = new MutationObserver(() => {
      if (bottom.current) node.scrollTop = node.scrollHeight;
      else setNewActivity(true);
    });
    observer.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [tab]);
  useEffect(() => {
    const node = composerRef.current;
    if (node && (node.innerText ?? '') !== note) node.textContent = note;
  }, [note, composerRef]);
  const focus = () => {
    onTab('chat');
    requestAnimationFrame(() => composerRef.current?.focus());
  };
  async function send(text = note) {
    const message = text.trim();
    if (!message || uploading || !connected) return;
    const currentAttachments = attachments;
    const interrupt = acting && !paused && !message.startsWith('/');
    feed.user(message, currentAttachments, interrupt);
    onNote('');
    if (composerRef.current) composerRef.current.replaceChildren();
    setAttachments([]);
    setSent(true);
    if (message === '/pause') {
      onControl({ t: 'pause' });
      feed.system('you paused kimo');
      return;
    }
    if (message === '/resume') {
      onControl({ t: 'resume' });
      feed.system('you resumed kimo');
      return;
    }
    if (message === '/undo-last') {
      onUndo();
      feed.system('you undid your last edit');
      return;
    }
    if (message === '/render') {
      onRender();
      return;
    }
    try {
      await onSend(message, currentAttachments, interrupt);
    } catch {
      feed.error('could not send your note · try again');
    }
  }
  const mentionQuery = note.match(/(?:^|\s)@([^@\n]*)$/)?.[1];
  const mentions =
    mentionQuery === undefined
      ? []
      : Object.values(project.clips)
          .filter((clip) =>
            clipName(project, assets, clip.id)
              .toLowerCase()
              .includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 6);
  function mention(id: string) {
    const node = composerRef.current;
    if (!node) return;
    node.focus();
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const name = clipName(project, assets, id);
    if (anchor?.nodeType === Node.TEXT_NODE && selection) {
      const value = anchor.textContent ?? '';
      const end = selection.anchorOffset;
      const start = value.lastIndexOf('@', end);
      if (start >= 0) {
        const range = document.createRange();
        range.setStart(anchor, start);
        range.setEnd(anchor, end);
        range.deleteContents();
        const chip = document.createElement('span');
        chip.contentEditable = 'false';
        chip.className = 'agent-mention';
        chip.dataset.clipId = id;
        chip.textContent = `@${name}`;
        range.insertNode(chip);
        const space = document.createTextNode(' ');
        chip.after(space);
        range.setStartAfter(space);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        onNote(node.innerText);
        return;
      }
    }
    onNote(note.replace(/@[^@\n]*$/, `@${name} `));
  }
  const latest = state.entries.at(-1);
  const reviewId =
    latest?.type === 'agent' && latest.kind === 'ask_review'
      ? latest.id
      : undefined;
  const filtered = Object.values(state.actions).filter((action) => {
    const text =
      `${action.tool} ${action.title} ${clipName(project, assets, action.target?.clipId)}`.toLowerCase();
    return (
      text.includes(query.toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'failed' && action.status === 'failed') ||
        (filter === 'models' && /sam|muse|segment/.test(action.tool)) ||
        (filter === 'edits' && !/sam|muse|segment/.test(action.tool)))
    );
  });
  return (
    <section
      className="studio-panel studio-agent agent-panel"
      aria-label="agent panel"
      data-running-action={state.runningId}
    >
      <header className="studio-panel-header">
        <Avatar identity="agent" acting={Boolean(state.runningId)} />
        <span className="studio-heading">kimo</span>
        <span className="studio-spacer" />
        {acting && !paused ? (
          <Button
            size="xs"
            variant="ghost"
            disabled={!connected}
            onClick={() => {
              onControl({ t: 'pause' });
              feed.system('you stopped kimo');
            }}
          >
            stop now
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon={History}
          aria-label="action history"
          tooltip="action history"
          onClick={() => onTab('actions')}
        />
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon={PanelLeftClose}
          aria-label="collapse agent panel"
          tooltip="collapse agent panel"
          onClick={onCollapse}
        />
      </header>
      <Tabs value={tab} onValueChange={onTab} data-studio-agent-tabs>
        <TabsList aria-label="agent panel views">
          <TabsTrigger value="chat">chat</TabsTrigger>
          <TabsTrigger value="actions">actions</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" data-studio-agent-content>
          <div
            className="agent-stream"
            ref={scroll}
            onScroll={(event) => {
              const node = event.currentTarget;
              bottom.current =
                node.scrollHeight - node.clientHeight - node.scrollTop <=
                agentTiming.bottom;
              if (bottom.current) setNewActivity(false);
            }}
          >
            {state.entries.map((entry) =>
              entry.type === 'user' ? (
                <UserBubble key={entry.id} entry={entry} />
              ) : entry.type === 'agent' ? (
                <AgentMessage
                  key={entry.id}
                  entry={entry}
                  onSend={(text) => void send(text)}
                  onPlay={onPlay}
                  onFocus={focus}
                  onRender={onRender}
                  reviewActive={entry.id === reviewId}
                />
              ) : entry.type === 'group' ? (
                <ActionGroup
                  key={entry.id}
                  entry={entry}
                  actions={state.actions}
                  now={now}
                  runningId={state.runningId}
                  project={project}
                  assets={assets}
                  onShow={onShow}
                  onRevert={onRevert}
                />
              ) : entry.type === 'system' ? (
                <p key={entry.id} className="agent-system">
                  {entry.text}
                </p>
              ) : entry.type === 'images' ? (
                <ImageStrip
                  key={entry.id}
                  entry={entry}
                  onFeedback={(text) => void send(text)}
                />
              ) : entry.type === 'sam' ? (
                <div key={entry.id} className="agent-sam-card">
                  <div className="editor-mask-checkerboard">
                    <div
                      className="editor-mask-thumbnail"
                      style={{
                        backgroundImage: `url(${JSON.stringify(assets.find((asset) => asset.id === entry.assetId)?.thumbUrl ?? assets.find((asset) => asset.id === entry.assetId)?.url ?? '')})`,
                      }}
                    />
                  </div>
                  <p>
                    selected the person in{' '}
                    {clipName(project, assets, entry.clipId)} with sam 3.1
                  </p>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => onShow(entry.clipId, true)}
                  >
                    view mask
                  </Button>
                </div>
              ) : (
                <div key={entry.id} className="agent-error">
                  <p>{entry.text}</p>
                  <Button
                    size="xs"
                    onClick={() =>
                      entry.actionId
                        ? onControl({ t: 'retry', actionId: entry.actionId })
                        : void send('retry the last step')
                    }
                  >
                    retry step
                  </Button>
                </div>
              ),
            )}
            {sent &&
            !notificationChoice &&
            typeof Notification !== 'undefined' &&
            Notification.permission === 'default' ? (
              <div className="agent-notification">
                <p>want a ping when kimo needs you?</p>
                <Button
                  size="xs"
                  onClick={() => {
                    setNotificationChoice(true);
                    try {
                      localStorage.setItem('kimo.notifications.choice', 'yes');
                    } catch {
                      /* Storage or browser capability is unavailable. */
                    }
                    void Notification.requestPermission();
                  }}
                >
                  yes
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setNotificationChoice(true);
                    try {
                      localStorage.setItem('kimo.notifications.choice', 'no');
                    } catch {
                      /* Storage or browser capability is unavailable. */
                    }
                  }}
                >
                  no thanks
                </Button>
              </div>
            ) : null}
          </div>
          {newActivity ? (
            <div className="agent-new-activity">
              <Button
                size="sm"
                onClick={() => {
                  bottom.current = true;
                  if (scroll.current)
                    scroll.current.scrollTop = scroll.current.scrollHeight;
                  setNewActivity(false);
                }}
              >
                new activity ↓
              </Button>
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="actions" data-studio-agent-content>
          <div className="agent-audit-filter">
            <input
              aria-label="search actions"
              placeholder="search actions"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <SegmentedControl
              aria-label="filter actions"
              value={filter}
              onValueChange={setFilter}
              options={[
                { value: 'all', label: 'all' },
                { value: 'edits', label: 'edits' },
                { value: 'models', label: 'ai models' },
                { value: 'failed', label: 'failed' },
              ]}
            />
          </div>
          <div className="agent-audit">
            {filtered.map((action) => (
              <div key={action.id}>
                <button
                  className="agent-audit-row"
                  aria-expanded={expanded === action.id}
                  data-running={state.runningId === action.id || undefined}
                  onClick={() =>
                    setExpanded(expanded === action.id ? null : action.id)
                  }
                >
                  <time>
                    {new Date(action.started).toLocaleTimeString([], {
                      hour12: false,
                    })}
                  </time>
                  <ActionStatus status={action.status} />
                  <code>{action.tool}</code>
                  <span>
                    {clipName(project, assets, action.target?.clipId)}
                  </span>
                  <span>
                    {(
                      (action.durationMs ?? Math.max(0, now - action.started)) /
                      1000
                    ).toFixed(1)}
                    s
                  </span>
                </button>
                {expanded === action.id ? (
                  <div className="agent-audit-detail">
                    <pre>{JSON.stringify(action.args, null, 2)}</pre>
                    <p>{action.error ?? action.note ?? action.status}</p>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => onShow(action.target?.clipId)}
                    >
                      show
                    </Button>
                    {action.status === 'done' ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => onRevert([action.id])}
                      >
                        revert this step
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <div className="studio-agent-footer">
        <div className="agent-attachment-row">
          {attachments.map((asset) => (
            <AttachmentChip
              key={asset.id}
              name={asset.name}
              kind={asset.kind}
              meta={asset.kind}
              thumbnail={
                asset.thumbUrl ??
                (asset.kind === 'image' ? asset.url : undefined)
              }
              onRemove={() =>
                setAttachments((items) =>
                  items.filter((item) => item.id !== asset.id),
                )
              }
            />
          ))}
          {uploading ? <span role="status">uploading attachments…</span> : null}
        </div>
        <div className="studio-composer agent-composer">
          <div
            ref={composerRef}
            contentEditable
            role="textbox"
            tabIndex={0}
            aria-multiline="true"
            aria-label="tell kimo what to change"
            className="agent-composer-input"
            data-placeholder={
              paused
                ? 'tell kimo what to do next…'
                : acting
                  ? 'type to interrupt kimo…'
                  : 'tell kimo what to change…'
            }
            suppressContentEditableWarning
            onInput={(event) => onNote(event.currentTarget.innerText)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                document
                  .querySelector<HTMLElement>('.editor-ruler-content')
                  ?.focus();
              }
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
          {mentions.length ? (
            <div
              className="agent-mention-menu"
              role="group"
              aria-label="mention clips"
            >
              {mentions.map((clip) => (
                <button
                  key={clip.id}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => mention(clip.id)}
                >
                  {assets.find((asset) => asset.id === clip.assetId)
                    ?.thumbUrl ? (
                    <ImageThumb
                      url={
                        assets.find((asset) => asset.id === clip.assetId)
                          ?.thumbUrl ?? ''
                      }
                    />
                  ) : null}
                  {clipName(project, assets, clip.id)}
                </button>
              ))}
            </div>
          ) : null}
          {note.startsWith('/') ? (
            <div
              className="agent-mention-menu"
              role="group"
              aria-label="commands"
            >
              {['/pause', '/resume', '/undo-last', '/render']
                .filter((command) => command.startsWith(note.trim()))
                .map((command) => (
                  <button key={command} onClick={() => void send(command)}>
                    {command}
                  </button>
                ))}
            </div>
          ) : null}
          <div className="studio-composer-actions">
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              aria-label="attach chat files"
              onChange={async (event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                if (!files.length) return;
                setUploading(true);
                try {
                  const added = await onUpload(files);
                  setAttachments((items) => [...items, ...added]);
                } catch {
                  feed.error('could not upload attachments · try again');
                } finally {
                  setUploading(false);
                }
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={Paperclip}
              aria-label="attach files"
              tooltip="attach files"
              onClick={() => picker.current?.click()}
            />
            <Button
              variant={
                note.trim() && !state.runningId && !reviewId
                  ? 'primary'
                  : 'secondary'
              }
              size="sm"
              iconOnly
              icon={ArrowUp}
              aria-label="send note"
              tooltip="send note"
              disabled={!note.trim() || uploading || !connected}
              onClick={() => void send()}
            />
          </div>
        </div>
      </div>

      {state.ackMs !== undefined ? (
        <span hidden data-interrupt-ack-ms={Math.round(state.ackMs)} />
      ) : null}
    </section>
  );
}
function ImageThumb({ url }: { url: string }) {
  return (
    <span
      className="agent-mention-thumb"
      style={{ backgroundImage: `url(${JSON.stringify(url)})` }}
    />
  );
}
