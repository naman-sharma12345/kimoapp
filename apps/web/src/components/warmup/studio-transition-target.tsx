'use client';
import { useEffect } from 'react';
import Image from 'next/image';
import { FileText, Film } from 'lucide-react';
import type { SessionSnapshot } from '@kimo/client';
import { useUploads } from '@/lib/uploads/manager';
import { useSessionStore } from '@/stores/session';
import { assetTransitionName, type ReelAsset } from './warmup-reel';
import { isUnfolding } from '@/lib/warmup/transition';

export function StudioTransitionTarget({
  snapshot,
  sessionId,
}: {
  snapshot: SessionSnapshot | null;
  sessionId: string;
}) {
  const items = useUploads((state) => state.items);
  const saved = useSessionStore((state) => state.saved);
  useEffect(() => {
    if (!isUnfolding()) return;
    const node = document.querySelector<HTMLElement>(
      '[data-studio-transition-ready]',
    );
    if (node) node.dataset.studioMounted = 'true';
  }, []);
  const assets: ReelAsset[] = (snapshot?.assets ?? [])
    .filter((asset) => asset.source === 'user')
    .map((asset) => {
      const localId =
        saved?.sessionId === sessionId
          ? Object.keys(saved.assetLocalMap).find(
              (id) => saved.assetLocalMap[id] === asset.id,
            )
          : undefined;
      const local = items.find((item) => item.localId === localId);
      return {
        assetId: asset.id,
        name: asset.name,
        kind:
          asset.kind === 'video' ||
          asset.kind === 'image' ||
          asset.kind === 'audio'
            ? asset.kind
            : 'doc',
        thumbnail: local?.meta.thumbBlobUrl,
      };
    });
  return (
    <div
      className="studio-unfold"
      data-studio-transition-ready
      aria-hidden="true"
    >
      <div className="studio-unfold-panels">
        <div />
        <div />
        <div />
      </div>
      <div className="studio-unfold-mark">
        <span />
      </div>
      <div className="studio-unfold-timeline">
        <div className="studio-unfold-strip">
          {assets.map((asset) => (
            <div
              key={asset.assetId}
              className="warmup-tile studio-unfold-clip"
              style={{ viewTransitionName: assetTransitionName(asset.assetId) }}
            >
              {asset.thumbnail ? (
                <Image
                  src={asset.thumbnail}
                  alt=""
                  width={96}
                  height={54}
                  unoptimized
                />
              ) : asset.kind === 'video' ? (
                <Film size={16} />
              ) : (
                <FileText size={16} />
              )}
            </div>
          ))}
        </div>
        <svg className="studio-unfold-playhead" viewBox="0 0 7 80">
          <path d="M3.5 6v74" stroke="currentColor" strokeWidth="1.5" />
          <path d="M0 0h7L3.5 7z" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}
