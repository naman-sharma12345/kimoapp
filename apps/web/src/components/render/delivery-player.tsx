'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { motion } from 'motion/react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { DeliveredVideo } from '@kimo/client';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { durations, springs } from '@/lib/motion';
import { videoTime } from '@/lib/render';
import { isTypingTarget } from '@/lib/keyboard';
export function DeliveryPlayer({
  video,
  fromTransition,
}: {
  video: DeliveredVideo;
  fromTransition: boolean;
}) {
  const element = useRef<HTMLVideoElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(video.durationSec);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [buffered, setBuffered] = useState(0);
  const [hoverTime, setHoverTime] = useState<number>();
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  const toggle = useCallback(() => {
    const media = element.current;
    if (!media) return;
    if (!media.paused) media.pause();
    else {
      setError('');
      void media
        .play()
        .catch(() => setError('could not play this video · try again'));
    }
  }, []);
  const seek = useCallback(
    (time: number) => {
      const media = element.current;
      if (media && media.readyState > 0) {
        media.currentTime = Math.max(0, Math.min(duration, time));
        setCurrent(media.currentTime);
      }
    },
    [duration],
  );
  const full = useCallback(() => {
    const change = document.fullscreenElement
      ? document.exitFullscreen()
      : container.current?.requestFullscreen();
    void change?.catch(() =>
      setError('fullscreen is unavailable in this browser'),
    );
  }, []);
  useEffect(() => {
    const update = () =>
      setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => {
    const media = element.current;
    if (media) {
      media.volume = volume;
      media.muted = muted;
      media.playbackRate = rate;
    }
  }, [volume, muted, rate]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        (isTypingTarget(event.target) &&
          !(
            event.target instanceof HTMLInputElement &&
            event.target.type === 'range'
          )) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const key = event.key.toLowerCase();
      if (
        key === ' ' &&
        event.target instanceof HTMLElement &&
        event.target.closest('button, a')
      )
        return;
      if (key === ' ' || key === 'k') {
        event.preventDefault();
        toggle();
      } else if (key === 'j') {
        event.preventDefault();
        seek(current - 10);
      } else if (key === 'l') {
        event.preventDefault();
        seek(current + 10);
      } else if (key === 'f') {
        event.preventDefault();
        full();
      } else if (key === 'm') {
        event.preventDefault();
        setMuted((value) => !value);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [toggle, seek, full, current]);
  const sprite = video.sprite;
  const tile =
    sprite && hoverTime !== undefined
      ? Math.min(
          Math.max(0, Math.ceil(video.durationSec / sprite.intervalSec) - 1),
          Math.floor(hoverTime / sprite.intervalSec),
        )
      : 0;
  return (
    <motion.div
      ref={container}
      className="delivery-player"
      data-output-frame
      data-playing={playing || undefined}
      data-vertical={video.width < video.height || undefined}
      style={{ aspectRatio: `${video.width}/${video.height}` }}
      initial={
        fromTransition ? false : { opacity: 0, scale: reduced ? 1 : 0.98 }
      }
      animate={{ opacity: 1, scale: 1 }}
      transition={reduced ? { duration: durations['dur-2'] } : springs.soft}
      role="region"
      aria-label="video player"
      tabIndex={0}
    >
      <video
        ref={element}
        src={video.url}
        poster={video.posterUrl}
        playsInline
        preload="metadata"
        aria-label={video.title}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
        onProgress={(event) => {
          const media = event.currentTarget;
          if (media.buffered.length)
            setBuffered(media.buffered.end(media.buffered.length - 1));
        }}
        onError={() => setError('could not load this video · try again')}
      >
        <track
          kind="captions"
          src={video.captionsUrl}
          srcLang="en"
          label="captions"
        />
      </video>
      {!playing ? (
        <button
          className="delivery-big-play"
          onClick={toggle}
          aria-label="play video"
        >
          <Play size={24} aria-hidden />
        </button>
      ) : null}
      {error ? (
        <p className="delivery-player-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="delivery-controls">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={playing ? Pause : Play}
          aria-label={playing ? 'pause video' : 'play video'}
          tooltip={playing ? 'pause video' : 'play video'}
          onClick={toggle}
        />
        <div
          className="delivery-scrubber"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setHoverTime(
              Math.max(
                0,
                Math.min(1, (event.clientX - rect.left) / rect.width),
              ) * duration,
            );
          }}
          onPointerLeave={() => setHoverTime(undefined)}
        >
          <div className="delivery-seek-track">
            <span
              className="delivery-buffered"
              style={{
                transform: `scaleX(${Math.min(1, buffered / duration)})`,
              }}
            />
            <span
              className="delivery-played"
              style={{
                transform: `scaleX(${Math.min(1, current / duration)})`,
              }}
            />
          </div>
          <input
            type="range"
            aria-label="seek video"
            aria-valuetext={`${videoTime(current)} of ${videoTime(duration)}`}
            min={0}
            max={duration}
            step={0.01}
            value={current}
            onChange={(event) => seek(Number(event.target.value))}
          />
          {hoverTime !== undefined ? (
            <div
              className="delivery-seek-tip"
              style={{
                left: `clamp(var(--space-48), ${(hoverTime / duration) * 100}%, calc(100% - var(--space-48)))`,
              }}
            >
              {sprite ? (
                <span
                  className="delivery-sprite"
                  style={
                    {
                      width: sprite.tileWidth,
                      height: sprite.tileHeight,
                      backgroundImage: `url(${JSON.stringify(sprite.url)})`,
                      backgroundPosition: `${-(tile % sprite.columns) * sprite.tileWidth}px ${-Math.floor(tile / sprite.columns) * sprite.tileHeight}px`,
                    } as CSSProperties
                  }
                />
              ) : null}
              {videoTime(hoverTime)}
            </div>
          ) : null}
        </div>
        <span className="delivery-time">
          {videoTime(current)} / {videoTime(duration)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={muted || volume === 0 ? VolumeX : Volume2}
          aria-label={muted ? 'unmute video' : 'mute video'}
          tooltip={muted ? 'unmute video' : 'mute video'}
          onClick={() => {
            if (!volume) setVolume(1);
            setMuted(!muted);
          }}
        />
        <input
          className="delivery-volume"
          type="range"
          aria-label="video volume"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(event) => {
            const value = Number(event.target.value);
            setVolume(value);
            setMuted(value === 0);
          }}
        />
        <select
          aria-label="playback speed"
          value={rate}
          onChange={(event) => setRate(Number(event.target.value))}
        >
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
            <option value={speed} key={speed}>
              {speed}×
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={fullscreen ? Minimize2 : Maximize2}
          aria-label={fullscreen ? 'exit fullscreen' : 'fullscreen video'}
          tooltip={fullscreen ? 'exit fullscreen' : 'fullscreen video'}
          onClick={full}
        />
      </div>
    </motion.div>
  );
}
