import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PosterArt } from './PosterArt';
import { StatusChip } from './StatusChip';
import { DUR, EASE } from '../../lib/motion';
import type { Project } from '../../types/projects';

export type ContinueCardProps = {
  project: Project;
  liveAgentActivity: string;
  liveRenderProgress: number;
  hasOtherOrangeOnScreen: boolean;
  isStackedMobile: boolean;
  onOpenProject: (project: Project) => void;
};

export function ContinueCard({
  project,
  liveAgentActivity,
  liveRenderProgress,
  hasOtherOrangeOnScreen,
  isStackedMobile,
  onOpenProject,
}: ContinueCardProps) {
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();

  const currentRenderProgress =
    project.status === 'rendering'
      ? liveRenderProgress
      : (project.renderProgress ?? 0.62);

  const currentActivity =
    project.status === 'editing'
      ? liveAgentActivity ||
        project.agentActivity ||
        'grading the mountain shots'
      : project.agentActivity;

  // One Orange Rule: inside this ContinueCard, if status is 'editing', the bottom live agent dot is orange,
  // so suppress orange on the top status chip inside the same panel.
  const suppressChipOrange = project.status === 'editing';

  // For awaiting_review: primary sm button "watch and review" (secondary if another orange is on screen)
  const reviewButtonClass = hasOtherOrangeOnScreen
    ? 'btn-secondary'
    : 'btn-primary';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${project.title} — ${project.status.replace('_', ' ')}`}
      onClick={() => onOpenProject(project)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenProject(project);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="kimo-focus"
      style={{
        width: isStackedMobile ? '100%' : '560px',
        minHeight: isStackedMobile ? 'auto' : '200px',
        height: isStackedMobile ? 'auto' : '200px',
        flexShrink: 0,
        backgroundColor: 'var(--ink-1)',
        border: `1px solid ${hovered ? 'var(--line-strong)' : 'var(--line)'}`,
        borderRadius: '12px',
        display: 'grid',
        gridTemplateColumns: isStackedMobile ? '1fr' : '320px 1fr',
        gap: isStackedMobile ? '0px' : '8px',
        cursor: 'pointer',
        textAlign: 'left',
        scrollSnapAlign: 'start',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered
          ? '0 20px 48px -16px rgb(0 0 0 / 0.7), 0 0 32px -8px rgb(255 90 36 / 0.14)'
          : 'none',
        transition: `border-color var(--dur-1) var(--ease-out), transform var(--dur-3) var(--ease-out), box-shadow var(--dur-3) var(--ease-out)`,
        overflow: 'hidden',
      }}
    >
      {/* Left poster: 16:10, 320 wide on desktop, r8 inside 12px padding */}
      <div
        style={{
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 10',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: 'var(--ink-0)',
            boxShadow: 'inset 0 0 0 1px var(--line-inset)',
          }}
        >
          <PosterArt
            projectId={project.id}
            title={project.title}
            aspect={project.aspect}
            posterUrl={project.posterUrl}
            previewUrl={project.previewUrl}
            isPreviewActive={hovered}
            scrubProgress={null}
          />
          {project.status === 'rendering' && (
            <>
              <div className="render-sheen" />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: '2px',
                  backgroundColor: 'var(--cream-16)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round(currentRenderProgress * 100)}%`,
                    backgroundColor: 'var(--cream-100)',
                    transition: `width var(--dur-2) var(--ease-out)`,
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right column: padding 20px 20px 20px 4px on desktop */}
      <div
        style={{
          padding: isStackedMobile
            ? '4px 16px 16px 16px'
            : '20px 20px 20px 4px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minWidth: 0,
        }}
      >
        <div>
          <StatusChip
            status={project.status}
            renderProgress={currentRenderProgress}
            suppressOrange={suppressChipOrange}
          />
          <div
            className="t-20"
            style={{
              marginTop: '12px',
              color: 'var(--cream-100)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {project.title}
          </div>
          <div
            className="t-13"
            style={{
              marginTop: '4px',
              color: 'var(--cream-60)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            &ldquo;{project.prompt}&rdquo;
          </div>
        </div>

        {/* Bottom contextual row */}
        <div style={{ marginTop: '12px' }}>
          {project.status === 'editing' && (
            <div
              className="flex items-center"
              style={{
                gap: '8px',
                height: '20px',
                overflow: 'hidden',
              }}
              aria-live="polite"
            >
              <span
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  width: '6px',
                  height: '6px',
                  flexShrink: 0,
                }}
              >
                {!reducedMotion && (
                  <span
                    className="pulse-ring"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '999px',
                      backgroundColor: 'var(--orange)',
                    }}
                  />
                )}
                <span
                  style={{
                    position: 'relative',
                    width: '6px',
                    height: '6px',
                    borderRadius: '999px',
                    backgroundColor: 'var(--orange)',
                  }}
                />
              </span>

              <div
                style={{
                  position: 'relative',
                  height: '20px',
                  flex: 1,
                  overflow: 'hidden',
                }}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={currentActivity}
                    initial={
                      reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
                    }
                    animate={
                      reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }
                    }
                    exit={
                      reducedMotion
                        ? { opacity: 0 }
                        : {
                            opacity: 0,
                            y: -8,
                            transition: { duration: DUR.dur2, ease: EASE.in },
                          }
                    }
                    transition={
                      reducedMotion
                        ? { duration: DUR.dur2, ease: EASE.out }
                        : { duration: DUR.dur3, ease: EASE.out }
                    }
                    className="t-13"
                    style={{
                      display: 'block',
                      color: 'var(--cream-100)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {currentActivity}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
          )}

          {project.status === 'awaiting_review' && (
            <div>
              <span
                aria-hidden="true"
                className={`btn-base ${reviewButtonClass} h-28 t-13`}
              >
                watch and review
              </span>
            </div>
          )}

          {project.status === 'rendering' && (
            <div className="flex flex-col" style={{ gap: '6px' }}>
              <div
                style={{
                  width: '100%',
                  height: '2px',
                  backgroundColor: 'var(--cream-16)',
                  borderRadius: '999px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round(currentRenderProgress * 100)}%`,
                    backgroundColor: 'var(--cream-100)',
                    transition: `width var(--dur-2) var(--ease-out)`,
                  }}
                />
              </div>
              <span
                className="t-12 tabular-nums"
                style={{ color: 'var(--cream-38)' }}
              >
                about 40s left
              </span>
            </div>
          )}

          {project.status === 'draft' && (
            <span
              className="t-12 tabular-nums"
              style={{ color: 'var(--cream-38)' }}
            >
              {project.clipCount} clips
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
