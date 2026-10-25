import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntegrationsTab } from './IntegrationsTab';
import * as api from '../../api';
import { LocaleProvider } from '../../i18n';

const render = (ui: ReactElement) => rtlRender(<LocaleProvider locale="en">{ui}</LocaleProvider>);

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    syncObsidian: vi.fn().mockResolvedValue({ written: 12, vault_path: '/vault' }),
    testSinkConnection: vi.fn().mockResolvedValue({ ok: true, success: true, message: 'Vault directory is accessible and writable' }),
    testWebhook: vi.fn().mockResolvedValue({ ok: true, status_code: 200 }),
    getSettings: vi.fn().mockResolvedValue({ ok: true, settings: { obsidian_vault_path: '/vault' } }),
  };
});

describe('IntegrationsTab Ecosystem Tools', () => {
  it('groups the integration sections under four headed, labelled categories', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    const groups = screen.getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-labelledby'))).toEqual([
      'settings-group-knowledge-sinks',
      'settings-group-inbound-capture-tools',
      'settings-group-automation-testing',
      'settings-group-export-syndication',
    ]);

    const expected: Array<{ heading: string; sections: string[] }> = [
      {
        heading: 'Knowledge Sinks',
        sections: ['Obsidian Vault Export', 'Notion Knowledge Sink', 'Joplin Knowledge Sink'],
      },
      {
        heading: 'Inbound Capture Tools',
        sections: [
          'Official Browser Extension (Chrome & Firefox)',
          'Browser Bookmarklet',
          'Apple iOS Shortcut & Share Sheet',
          'Raycast Extension / Script Command',
          'Model Context Protocol (MCP)',
          'Universal Inbound Capture API',
        ],
      },
      {
        heading: 'Automation & Testing',
        sections: ['Webhook Test Triggers', 'Client App Shortcuts'],
      },
      {
        heading: 'Export & Syndication',
        sections: ['Data Sovereignty & Full Library Export', 'Outbox RSS Feed'],
      },
    ];

    for (const { heading, sections } of expected) {
      expect(screen.getByRole('heading', { name: heading })).toBeDefined();
      const group = screen.getByRole('group', { name: heading });
      for (const title of sections) {
        expect(within(group).getByText(title)).toBeDefined();
      }
    }
  });

  it('renders Official Browser Extension, Browser Bookmarklet, iOS Shortcut, Raycast, and MCP sections', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /Official Browser Extension \(Chrome & Firefox\)/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /1-Click Pair Extension/i })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Browser Bookmarklet' })).toBeDefined();
    expect(screen.getByText(/⚡ Save to Sparkkeep/i)).toBeDefined();
    expect(screen.getByRole('heading', { name: /Apple iOS Shortcut & Share Sheet/i })).toBeDefined();
    expect(screen.getByRole('heading', { name: /Raycast Extension \/ Script Command/i })).toBeDefined();
    expect(screen.getByRole('heading', { name: /Model Context Protocol \(MCP\)/i })).toBeDefined();
  });

  it('dispatches pairing handshake postMessage when clicking 1-Click Pair Extension', async () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    const showToast = vi.fn();
    render(<IntegrationsTab showToast={showToast} authToken="test-master-token" />);

    const pairBtn = screen.getByRole('button', { name: /1-Click Pair Extension/i });
    fireEvent.click(pairBtn);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SPARKKEEP_PAIR_EXTENSION',
        token: 'test-master-token',
      }),
      '*'
    );
  });

  it('toggles extension setup guide on button click', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    const guideBtn = screen.getByRole('button', { name: /Setup Guide/i });
    fireEvent.click(guideBtn);

    expect(screen.getByText(/How to load the extension in your browser:/i)).toBeDefined();
    expect(screen.getByText(/chrome:\/\/extensions/i)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Hide Guide/i }));
    expect(screen.queryByText(/How to load the extension in your browser:/i)).toBeNull();
  });

  it('triggers obsidian sync API when clicked', async () => {
    const showToast = vi.fn();
    render(<IntegrationsTab showToast={showToast} />);

    const syncBtn = screen.getByRole('button', { name: /Sync Vault Now/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(api.syncObsidian).toHaveBeenCalled();
    });
  });

  it('copies bookmarklet code to clipboard and displays toast', () => {
    const showToast = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });

    render(<IntegrationsTab showToast={showToast} />);

    const copyBtn = screen.getByRole('button', { name: /Copy Bookmarklet Code/i });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('javascript:(function()')
    );
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Bookmarklet code copied'));
  });

  it('triggers obsidian connection test when Test Connection is clicked', async () => {
    const showToast = vi.fn();
    render(<IntegrationsTab showToast={showToast} />);

    // Find the Obsidian section's Test Connection button by looking near the Obsidian heading
    const obsidianSection = screen
      .getByRole('heading', { name: 'Obsidian Vault Export' })
      .closest('.settings-section') as HTMLElement;
    const testBtn = within(obsidianSection).getByRole('button', { name: /Test Connection/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(api.testSinkConnection).toHaveBeenCalledWith('obsidian', expect.any(Object));
    });
  });
});

