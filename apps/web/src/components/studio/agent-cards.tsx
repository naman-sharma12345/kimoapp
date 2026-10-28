'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Check,
  X,
  ChevronDown,
  Globe,
  LoaderCircle,
  WandSparkles,
} from 'lucide-react';
import type { Asset, KimoProject } from '@kimo/client';
import type { AgentAction, FeedEntry } from '@/lib/agent-feed';
import { agentLabel, agentTiming } from '@/lib/agentLabels';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Popover } from '@/components/ui/popover';
import { AttachmentChip } from '@/components/ui/attachment-chip';
import { useReducedMotion } from '@/lib/use-reduced-motion';
export function clipName(project: KimoProject, assets: Asset[], id?: string) {
  const clip = id ? project.clips[id] : undefined;
  return (
    assets.find((asset) => asset.id === clip?.assetId)?.name ??
    clip?.text?.content ??
    id ??
    'clip'
  );
}
export function RichText({ text }: { text: string }) {
  const parts = text.split(
    /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g,
  );
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**'))
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('`'))
          return <code key={index}>{part.slice(1, -1)}</code>;
        const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (link)
          return (
            <a key={index} href={link[2]} target="_blank" rel="noreferrer">
              {link[1]}
            </a>
          );
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}
export function AgentText({
  text,
  stream,
}: {
  text: string;
  stream?: boolean;
}) {
  const reduced = useReducedMotion();
  const words = text.split(/\s+/);
  const revealed = useRef(stream ? 0 : words.length);
  const [shown, setShown] = useState(stream ? 0 : words.length);
  useEffect(() => {
    if (!stream || reduced) {
      revealed.current = words.length;
      setShown(words.length);
      return;
    }
    if (revealed.current >= words.length) return;
    const timer = setInterval(() => {
      revealed.current = Math.min(words.length, revealed.current + 1);
      setShown(revealed.current);
      if (revealed.current === words.length) clearInterval(timer);
    }, agentTiming.word);
    return () => clearInterval(timer);
  }, [text, stream, reduced, words.length]);
  return (
    <div className="agent-message-text">
      <RichText
        text={stream && !reduced ? words.slice(0, shown).join(' ') : text}
      />
    </div>
  );
}
export function ActionStatus({ status }: { status: AgentAction['status'] }) {
  return status === 'running' ? (
    <LoaderCircle className="agent-spinner" size={16} aria-label="running" />
  ) : status === 'done' ? (
    <Check size={16} aria-label="done" />
  ) : (
    <X size={16} className="agent-failed" aria-label="failed" />
  );
}
export function ActionGroup({
  entry,
  actions,
  now,
  runningId,
  project,
  assets,
  onShow,
  onRevert,
}: {
  entry: Extract<FeedEntry, { type: 'group' }>;
  actions: Record<string, AgentAction>;
  now: number;
  runningId?: string;
  project: KimoProject;
  assets: Asset[];
  onShow: (id?: string) => void;
  onRevert: (ids: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = entry.actions.flatMap((id) =>
    actions[id] ? [actions[id]] : [],
  );
  const running = entry.actions.includes(runningId ?? '');
  const last = items.at(-1);
  const duration = items.reduce(
    (sum, item) => sum + (item.durationMs ?? Math.max(0, now - item.started)),
    0,
  );
  return (
    <div
      className="agent-action-group"
      data-running={running || undefined}
      data-action-id={running ? runningId : undefined}
    >
      <div className="agent-group-header">
        <div className="agent-group-summary">
          <WandSparkles size={14} aria-hidden />
          <button
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {entry.stopped
              ? 'stopped here, adjusting'
              : `${entry.response ? '↪ ' : ''}${last?.title ?? 'editing'}`}
          </button>
          <span className="agent-duration">
            {(duration / 1000).toFixed(1)}s
          </span>
          <button
            aria-label="expand action group"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown size={16} />
          </button>
        </div>
        {items.some((item) => item.status === 'done') ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onRevert(entry.actions)}
          >
            revert this step
          </Button>
        ) : null}
      </div>
      {(expanded ? items : items.slice(-3)).map((item) => (
        <div
          key={item.id}
          className="agent-step"
          data-running={item.id === runningId || undefined}
        >
          <ActionStatus status={item.status} />
          <span title={item.title}>
            {agentLabel(
              item.tool,
              item.args,
              clipName(project, assets, item.target?.clipId),
            )}
          </span>
          <div className="agent-show-step">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onShow(item.target?.clipId)}
            >
              show
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
export function ImageStrip({
  entry,
  onFeedback,
}: {
  entry: Extract<FeedEntry, { type: 'images' }>;
  onFeedback: (text: string) => void;
}) {
  return (
    <div className="agent-images">
      <div>
        {entry.assets.map((asset) => (
          <Popover
            key={asset.id}
            label={`image ${asset.name}`}
            trigger={
              <button
                className="agent-image-tile"
                aria-label={`inspect ${asset.name}`}
              >
                <Image
                  src={asset.thumbUrl ?? asset.url}
                  alt={asset.name}
                  width={72}
                  height={72}
                  unoptimized
                />
                <Globe size={12} aria-hidden />
              </button>
            }
          >
            <Image
              src={asset.thumbUrl ?? asset.url}
              alt={asset.name}
              width={240}
              height={160}
              unoptimized
              className="agent-image-preview"
            />
            <a
              href={asset.attribution?.pageUrl ?? asset.url}
              target="_blank"
              rel="noreferrer"
            >
              {asset.attribution?.site ?? 'open page'}
            </a>
            <p>{asset.attribution?.license}</p>
            <div className="agent-button-row">
              <Button
                size="sm"
                onClick={() => onFeedback(`use this image: ${asset.name}`)}
              >
                use this
              </Button>
              <Button
                size="sm"
                onClick={() => onFeedback(`not this one: ${asset.name}`)}
              >
                not this one
              </Button>
            </div>
          </Popover>
        ))}
      </div>
      <p>
        from{' '}
        {Array.from(
          new Set(
            entry.assets.map(
              (asset) => asset.attribution?.site ?? new URL(asset.url).hostname,
            ),
          ),
        ).join(', ')}
      </p>
    </div>
  );
}
export function UserBubble({
  entry,
}: {
  entry: Extract<FeedEntry, { type: 'user' }>;
}) {
  return (
    <div className="agent-user">
      <div className="agent-user-bubble">
        {entry.assets.map((asset) => (
          <AttachmentChip
            key={asset.id}
            name={asset.name}
            kind={asset.kind}
            meta=""
            thumbnail={
              asset.thumbUrl ?? (asset.kind === 'image' ? asset.url : undefined)
            }
          />
        ))}
        <p>{entry.text}</p>
      </div>
      {entry.pending ? (
        <small>kimo will read this after the current step</small>
      ) : entry.read ? (
        <small className="agent-read">
          <Check size={12} aria-hidden />
          read
        </small>
      ) : null}
      <time dateTime={new Date(entry.at).toISOString()}>
        {new Date(entry.at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}
      </time>
    </div>
  );
}
export function AgentMessage({
  entry,
  onSend,
  onPlay,
  onFocus,
  onRender,
  reviewActive = false,
}: {
  entry: Extract<FeedEntry, { type: 'agent' }>;
  onSend: (text: string) => void;
  onPlay: () => void;
  onFocus: () => void;
  onRender: () => void;
  reviewActive?: boolean;
}) {
  return (
    <div
      className={`agent-say ${entry.kind === 'ask_review' ? 'agent-review' : ''}`}
    >
      <Avatar identity="agent" />
      <div>
        <AgentText text={entry.text} stream={entry.stream} />
        {entry.kind === 'ask_review' ? (
          <div className="agent-button-row">
            <Button size="sm" onClick={onPlay}>
              play from start
            </Button>
            <Button size="sm" onClick={onFocus}>
              ask for changes
            </Button>
            <Button
              variant={reviewActive ? 'primary' : 'secondary'}
              disabled={!reviewActive}
              size="sm"
              onClick={onRender}
            >
              looks good, render it
            </Button>
          </div>
        ) : null}
        {entry.kind === 'ask_choice' ? (
          <div className="agent-choices">
            {entry.choices?.slice(0, 4).map((choice) => (
              <Button key={choice} size="sm" onClick={() => onSend(choice)}>
                {choice}
              </Button>
            ))}
            <small>or type your own answer</small>
          </div>
        ) : null}
      </div>
    </div>
  );
}
