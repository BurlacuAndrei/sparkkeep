import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { LocaleProvider, useLocale, resetActiveLocale } from '..';
import * as api from '../../api';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    getSettings: vi.fn(),
    patchSettings: vi.fn(),
  };
});

function Consumer({ onLocale }: { onLocale: (loc: string, setLoc: (l: any) => void) => void }) {
  const { locale, setLocale } = useLocale();
  onLocale(locale, setLocale);
  return <div data-testid="current-locale">{locale}</div>;
}

describe('LocaleProvider Backend Persistence & Hydration', () => {
  beforeEach(() => {
    localStorage.clear();
    resetActiveLocale();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    resetActiveLocale();
  });

  it('hydrates from backend workspace interface_locale on mount', async () => {
    vi.mocked(api.getSettings).mockResolvedValueOnce({
      ok: true,
      settings: {
        interface_locale: 'fr',
        has_auth_token: false,
        has_llm_key: false,
      },
    });

    let currentLocale = '';
    render(
      <LocaleProvider syncBackend={true}>
        <Consumer onLocale={(l) => { currentLocale = l; }} />
      </LocaleProvider>
    );

    // Initial sync cache is 'en'
    expect(currentLocale).toBe('en');

    // Async hydration updates to 'fr'
    await waitFor(() => {
      expect(currentLocale).toBe('fr');
      expect(localStorage.getItem('sparkkeep_locale')).toBe('fr');
      expect(document.documentElement.lang).toBe('fr');
    });
  });

  it('keeps synchronous local storage cache if server fails or returns default', async () => {
    localStorage.setItem('sparkkeep_locale', 'es');
    vi.mocked(api.getSettings).mockRejectedValueOnce(new Error('offline'));

    let currentLocale = '';
    render(
      <LocaleProvider syncBackend={true}>
        <Consumer onLocale={(l) => { currentLocale = l; }} />
      </LocaleProvider>
    );

    expect(currentLocale).toBe('es');
  });

  it('persists locale changes to both local storage and backend settings', async () => {
    vi.mocked(api.getSettings).mockResolvedValueOnce({
      ok: true,
      settings: {
        interface_locale: 'en',
        has_auth_token: false,
        has_llm_key: false,
      },
    });
    vi.mocked(api.patchSettings).mockResolvedValueOnce({ success: true } as any);

    let setLocFn: (l: any) => void = () => {};
    render(
      <LocaleProvider syncBackend={true}>
        <Consumer onLocale={(_, setL) => { setLocFn = setL; }} />
      </LocaleProvider>
    );

    // Wait for initial mount hydration to complete
    await waitFor(() => {
      expect(api.getSettings).toHaveBeenCalled();
    });

    await act(async () => {
      setLocFn('de');
    });

    expect(localStorage.getItem('sparkkeep_locale')).toBe('de');
    expect(api.patchSettings).toHaveBeenCalledWith({
      interface_locale: 'de',
    });
  });
});