describe('IntegrationsTab collapsible sections', () => {
  const COLLAPSED_KEY = 'sparkkeep_integrations_collapsed';

  const toggleFor = (title: string) => screen.getByRole('button', { name: `Toggle ${title} section` });

  const bodyFor = (toggle: HTMLElement) =>
    document.getElementById(toggle.getAttribute('aria-controls') ?? '') as HTMLElement;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', window.location.pathname);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('renders all 13 sections expanded by default with wired toggle controls', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    const bodies = document.querySelectorAll('.settings-section-body');
    expect(bodies).toHaveLength(13);
    bodies.forEach((body) => expect((body as HTMLElement).hidden).toBe(false));

    const toggles = screen.getAllByRole('button', { name: /^Toggle .+ section$/ });
    expect(toggles).toHaveLength(13);
    toggles.forEach((toggle) => {
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(bodyFor(toggle)).not.toBeNull();
      expect(bodyFor(toggle).hidden).toBe(false);
    });
  });

  it('collapses a section body, keeps the header, and sets aria-expanded="false"', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    const toggle = toggleFor('Joplin Knowledge Sink');
    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(bodyFor(toggle).hidden).toBe(true);
    expect(screen.getByRole('heading', { name: 'Joplin Knowledge Sink' })).toBeDefined();
  });

  it('re-expands a collapsed section', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    const toggle = toggleFor('Joplin Knowledge Sink');
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(bodyFor(toggle).hidden).toBe(false);
  });

  it('keeps a collapsed section collapsed after unmount and remount', () => {
    const { unmount } = render(<IntegrationsTab showToast={vi.fn()} />);
    fireEvent.click(toggleFor('Joplin Knowledge Sink'));
    expect(toggleFor('Joplin Knowledge Sink').getAttribute('aria-expanded')).toBe('false');

    unmount();
    render(<IntegrationsTab showToast={vi.fn()} />);

    const toggle = toggleFor('Joplin Knowledge Sink');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(bodyFor(toggle).hidden).toBe(true);
  });

  it('expands the section named in the URL hash on mount and clears the hash', () => {
    window.sessionStorage.setItem(COLLAPSED_KEY, JSON.stringify(['joplin']));
    window.history.replaceState(null, '', '#integration-joplin');

    render(<IntegrationsTab showToast={vi.fn()} />);

    const toggle = toggleFor('Joplin Knowledge Sink');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(bodyFor(toggle).hidden).toBe(false);
    expect(window.location.hash).toBe('');
  });

  it('keeps the stored collapse value when the URL hash expands a section in memory', () => {
    window.sessionStorage.setItem(COLLAPSED_KEY, JSON.stringify(['joplin']));
    window.history.replaceState(null, '', '#integration-joplin');

    render(<IntegrationsTab showToast={vi.fn()} />);

    expect(toggleFor('Joplin Knowledge Sink').getAttribute('aria-expanded')).toBe('true');
    expect(JSON.parse(window.sessionStorage.getItem(COLLAPSED_KEY) ?? 'null')).toEqual(['joplin']);
  });

  it('ignores an unknown hash slug and leaves every section expanded', () => {
    window.history.replaceState(null, '', '#integration-bogus');

    expect(() => render(<IntegrationsTab showToast={vi.fn()} />)).not.toThrow();

    screen
      .getAllByRole('button', { name: /^Toggle .+ section$/ })
      .forEach((toggle) => expect(toggle.getAttribute('aria-expanded')).toBe('true'));
  });

  it('exposes each section toggle as an enabled, focusable native button', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    const toggle = toggleFor('Webhook Test Triggers');
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('type')).toBe('button');
    expect((toggle as HTMLButtonElement).disabled).toBe(false);

    toggle.focus();
    expect(document.activeElement).toBe(toggle);
  });

  it.each([
    ['corrupt JSON', '{not json'],
    ['a non-array payload', '{"a":1}'],
    ['an array with an unknown slug', JSON.stringify(['not-a-section'])],
  ])('falls back to all sections expanded when storage holds %s', (_label, raw) => {
    window.sessionStorage.setItem(COLLAPSED_KEY, raw);

    render(<IntegrationsTab showToast={vi.fn()} />);

    const toggles = screen.getAllByRole('button', { name: /^Toggle .+ section$/ });
    expect(toggles).toHaveLength(13);
    toggles.forEach((toggle) => expect(toggle.getAttribute('aria-expanded')).toBe('true'));
  });

  it('still renders and toggles in memory when sessionStorage.setItem throws', () => {
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    render(<IntegrationsTab showToast={vi.fn()} />);

    const toggle = toggleFor('Outbox RSS Feed');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(bodyFor(toggle).hidden).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(bodyFor(toggle).hidden).toBe(false);
  });
});

