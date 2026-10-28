import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Loader2 } from 'lucide-react';
import { dur, durMs, ease, spring } from '../../lib/motion';
import type {
  AccountPreferences,
  DefaultAspect,
  PreferenceKey,
} from '../../types/account-page';

export interface PreferencesSectionProps {
  preferences: AccountPreferences;
  onUpdatePreference: <K extends PreferenceKey>(
    key: K,
    value: AccountPreferences[K],
  ) => Promise<void>;
  simulateErrorTrigger?: number;
  onSaveError: (message: string) => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const ASPECT_OPTIONS: DefaultAspect[] = ['auto', '16:9', '9:16', '1:1'];

interface SwitchRowConfig {
  key: Exclude<PreferenceKey, 'defaultAspect'>;
  label: string;
  hint?: string;
}

const SWITCH_ROWS: SwitchRowConfig[] = [
  {
    key: 'captionsDefault',
    label: 'captions on by default',
  },
  {
    key: 'webImages',
    label: 'let kimo search the web for images',
    hint: 'images found on the web are shown with their source',
  },
  {
    key: 'reduceMotion',
    label: 'reduce motion in the studio',
    hint: 'follows your system setting unless you change it',
  },
  {
    key: 'soundOnApproval',
    label: 'sound on approval',
  },
];

export function PreferencesSection({
  preferences,
  onUpdatePreference,
  simulateErrorTrigger = 0,
  onSaveError,
}: PreferencesSectionProps) {
  const systemReduceMotion = useReducedMotion();
  const effectiveReduceMotion =
    Boolean(systemReduceMotion) || preferences.reduceMotion;

  const [optimisticPrefs, setOptimisticPrefs] =
    useState<AccountPreferences>(preferences);
  const [rowStatus, setRowStatus] = useState<Record<PreferenceKey, SaveStatus>>(
    {
      defaultAspect: 'idle',
      captionsDefault: 'idle',
      webImages: 'idle',
      reduceMotion: 'idle',
      soundOnApproval: 'idle',
    },
  );
  const [shakeCount, setShakeCount] = useState<Record<PreferenceKey, number>>({
    defaultAspect: 0,
    captionsDefault: 0,
    webImages: 0,
    reduceMotion: 0,
    soundOnApproval: 0,
  });

  const timersRef = useRef<Record<string, number | undefined>>({});

  useEffect(() => {
    setOptimisticPrefs(preferences);
  }, [preferences]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  const clearRowTimer = (key: PreferenceKey) => {
    if (timersRef.current[key]) {
      window.clearTimeout(timersRef.current[key]);
      timersRef.current[key] = undefined;
    }
  };

  const handlePreferenceChange = async <K extends PreferenceKey>(
    key: K,
    nextValue: AccountPreferences[K],
  ) => {
    if (rowStatus[key] === 'saving') return;

    const previousValue = optimisticPrefs[key];
    clearRowTimer(key);

    setOptimisticPrefs((prev) => ({
      ...prev,
      [key]: nextValue,
    }));
    setRowStatus((prev) => ({
      ...prev,
      [key]: 'saving',
    }));

    try {
      await onUpdatePreference(key, nextValue);
      setRowStatus((prev) => ({
        ...prev,
        [key]: 'saved',
      }));
      timersRef.current[key] = window.setTimeout(() => {
        setRowStatus((prev) => ({
          ...prev,
          [key]: 'idle',
        }));
      }, durMs.checkHold);
    } catch {
      // Revert optimistic value and trigger 4px horizontal shake (3 cycles, 240ms)
      setOptimisticPrefs((prev) => ({
        ...prev,
        [key]: previousValue,
      }));
      setRowStatus((prev) => ({
        ...prev,
        [key]: 'error',
      }));
      setShakeCount((prev) => ({
        ...prev,
        [key]: prev[key] + 1,
      }));
      onSaveError("couldn't save that. try again.");

      timersRef.current[key] = window.setTimeout(() => {
        setRowStatus((prev) => ({
          ...prev,
          [key]: 'idle',
        }));
      }, durMs.shakeTotal + 100);
    }
  };

  // When state switcher selects "save-error", automatically demonstrate one switch reverting
  useEffect(() => {
    if (simulateErrorTrigger > 0) {
      void handlePreferenceChange(
        'captionsDefault',
        !optimisticPrefs.captionsDefault,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulateErrorTrigger]);

  const renderStatusIndicator = (key: PreferenceKey) => {
    const status = rowStatus[key];
    return (
      <div
        className="w-[16px] h-[16px] flex items-center justify-center shrink-0"
        aria-live="polite"
      >
        <AnimatePresence mode="wait">
          {status === 'saving' && (
            <motion.span
              key="saving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: dur.dur2, ease: ease.out }}
              className="inline-flex items-center justify-center text-[var(--cream-60)]"
              aria-label="saving preference"
            >
              <Loader2
                size={12}
                strokeWidth={1.5}
                className="animate-spin"
                aria-hidden="true"
              />
            </motion.span>
          )}
          {status === 'saved' && (
            <motion.span
              key="saved"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: dur.dur3, ease: ease.out }}
              className="inline-flex items-center justify-center text-[var(--cream-60)]"
              aria-label="saved"
            >
              <Check size={14} strokeWidth={1.5} aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="divide-y divide-[var(--line)]">
      {/* Row 1: default aspect segmented control */}
      <div
        className="flex items-center justify-between gap-[var(--space-16)] py-[var(--space-8)]"
        style={{ minHeight: 'var(--h-48)' }}
      >
        <div className="min-w-0">
          <div
            id="label-default-aspect"
            className="t-13 text-[var(--cream-100)]"
          >
            default aspect
          </div>
        </div>

        <div className="flex items-center gap-[var(--space-8)] shrink-0">
          {renderStatusIndicator('defaultAspect')}

          <motion.div
            key={`shake-aspect-${shakeCount.defaultAspect}`}
            animate={
              shakeCount.defaultAspect > 0
                ? effectiveReduceMotion
                  ? { opacity: [0.5, 1] }
                  : { x: [0, -4, 4, -4, 4, -4, 4, 0] }
                : { x: 0, opacity: 1 }
            }
            transition={{
              duration: effectiveReduceMotion
                ? dur.dur2
                : durMs.shakeTotal / 1000,
              ease: ease.inOut,
            }}
            role="radiogroup"
            aria-labelledby="label-default-aspect"
            className="inline-flex items-center p-[var(--space-2)] rounded-[var(--r-8)] bg-[var(--ink-2)] border border-[var(--line)]"
            style={{ height: 'var(--h-32)' }}
          >
            {ASPECT_OPTIONS.map((aspect) => {
              const isSelected = optimisticPrefs.defaultAspect === aspect;
              return (
                <button
                  key={aspect}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    if (!isSelected) {
                      void handlePreferenceChange('defaultAspect', aspect);
                    }
                  }}
                  className={`relative px-[var(--space-8)] h-[var(--h-28)] rounded-[var(--r-6)] t-12 cursor-pointer transition-colors duration-[var(--dur-1)] ${
                    isSelected
                      ? 'text-[var(--cream-100)]'
                      : 'text-[var(--cream-60)] hover:text-[var(--cream-100)]'
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="default-aspect-active-pill"
                      transition={
                        effectiveReduceMotion
                          ? { duration: dur.dur2, ease: ease.out }
                          : spring.snappy
                      }
                      className="absolute inset-0 rounded-[var(--r-6)] bg-[var(--ink-4)]"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10">{aspect}</span>
                </button>
              );
            })}
          </motion.div>
        </div>
      </div>

      {/* Rows 2-5: Switches */}
      {SWITCH_ROWS.map((row) => {
        const isChecked = optimisticPrefs[row.key];
        const shakes = shakeCount[row.key];
        const labelId = `pref-label-${row.key}`;
        const hintId = row.hint ? `pref-hint-${row.key}` : undefined;

        return (
          <div
            key={row.key}
            className="flex items-center justify-between gap-[var(--space-16)] py-[var(--space-8)]"
            style={{ minHeight: 'var(--h-48)' }}
          >
            <div className="min-w-0">
              <div id={labelId} className="t-13 text-[var(--cream-100)]">
                {row.label}
              </div>
              {row.hint ? (
                <div
                  id={hintId}
                  className="t-12 text-[var(--cream-38)] mt-[var(--space-2)]"
                >
                  {row.hint}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-[var(--space-8)] shrink-0">
              {renderStatusIndicator(row.key)}

              <motion.button
                key={`shake-${row.key}-${shakes}`}
                type="button"
                role="switch"
                aria-checked={isChecked}
                aria-labelledby={labelId}
                aria-describedby={hintId}
                onClick={() => void handlePreferenceChange(row.key, !isChecked)}
                animate={
                  shakes > 0
                    ? effectiveReduceMotion
                      ? { opacity: [0.4, 1] }
                      : { x: [0, -4, 4, -4, 4, -4, 4, 0] }
                    : { x: 0, opacity: 1 }
                }
                transition={{
                  duration: effectiveReduceMotion
                    ? dur.dur2
                    : durMs.shakeTotal / 1000,
                  ease: ease.inOut,
                }}
                className="relative inline-flex items-center rounded-[var(--r-pill)] p-[var(--space-2)] cursor-pointer shrink-0 border-0"
                style={{
                  width: 'var(--w-switch)',
                  height: 'var(--h-switch)',
                  backgroundColor: isChecked
                    ? 'var(--cream-100)'
                    : 'var(--ink-4)',
                  transition: `background-color var(--dur-2) var(--ease-out)`,
                }}
              >
                <motion.span
                  aria-hidden="true"
                  animate={{
                    x: isChecked ? 16 : 0,
                  }}
                  transition={
                    effectiveReduceMotion
                      ? { duration: dur.dur2, ease: ease.out }
                      : spring.snappy
                  }
                  className="block rounded-[var(--r-pill)]"
                  style={{
                    width: 'var(--size-knob)',
                    height: 'var(--size-knob)',
                    backgroundColor: isChecked
                      ? 'var(--ink-0)'
                      : 'var(--cream-60)',
                    transition: `background-color var(--dur-2) var(--ease-out)`,
                  }}
                />
              </motion.button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
