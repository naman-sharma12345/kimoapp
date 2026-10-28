import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SignInPage from '../features/signin/pages/SignInPage';
import { TopBar } from '../features/account/components/account-page/TopBar';
import { ProfileSection } from '../features/account/components/account-page/ProfileSection';

beforeAll(() => {
  // jsdom has no canvas; the film grain overlay just skips drawing.
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as HTMLCanvasElement['getContext'];
  if (!window.matchMedia)
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  if (!('IntersectionObserver' in window))
    Object.defineProperty(window, 'IntersectionObserver', {
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
});
afterEach(cleanup);

function renderPage(overrides: Partial<Parameters<typeof SignInPage>[0]> = {}) {
  const onContinue = vi.fn(() => new Promise<void>(() => undefined));
  render(
    <SignInPage
      providers={['github', 'google']}
      onContinue={onContinue}
      onSkip={() => undefined}
      onSuccess={() => undefined}
      {...overrides}
    />,
  );
  return { onContinue };
}

describe('sign-in page', () => {
  it('offers every available provider, with one primary button', () => {
    renderPage();
    const github = screen.getByRole('button', { name: 'continue with github' });
    const google = screen.getByRole('button', { name: 'continue with google' });
    expect(github.className).toContain('kimo-btn-primary');
    expect(google.className).toContain('kimo-btn-secondary');
  });

  it('hides a provider the API reports unavailable', () => {
    renderPage({ providers: ['github'] });
    expect(
      screen.queryByRole('button', { name: 'continue with google' }),
    ).toBeNull();
  });

  it('starts only one redirect on a double click', () => {
    const { onContinue } = renderPage();
    const google = screen.getByRole('button', { name: 'continue with google' });
    fireEvent.click(google);
    fireEvent.click(google);
    fireEvent.click(screen.getByRole('button', { name: /github/ }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledWith('google');
  });

  it('shows a calm, provider-specific error exactly once', () => {
    renderPage({
      initialState: 'error',
      error: { kind: 'cancelled', provider: 'google' },
    });
    const message =
      "google sign-in was cancelled. try again when you're ready.";
    expect(screen.getAllByText(message)).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toContain(message);
  });

  it('retries with the provider that failed', () => {
    const { onContinue } = renderPage({
      initialState: 'error',
      error: { kind: 'expired', provider: 'google' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'try again' }));
    expect(onContinue).toHaveBeenCalledWith('google');
  });

  it('resets the "opening…" state when the page comes back from the back/forward cache', () => {
    renderPage();
    fireEvent.click(
      screen.getByRole('button', { name: 'continue with github' }),
    );
    expect(
      screen.getByRole('button', { name: 'opening github…' }),
    ).toBeTruthy();
    const event = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(event, 'persisted', { value: true });
    fireEvent(window, event);
    expect(
      screen.getByRole('button', { name: 'continue with github' }),
    ).toBeTruthy();
  });

  it('renders user text as text, never as markup', () => {
    render(
      <ProfileSection
        user={{
          name: '<img src=x onerror=alert(1)>',
          email: 'a@b.co',
          provider: 'google',
        }}
        onSignOut={() => undefined}
      />,
    );
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText('signed in with google')).toBeTruthy();
  });
});

describe('account top bar', () => {
  it('shows no avatar menu or projects link while signed out', () => {
    render(<TopBar user={null} onSignOut={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'account menu' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'projects' })).toBeNull();
    expect(
      screen.getByRole('link', { name: /kimo/ }).getAttribute('href'),
    ).toBe('/');
  });

  it('shows the menu and a working projects link when signed in', () => {
    render(
      <TopBar
        user={{ name: 'Naman Sharma', email: 'n@example.com' }}
        onSignOut={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'account menu' })).toBeTruthy();
    const projects = screen.getByRole('link', { name: 'projects' });
    expect(fireEvent.click(projects)).toBe(true);
  });
});