describe('IntegrationsTab section index', () => {
  const COLLAPSED_KEY = 'sparkkeep_integrations_collapsed';

  const indexNav = () => screen.getByRole('navigation', { name: 'Integration sections' });
  const indexEntry = (title: string) => within(indexNav()).getByRole('button', { name: title });
  const toggleFor = (title: string) => screen.getByRole('button', { name: `Toggle ${title} section` });

  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', window.location.pathname);
    scrollIntoView = vi.fn();
    // jsdom does not implement scrollIntoView.
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    window.sessionStorage.clear();
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('renders 13 index entries under the accessible nav name', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    const entries = within(indexNav()).getAllByRole('button');
    expect(entries).toHaveLength(13);
    expect(entries.every((entry) => entry.tagName === 'BUTTON')).toBe(true);
    expect(indexEntry('Official Browser Extension (Chrome & Firefox)')).toBeDefined();
    expect(indexEntry('Client App Shortcuts')).toBeDefined();
  });

  it('expands a collapsed section, activates it, scrolls and focuses its heading', () => {
    window.sessionStorage.setItem(COLLAPSED_KEY, JSON.stringify(['joplin']));
    render(<IntegrationsTab showToast={vi.fn()} />);

    const toggle = toggleFor('Joplin Knowledge Sink');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(indexEntry('Joplin Knowledge Sink'));

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')?.hidden).toBe(false);
    expect(indexEntry('Joplin Knowledge Sink').getAttribute('aria-current')).toBe('true');
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(JSON.parse(window.sessionStorage.getItem(COLLAPSED_KEY) ?? '[]')).not.toContain('joplin');

    const heading = screen.getByRole('heading', { name: 'Joplin Knowledge Sink' });
    expect(document.activeElement).toBe(heading);
  });

  it('scrolls to an already-expanded section without changing its expanded state', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    const toggle = toggleFor('Browser Bookmarklet');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(indexEntry('Browser Bookmarklet'));

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(indexEntry('Browser Bookmarklet').getAttribute('aria-current')).toBe('true');
  });

  it('keeps exactly one active index entry after navigating', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    fireEvent.click(indexEntry('Webhook Test Triggers'));
    fireEvent.click(indexEntry('Outbox RSS Feed'));

    const active = within(indexNav())
      .getAllByRole('button')
      .filter((entry) => entry.getAttribute('aria-current') === 'true');

    expect(active).toHaveLength(1);
    expect(active[0].textContent).toBe('Outbox RSS Feed');
  });

  it('carries the class and aria contract the sticky surface bar depends on', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    // jsdom does not resolve the sticky CSS rule, so assert the hook that carries it.
    const nav = indexNav();
    expect(nav.classList.contains('settings-section-index')).toBe(true);
    expect(nav.getAttribute('aria-label')).toBe('Integration sections');
    expect(nav.closest('.settings-group')).toBeNull();
  });

  it('activates index entries on click through native buttons', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    const entry = indexEntry('Model Context Protocol (MCP)');
    expect(entry.tagName).toBe('BUTTON');
    entry.focus();
    expect(document.activeElement).toBe(entry);

    fireEvent.click(entry);

    expect(entry.getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Model Context Protocol (MCP)' })
    );
  });
});

