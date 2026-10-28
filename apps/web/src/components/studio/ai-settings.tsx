'use client';
import { useId, useState } from 'react';
import { KeyRound } from 'lucide-react';
import {
  KimoApiError,
  KimoClient,
  aiProviderSchema,
  type AiCredentials,
  type AiProviderId,
} from '@kimo/client';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'google gemini',
  groq: 'groq',
  openrouter: 'openrouter',
  meta: 'meta',
  custom: 'custom (openai-compatible)',
};
export const AI_KEY_NOTE = 'your key stays in this tab only and is never saved';

/** Only the provider and model id (never the key) are remembered. */
const CHOICE = 'kimo.ai.choice.v1';
export function readAiChoice(): { provider: AiProviderId; model: string } {
  try {
    const raw = JSON.parse(localStorage.getItem(CHOICE) ?? '{}') as {
      provider?: unknown;
      model?: unknown;
    };
    const provider = aiProviderSchema.safeParse(raw.provider);
    return {
      provider: provider.success ? provider.data : 'openai',
      model:
        typeof raw.model === 'string' && raw.model.length <= 200
          ? raw.model
          : '',
    };
  } catch {
    return { provider: 'openai', model: '' };
  }
}
function saveAiChoice(provider: AiProviderId, model: string) {
  try {
    localStorage.setItem(CHOICE, JSON.stringify({ provider, model }));
  } catch {
    // Storage may be off; the choice simply isn't remembered.
  }
}

/** The settings are usable once there is a key, a model and, for custom, a URL. */
export function activeAi(value: AiCredentials): AiCredentials | null {
  if (!value.key.trim() || !value.model?.trim()) return null;
  if (value.provider === 'custom' && !value.baseUrl?.trim()) return null;
  return value;
}

export function aiErrorCopy(error: unknown): string {
  const code = error instanceof KimoApiError ? error.code : '';
  const copy: Record<string, string> = {
    ai_key_rejected: 'the provider refused that key. check it and try again.',
    ai_key_invalid: 'that key doesn’t look right.',
    ai_key_missing: 'add your api key first.',
    ai_provider_invalid: 'pick a provider.',
    ai_base_url_invalid: 'use a public https base url.',
    rate_limited: 'that’s a lot of requests. give it a minute.',
    ai_upstream: 'the provider didn’t answer. type a model id instead.',
  };
  return copy[code] ?? 'couldn’t load models. type a model id instead.';
}

/**
 * Bring your own AI key. The key lives only in the parent's React state for
 * this tab: it is never written to storage, cookies or the server's records,
 * and a refresh clears it.
 */
export function AiSettings({
  value,
  onChange,
}: {
  value: AiCredentials;
  onChange: (next: AiCredentials) => void;
}) {
  const id = useId();
  const [models, setModels] = useState<{ id: string; name?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const active = activeAi(value);
  const set = (patch: Partial<AiCredentials>) => {
    const next = { ...value, ...patch };
    if ('provider' in patch || 'model' in patch)
      saveAiChoice(next.provider, next.model ?? '');
    onChange(next);
  };
  const loadModels = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await new KimoClient().aiModels(value);
      setModels(result.models);
      if (!result.models.length)
        setError('no models came back. type a model id instead.');
      else if (
        !value.model ||
        !result.models.some((model) => model.id === value.model)
      )
        set({ model: result.models[0]?.id ?? '' });
    } catch (caught) {
      setModels([]);
      setError(aiErrorCopy(caught));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Popover
      label="ai settings"
      trigger={
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon={KeyRound}
          aria-label="ai settings"
          tooltip="ai settings"
          data-ai-key-active={active ? 'true' : undefined}
        />
      }
    >
      <div className="ai-settings" data-ai-settings>
        <p className="studio-heading">ai settings</p>
        <label className="editor-field" htmlFor={`${id}-provider`}>
          provider
          <select
            id={`${id}-provider`}
            value={value.provider}
            onChange={(event) => {
              setModels([]);
              setError('');
              set({
                provider: aiProviderSchema.parse(event.target.value),
                model: '',
              });
            }}
          >
            {aiProviderSchema.options.map((provider) => (
              <option key={provider} value={provider}>
                {AI_PROVIDER_LABELS[provider]}
              </option>
            ))}
          </select>
        </label>
        {value.provider === 'custom' ? (
          <label className="editor-field" htmlFor={`${id}-base`}>
            base url
            <input
              id={`${id}-base`}
              type="url"
              inputMode="url"
              placeholder="https://"
              autoComplete="off"
              spellCheck={false}
              value={value.baseUrl ?? ''}
              onChange={(event) => set({ baseUrl: event.target.value })}
            />
          </label>
        ) : null}
        <label className="editor-field" htmlFor={`${id}-key`}>
          api key
          <input
            id={`${id}-key`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            value={value.key}
            onChange={(event) => set({ key: event.target.value })}
          />
        </label>
        <Button
          size="xs"
          variant="secondary"
          loading={loading}
          disabled={!value.key.trim() || loading}
          onClick={() => void loadModels()}
        >
          load models
        </Button>
        {models.length ? (
          <label className="editor-field" htmlFor={`${id}-model`}>
            model
            <select
              id={`${id}-model`}
              value={value.model ?? ''}
              onChange={(event) => set({ model: event.target.value })}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name ?? model.id}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="editor-field" htmlFor={`${id}-manual`}>
          model id
          <input
            id={`${id}-manual`}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="or type one"
            value={value.model ?? ''}
            onChange={(event) => set({ model: event.target.value })}
          />
        </label>
        {error ? (
          <p className="ai-settings-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="ai-settings-note" role="status">
          {active
            ? `using your key · ${active.model ?? ''}`
            : 'using kimo’s ai until you add a key and a model'}
        </p>
        <p className="ai-settings-note">{AI_KEY_NOTE}</p>
        {value.key ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setModels([]);
              set({ key: '' });
            }}
          >
            forget key
          </Button>
        ) : null}
      </div>
    </Popover>
  );
}
