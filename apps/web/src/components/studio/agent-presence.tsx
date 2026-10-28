'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Asset, KimoProject } from '@kimo/client';
import type { AgentFeed } from '@/lib/agent-feed';
import { agentLabel, agentTiming } from '@/lib/agentLabels';
import { clipName } from './agent-cards';
export function AgentPresence({
  feed,
  project,
  assets,
}: {
  feed: AgentFeed;
  project: KimoProject;
  assets: Asset[];
}) {
  const state = useSyncExternalStore(
    feed.subscribe,
    feed.getSnapshot,
    feed.getSnapshot,
  );
  const [announcement, setAnnouncement] = useState('');
  const announced = useRef('');
  const last = useRef(-Infinity);
  const seen = useRef(new Set<string>());
  const unseen = useRef(new Set<string>());
  const original = useRef('');
  useEffect(() => {
    original.current = document.title;
    const visible = () => {
      if (!document.hidden) {
        unseen.current.clear();
        document.title = original.current;
      }
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      document.title = original.current;
    };
  }, []);
  useEffect(() => {
    for (const entry of state.entries) {
      if (
        entry.type !== 'agent' ||
        entry.kind === 'say' ||
        seen.current.has(entry.id)
      )
        continue;
      seen.current.add(entry.id);
      if (document.hidden) {
        unseen.current.add(entry.id);
        document.title = '(1) kimo needs you';
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('kimo · your first cut is ready');
          } catch {
            /* Notifications may be unavailable despite permission. */
          }
        }
      }
    }
    const message = state.entries
      .filter((entry) => entry.type === 'agent')
      .at(-1);
    if (message?.type === 'agent' && message.id !== announced.current) {
      announced.current = message.id;
      setAnnouncement(message.text);
    }
  }, [state.entries]);
  useEffect(() => {
    if (!state.runningId) return;
    const speak = () => {
      const snapshot = feed.getSnapshot();
      const action = snapshot.actions[snapshot.runningId ?? ''];
      if (action) {
        last.current = performance.now();
        setAnnouncement(
          `kimo is ${agentLabel(action.tool, action.args, clipName(project, assets, action.target?.clipId))}`,
        );
      }
    };
    const remaining = agentTiming.announce - (performance.now() - last.current);
    if (remaining <= 0) {
      speak();
      return;
    }
    const timer = setTimeout(speak, remaining);
    return () => clearTimeout(timer);
  }, [state.runningId, feed, project, assets]);
  return (
    <p
      className="sr-only"
      data-agent-announcement
      aria-live="polite"
      aria-atomic="true"
    >
      {announcement}
    </p>
  );
}