describe('IntegrationsTab section observer', () => {
  type ObserverCallback = (entries: IntersectionObserverEntry[]) => void;

  class MockIntersectionObserver {
    static instances: MockIntersectionObserver[] = [];
    readonly observe = vi.fn();
    readonly disconnect = vi.fn();
    readonly callback: ObserverCallback;

    constructor(callback: ObserverCallback) {
      this.callback = callback;
      MockIntersectionObserver.instances.push(this);
    }
  }

  const originalObserver = (window as { IntersectionObserver?: typeof IntersectionObserver })
    .IntersectionObserver;

  const indexEntry = (title: string) =>
    within(screen.getByRole('navigation', { name: 'Integration sections' })).getByRole('button', {
      name: title,
    });

  const entryFor = (slug: string, isIntersecting: boolean): IntersectionObserverEntry => {
    const target = document.getElementById(`integration-${slug}`);
    if (!target) throw new Error(`missing section element for ${slug}`);
    return { target, isIntersecting } as unknown as IntersectionObserverEntry;
  };

  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    window.sessionStorage.clear();
    window.history.replaceState(null, '', window.location.pathname);
    window.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    if (originalObserver) {
      window.IntersectionObserver = originalObserver;
    } else {
      Reflect.deleteProperty(window, 'IntersectionObserver');
    }
    window.sessionStorage.clear();
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('follows the intersecting section and disconnects on unmount', () => {
    const { unmount } = render(<IntegrationsTab showToast={vi.fn()} />);

    const observer = MockIntersectionObserver.instances[0];
    expect(observer).toBeDefined();
    expect(observer.observe).toHaveBeenCalledTimes(13);

    act(() => observer.callback([entryFor('obsidian', true)]));
    expect(indexEntry('Obsidian Vault Export').getAttribute('aria-current')).toBe('true');

    act(() => observer.callback([entryFor('obsidian', false), entryFor('joplin', true)]));
    expect(indexEntry('Joplin Knowledge Sink').getAttribute('aria-current')).toBe('true');
    expect(indexEntry('Obsidian Vault Export').getAttribute('aria-current')).toBeNull();

    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('IntegrationsTab category groups and visual hierarchy', () => {
  it('renders visual direction badges and distinct icons for all 4 categories', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    expect(screen.getByText('Knowledge Sinks', { selector: '.settings-group-badge' })).toBeDefined();
    expect(screen.getByText('Inbound', { selector: '.settings-group-badge' })).toBeDefined();
    expect(screen.getByText('Automation', { selector: '.settings-group-badge' })).toBeDefined();
    expect(screen.getByText('Outbound', { selector: '.settings-group-badge' })).toBeDefined();

    const inboundGroup = screen.getByRole('group', { name: 'Inbound Capture Tools' });
    expect(inboundGroup.classList.contains('settings-group--inbound')).toBe(true);

    const sinksGroup = screen.getByRole('group', { name: 'Knowledge Sinks' });
    expect(sinksGroup.classList.contains('settings-group--sinks')).toBe(true);
  });

  it('collapses and re-expands an entire category group using group toggle', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: 'Toggle Knowledge Sinks category' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const content = document.getElementById('settings-group-content-knowledge-sinks');
    expect(content?.hidden).toBe(false);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(content?.hidden).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(content?.hidden).toBe(false);
  });

  it('auto-expands collapsed category group when navigating from section index anchor pill', () => {
    render(<IntegrationsTab showToast={vi.fn()} />);

    const groupToggle = screen.getByRole('button', { name: 'Toggle Inbound Capture Tools category' });
    fireEvent.click(groupToggle);
    const content = document.getElementById('settings-group-content-inbound-capture-tools');
    expect(content?.hidden).toBe(true);

    const nav = screen.getByRole('navigation', { name: 'Integration sections' });
    const pill = within(nav).getByRole('button', { name: 'Browser Bookmarklet' });
    fireEvent.click(pill);

    expect(content?.hidden).toBe(false);
    expect(pill.getAttribute('aria-current')).toBe('true');
  });
});

