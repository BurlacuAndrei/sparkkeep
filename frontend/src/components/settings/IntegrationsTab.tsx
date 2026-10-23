import React, { useState, useEffect, useRef } from 'react';
import {
  FolderSync,
  Send,
  Terminal,
  AlertCircle,
  CheckCircle2,
  Bookmark,
  Smartphone,
  Command,
  Cpu,
  Copy,
  Check,
  Globe,
  Sparkles,
  Download,
  FileArchive,
  FileCode,
  BookOpen,
  Target,
  CheckSquare,
  GitBranch,
  RefreshCw,
  Rss,
  RotateCcw,
  Link2,
  Eye,
  EyeOff,
  Database,
  Monitor,
  HardDrive,
  Save,
  Brain,
  Inbox,
  Library,
  Share2,
  FlaskConical,
  ChevronDown,
} from 'lucide-react';
import * as api from '../../api';
import { useLocale } from '../../i18n';
import type { TranslationKey } from '../../i18n';

export interface IntegrationsTabProps {
  showToast: (msg: string) => void;
  authToken?: string;
  initialVaultPath?: string;
  onVaultPathChange?: (path: string) => void;
}

// Ordered by adoption: most popular integrations first.
const INTEGRATION_SECTIONS = [
  { slug: 'obsidian', titleKey: 'settings.integrations.sections.obsidian' },
  { slug: 'notion', titleKey: 'settings.integrations.sections.notion' },
  { slug: 'joplin', titleKey: 'settings.integrations.sections.joplin' },
  { slug: 'browser-extension', titleKey: 'settings.integrations.sections.browserExtension' },
  { slug: 'bookmarklet', titleKey: 'settings.integrations.sections.bookmarklet' },
  { slug: 'ios-shortcut', titleKey: 'settings.integrations.sections.iosShortcut' },
  { slug: 'raycast', titleKey: 'settings.integrations.sections.raycast' },
  { slug: 'mcp', titleKey: 'settings.integrations.sections.mcp' },
  { slug: 'capture-api', titleKey: 'settings.integrations.sections.captureApi' },
  { slug: 'webhook', titleKey: 'settings.integrations.sections.webhook' },
  { slug: 'client-apps', titleKey: 'settings.integrations.sections.clientApps' },
  { slug: 'library-export', titleKey: 'settings.integrations.sections.libraryExport' },
  { slug: 'outbox-feed', titleKey: 'settings.integrations.sections.outboxFeed' },
] as const satisfies ReadonlyArray<{ slug: string; titleKey: TranslationKey }>;

type SectionSlug = (typeof INTEGRATION_SECTIONS)[number]['slug'];

const COLLAPSED_STORAGE_KEY = 'sparkkeep_integrations_collapsed';
const SECTION_ID_PREFIX = 'integration-';
const SECTION_HASH_PREFIX = `#${SECTION_ID_PREFIX}`;

const isSectionSlug = (value: string): value is SectionSlug =>
  INTEGRATION_SECTIONS.some((section) => section.slug === value);

const sectionDefinition = (slug: SectionSlug) =>
  INTEGRATION_SECTIONS.find((section) => section.slug === slug);

const readCollapsedSections = (): Set<SectionSlug> => {
  try {
    const raw = window.sessionStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((value): value is SectionSlug => typeof value === 'string' && isSectionSlug(value))
    );
  } catch {
    return new Set();
  }
};

const writeCollapsedSections = (collapsed: Set<SectionSlug>) => {
  try {
    window.sessionStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Storage can be unavailable (private mode); collapse state stays in memory.
  }
};

interface CollapsibleSectionProps {
  slug: SectionSlug;
  expanded: boolean;
  onToggle: (slug: SectionSlug) => void;
  style?: React.CSSProperties;
  header: React.ReactNode;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  slug,
  expanded,
  onToggle,
  style,
  header,
  children,
}) => {
  const { t } = useLocale();
  const bodyId = `integration-body-${slug}`;
  const definition = sectionDefinition(slug);
  const title = definition ? t(definition.titleKey) : slug;
  return (
    <div
      className={`settings-section${expanded ? '' : ' is-collapsed'}`}
      style={style}
      id={`${SECTION_ID_PREFIX}${slug}`}
    >
      <div className="settings-section-head">
        <div className="settings-section-head-main">{header}</div>
        <button
          type="button"
          className="settings-section-toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={t('settings.integrations.toggle', { section: title })}
          onClick={() => onToggle(slug)}
        >
          <ChevronDown size={18} className="settings-section-chevron" aria-hidden="true" />
        </button>
      </div>
      <div id={bodyId} className="settings-section-body" hidden={!expanded}>
        {children}
      </div>
    </div>
  );
};

export const IntegrationsTab: React.FC<IntegrationsTabProps> = ({
  showToast,
  authToken,
  initialVaultPath,
  onVaultPathChange,
}) => {
  const { t } = useLocale();
  // Extension State & Pairing
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);
  const [pairSuccess, setPairSuccess] = useState(false);

  // Obsidian Vault state
  const [vaultPath, setVaultPath] = useState('');
  const [obsidianAutoExport, setObsidianAutoExport] = useState(false);
  const [syncingObsidian, setSyncingObsidian] = useState(false);
  const [testingObsidian, setTestingObsidian] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Webhook Test Trigger state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{ success: boolean; message: string } | null>(null);

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Client App Shortcuts state
  const [clientIntentsEnabled, setClientIntentsEnabled] = useState<string>('obsidian,todoist');
  const [githubRepo, setGithubRepo] = useState<string>('');
  const [savingIntents, setSavingIntents] = useState<string | null>(null);

  // Outbox RSS Feed state
  const [outboxToken, setOutboxToken] = useState<string>('');
  const [feedUrl, setFeedUrl] = useState<string>('');
  const [showFullToken, setShowFullToken] = useState(false);
  const [loadingToken, setLoadingToken] = useState(false);
  const [regeneratingToken, setRegeneratingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Joplin Knowledge Sink state
  const [joplinMode, setJoplinMode] = useState<"server" | "clipper">("clipper");
  const [joplinBaseUrl, setJoplinBaseUrl] = useState<string>('http://127.0.0.1:41184');
  const [joplinToken, setJoplinToken] = useState<string>('');
  const [joplinEmail, setJoplinEmail] = useState<string>('');
  const [joplinPassword, setJoplinPassword] = useState<string>('');
  const [joplinAutoExport, setJoplinAutoExport] = useState(false);
  const [testingJoplin, setTestingJoplin] = useState(false);
  const [syncingJoplin, setSyncingJoplin] = useState(false);
  const [joplinTestResult, setJoplinTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [joplinSyncResult, setJoplinSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  // Notion Knowledge Sink state
  const [notionToken, setNotionToken] = useState<string>('');
  const [notionDatabaseId, setNotionDatabaseId] = useState<string>('');
  const [notionAutoExport, setNotionAutoExport] = useState(false);
  const [testingNotion, setTestingNotion] = useState(false);
  const [syncingNotion, setSyncingNotion] = useState(false);
  const [notionTestResult, setNotionTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [notionSyncResult, setNotionSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  // Collapsible sections: collapsed slugs persist for the browser session.
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionSlug>>(readCollapsedSections);
  const [activeSection, setActiveSection] = useState<SectionSlug | null>(null);
  const indexNavRef = useRef<HTMLElement | null>(null);

  const setSectionExpanded = (slug: SectionSlug, expanded: boolean) => {
    const next = new Set(collapsedSections);
    if (expanded) {
      next.delete(slug);
    } else {
      next.add(slug);
    }
    setCollapsedSections(next);
    writeCollapsedSections(next);
  };

  const toggleSection = (slug: SectionSlug) => {
    setSectionExpanded(slug, collapsedSections.has(slug));
  };

  // Section headings are focus targets for the section index.
  const headingRefs = useRef<Partial<Record<SectionSlug, HTMLHeadingElement | null>>>({});
  const headingProps = (slug: SectionSlug) => ({
    className: 'settings-section-title',
    tabIndex: -1,
    ref: (el: HTMLHeadingElement | null) => {
      headingRefs.current[slug] = el;
    },
  });

  const activateSection = (slug: SectionSlug) => {
    if (collapsedSections.has(slug)) {
      setSectionExpanded(slug, true);
    }
    setActiveSection(slug);
    const target = document.getElementById(`${SECTION_ID_PREFIX}${slug}`);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const heading = headingRefs.current[slug];
    if (heading && typeof heading.focus === 'function') {
      // preventScroll keeps the smooth scroll above; CSS scroll-margin-top clears the sticky bar.
      heading.focus({ preventScroll: true });
    }
  };

  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith(SECTION_HASH_PREFIX)) return;
    const slug = hash.slice(SECTION_HASH_PREFIX.length);
    if (!isSectionSlug(slug)) return;
    setActiveSection(slug);
    // Expand in memory only: stored collapse state stays as the user left it.
    setCollapsedSections((prev) => {
      if (!prev.has(slug)) return prev;
      const next = new Set(prev);
      next.delete(slug);
      return next;
    });
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      // jsdom/SSR may reject replaceState; leaving the hash is harmless.
    }
  }, []);
  /* oxlint-enable react/set-state-in-effect */

  // Follow the section in view. Without IntersectionObserver (jsdom, old browsers)
  // the last activated section stays active and no scroll tracking happens.
  useEffect(() => {
    if (typeof window.IntersectionObserver !== 'function') return;
    const visible = new Set<SectionSlug>();
    const observer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const slug = entry.target.id.slice(SECTION_ID_PREFIX.length);
          if (!isSectionSlug(slug)) return;
          if (entry.isIntersecting) {
            visible.add(slug);
          } else {
            visible.delete(slug);
          }
        });
        const next = INTEGRATION_SECTIONS.find((section) => visible.has(section.slug));
        if (next) setActiveSection(next.slug);
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    INTEGRATION_SECTIONS.forEach(({ slug }) => {
      const element = document.getElementById(`${SECTION_ID_PREFIX}${slug}`);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  // Scroll the active chip horizontally into view so it's always visible.
  useEffect(() => {
    if (!activeSection || !indexNavRef.current) return;
    const chip = indexNavRef.current.querySelector<HTMLButtonElement>(
      `button[aria-current="true"]`
    );
    if (chip && typeof chip.scrollIntoView === 'function') {
      chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeSection]);

  const copyToClipboard = (text: string, id: string, label: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      showToast(t('settings.integrations.copyToast', { label }));
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.source !== window || !e.data) return;
      if (e.data.type === 'SPARKKEEP_EXTENSION_PONG' || e.data.type === 'SPARKKEEP_EXTENSION_READY') {
        setExtensionInstalled(true);
      }
      if (e.data.type === 'SPARKKEEP_PAIR_ACK') {
        if (e.data.ok) {
          setPairSuccess(true);
          showToast(t('settings.integrations.browser.pairedToast'));
          setTimeout(() => setPairSuccess(false), 4000);
        } else {
          showToast(
            t('settings.integrations.browser.pairFailed', {
              error: e.data.error || t('settings.integrations.browser.unknownError'),
            })
          );
        }
      }
    };
    window.addEventListener('message', handleMessage);
    window.postMessage({ type: 'SPARKKEEP_EXTENSION_PING' }, '*');
    return () => window.removeEventListener('message', handleMessage);
  }, [showToast, t]);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';

  const handlePairExtension = () => {
    window.postMessage({
      type: 'SPARKKEEP_PAIR_EXTENSION',
      serverUrl: currentOrigin,
      token: authToken || '',
    }, '*');
    setTimeout(() => {
      if (!extensionInstalled) {
        showToast(t('settings.integrations.browser.handshake'));
      }
    }, 500);
  };

  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    if (initialVaultPath !== undefined) {
      setVaultPath(initialVaultPath);
    }
  }, [initialVaultPath]);
  /* oxlint-enable react/set-state-in-effect */

  // Load client intents and GitHub repo from settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await api.getSettings();
        if (res.ok && res.settings) {
          if (res.settings.client_intents_enabled) {
            setClientIntentsEnabled(res.settings.client_intents_enabled);
          }
          if (res.settings.github_repo) {
            setGithubRepo(res.settings.github_repo);
          }
          if (res.settings.joplin_mode) {
            setJoplinMode(res.settings.joplin_mode);
          }
          if (res.settings.joplin_base_url) {
            setJoplinBaseUrl(res.settings.joplin_base_url);
          }
          if (res.settings.joplin_token) {
            setJoplinToken(res.settings.joplin_token);
          }
          if (res.settings.joplin_email) {
            setJoplinEmail(res.settings.joplin_email);
          }
          if (res.settings.joplin_password) {
            setJoplinPassword(res.settings.joplin_password);
          }
          if (res.settings.joplin_auto_export !== undefined) {
            setJoplinAutoExport(res.settings.joplin_auto_export);
          }
          if (res.settings.notion_token) {
            setNotionToken(res.settings.notion_token);
          }
          if (res.settings.notion_database_id) {
            setNotionDatabaseId(res.settings.notion_database_id);
          }
          if (res.settings.notion_auto_export !== undefined) {
            setNotionAutoExport(res.settings.notion_auto_export);
          }
          if (res.settings.obsidian_auto_export !== undefined) {
            setObsidianAutoExport(res.settings.obsidian_auto_export);
          }
        }
      } catch {
        // Ignore errors, use defaults
      }
    };
    loadSettings();
  }, []);

  const handleTestObsidian = async () => {
    setTestingObsidian(true);
    setTestResult(null);
    try {
      if (vaultPath.trim()) {
        await api.patchSettings({ obsidian_vault_path: vaultPath.trim() }).catch(() => {});
      }
      const res = await api.testSinkConnection('obsidian', {
        vault_path: vaultPath.trim() || undefined,
      });
      if (res.ok && res.success) {
        const msg = res.message || t('settings.integrations.obsidian.testSuccessFallback');
        setTestResult({ success: true, message: `✅ ${msg}` });
        showToast(msg);
      } else {
        const msg = res.message || t('settings.integrations.obsidian.testFailedFallback');
        setTestResult({ success: false, message: `❌ ${msg}` });
        showToast(t('settings.integrations.testFailed', { message: msg }));
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setTestResult({
        success: false,
        message: `❌ ${t('settings.integrations.obsidian.testError', { message: errMsg })}`,
      });
      showToast(t('settings.integrations.obsidian.testError', { message: errMsg }));
    } finally {
      setTestingObsidian(false);
    }
  };

  const handleSyncObsidian = async () => {
    setSyncingObsidian(true);
    setLastSyncResult(null);
    try {
      if (vaultPath.trim()) {
        await api.patchSettings({ obsidian_vault_path: vaultPath.trim() }).catch(() => {});
      }
      const res = await api.syncObsidian(vaultPath.trim() || undefined);
      const msg = t(
        res.written === 1
          ? 'settings.integrations.obsidian.syncSuccessSingular'
          : 'settings.integrations.obsidian.syncSuccessPlural',
        { count: res.written, path: res.vault_path }
      );
      setLastSyncResult({ success: true, message: msg });
      showToast(`📁 ${msg}`);
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setLastSyncResult({
        success: false,
        message: t('settings.integrations.obsidian.syncError', { message: errMsg }),
      });
      showToast(t('settings.integrations.obsidian.syncError', { message: errMsg }));
    } finally {
      setSyncingObsidian(false);
    }
  };

  const handleSaveObsidianAutoExport = async () => {
    try {
      await api.patchSettings({ obsidian_auto_export: obsidianAutoExport });
      showToast(
        obsidianAutoExport
          ? t('settings.integrations.obsidian.autoExportEnabled')
          : t('settings.integrations.obsidian.autoExportDisabled')
      );
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
      // Revert on error
      setObsidianAutoExport(!obsidianAutoExport);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) {
      setWebhookResult({ success: false, message: t('settings.integrations.webhook.needUrl') });
      return;
    }
    setTestingWebhook(true);
    setWebhookResult(null);
    try {
      const res = await api.testWebhook(
        webhookUrl.trim(),
        webhookSecret.trim() ? webhookSecret.trim() : undefined
      );
      if (res.ok) {
        setWebhookResult({
          success: true,
          message: t('settings.integrations.webhook.success', { status: res.status_code }),
        });
        showToast(t('settings.integrations.webhook.successToast', { status: res.status_code }));
      } else {
        const errDetail = res.error ? `: ${res.error}` : '';
        setWebhookResult({
          success: false,
          message: t('settings.integrations.webhook.error', {
            status: res.status_code,
            detail: errDetail,
          }),
        });
        showToast(t('settings.integrations.webhook.failedToast', { status: res.status_code }));
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setWebhookResult({
        success: false,
        message: t('settings.integrations.webhook.requestFailed', { message: errMsg }),
      });
      showToast(t('settings.integrations.webhook.requestFailedToast', { message: errMsg }));
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleLoadOutboxToken = async () => {
    setLoadingToken(true);
    setTokenError(null);
    try {
      const res = await api.getOutboxFeedToken();
      if (res.ok && res.token) {
        setOutboxToken(res.token);
        const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';
        setFeedUrl(`${origin}/api/v1/feed.xml?token=${res.token}`);
        if (!showFullToken) {
          setShowFullToken(true);
        }
      } else {
        setTokenError(t('settings.integrations.outbox.loadFailed'));
      }
    } catch (err: unknown) {
      setTokenError(api.getErrorMessage(err));
    } finally {
      setLoadingToken(false);
    }
  };

  const handleRegenerateOutboxToken = async () => {
    setRegeneratingToken(true);
    setTokenError(null);
    try {
      const res = await api.regenerateOutboxFeedToken();
      if (res.ok && res.token) {
        setOutboxToken(res.token);
        const feedUrl = res.feed_url || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080') + `/api/v1/feed.xml?token=${res.token}`;
        setFeedUrl(feedUrl);
        setShowFullToken(true);
        showToast(t('settings.integrations.outbox.newToken'));
      } else {
        setTokenError(t('settings.integrations.outbox.regenFailed'));
      }
    } catch (err: unknown) {
      setTokenError(api.getErrorMessage(err));
    } finally {
      setRegeneratingToken(false);
    }
  };

  const handleTestJoplin = async () => {
    setTestingJoplin(true);
    setJoplinTestResult(null);
    try {
      await handleSaveJoplinSettings();
      const res = await api.testJoplinConnection();
      if (res.ok && res.success) {
        const msg = res.message || t('settings.integrations.joplin.successFallback');
        setJoplinTestResult({ success: true, message: `✅ ${msg}` });
        showToast(msg);
      } else {
        const msg = res.message || t('settings.integrations.joplin.testFailedFallback');
        setJoplinTestResult({ success: false, message: `❌ ${msg}` });
        showToast(t('settings.integrations.testFailed', { message: msg }));
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setJoplinTestResult({
        success: false,
        message: `❌ ${t('settings.integrations.joplin.testError', { message: errMsg })}`,
      });
      showToast(t('settings.integrations.joplin.testError', { message: errMsg }));
    } finally {
      setTestingJoplin(false);
    }
  };

  const handleSyncJoplin = async () => {
    setSyncingJoplin(true);
    setJoplinSyncResult(null);
    try {
      await handleSaveJoplinSettings();
      const res = await api.syncJoplin();
      if (res.ok) {
        const msg = t(
          res.written === 1
            ? 'settings.integrations.joplin.syncSuccessSingular'
            : 'settings.integrations.joplin.syncSuccessPlural',
          { count: res.written }
        );
        setJoplinSyncResult({ success: true, message: msg });
        showToast(`📓 ${msg}`);
      } else {
        setJoplinSyncResult({
          success: false,
          message: t('settings.integrations.joplin.syncFailed'),
        });
        showToast(t('settings.integrations.joplin.syncFailed'));
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setJoplinSyncResult({
        success: false,
        message: t('settings.integrations.joplin.syncError', { message: errMsg }),
      });
      showToast(t('settings.integrations.joplin.syncError', { message: errMsg }));
    } finally {
      setSyncingJoplin(false);
    }
  };

  const handleSaveJoplinSettings = async () => {
    try {
      await api.patchSettings({
        joplin_mode: joplinMode,
        joplin_base_url: joplinBaseUrl.trim() || undefined,
        joplin_token: joplinToken.trim() || undefined,
        joplin_email: joplinEmail.trim() || undefined,
        joplin_password: joplinPassword.trim() || undefined,
        joplin_auto_export: joplinAutoExport,
      });
      showToast(t('settings.integrations.joplin.saved'));
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
      throw err;
    }
  };

  const handleTestNotion = async () => {
    setTestingNotion(true);
    setNotionTestResult(null);
    try {
      await handleSaveNotionSettings();
      const res = await api.testNotionConnection();
      if (res.ok && res.success) {
        const msg = res.message || t('settings.integrations.notion.successFallback');
        setNotionTestResult({ success: true, message: `✅ ${msg}` });
        showToast(msg);
      } else {
        const msg = res.message || t('settings.integrations.notion.testFailedFallback');
        setNotionTestResult({ success: false, message: `❌ ${msg}` });
        showToast(t('settings.integrations.testFailed', { message: msg }));
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setNotionTestResult({
        success: false,
        message: `❌ ${t('settings.integrations.notion.testError', { message: errMsg })}`,
      });
      showToast(t('settings.integrations.notion.testError', { message: errMsg }));
    } finally {
      setTestingNotion(false);
    }
  };

  const handleSyncNotion = async () => {
    setSyncingNotion(true);
    setNotionSyncResult(null);
    try {
      await handleSaveNotionSettings();
      const res = await api.syncNotion();
      if (res.ok) {
        const msg = t(
          res.written === 1
            ? 'settings.integrations.notion.syncSuccessSingular'
            : 'settings.integrations.notion.syncSuccessPlural',
          { count: res.written }
        );
        setNotionSyncResult({ success: true, message: msg });
        showToast(`📓 ${msg}`);
      } else {
        setNotionSyncResult({
          success: false,
          message: t('settings.integrations.notion.syncFailed'),
        });
        showToast(t('settings.integrations.notion.syncFailed'));
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setNotionSyncResult({
        success: false,
        message: t('settings.integrations.notion.syncError', { message: errMsg }),
      });
      showToast(t('settings.integrations.notion.syncError', { message: errMsg }));
    } finally {
      setSyncingNotion(false);
    }
  };

  const handleSaveNotionSettings = async () => {
    try {
      await api.patchSettings({
        notion_token: notionToken.trim() || undefined,
        notion_database_id: notionDatabaseId.trim() || undefined,
        notion_auto_export: notionAutoExport,
      });
      showToast(t('settings.integrations.notion.saved'));
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
      throw err;
    }
  };

  const handleToggleClientIntent = async (intentId: string) => {
    setSavingIntents(intentId);
    const enabled = clientIntentsEnabled.split(',').filter(Boolean);
    const isEnabled = enabled.includes(intentId);
    const newEnabled = isEnabled
      ? enabled.filter((id) => id !== intentId)
      : [...enabled, intentId];
    const newValue = newEnabled.join(',');
    setClientIntentsEnabled(newValue);
    try {
      await api.patchSettings({ client_intents_enabled: newValue });
      showToast(
        isEnabled
          ? t('settings.integrations.clientApps.toggleDisabled', { intent: intentId })
          : t('settings.integrations.clientApps.toggleEnabled', { intent: intentId })
      );
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
      // Revert on error
      setClientIntentsEnabled(clientIntentsEnabled);
    } finally {
      setSavingIntents(null);
    }
  };

  const handleSaveGithubRepo = async () => {
    if (!githubRepo.trim()) return;
    try {
      await api.patchSettings({ github_repo: githubRepo.trim() });
      showToast(t('settings.integrations.clientApps.saved'));
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  const bookmarkletCode = `javascript:(function(){const u=encodeURIComponent(window.location.href);const t=encodeURIComponent(document.title);fetch('${currentOrigin}/api/v1/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:window.location.href,text:document.title})}).then(r=>{if(r.ok){alert('⚡ Saved to Sparkkeep: '+document.title);}else{alert('Sparkkeep capture failed (HTTP '+r.status+')');}}).catch(e=>alert('Capture error: '+e));})();`;

  const raycastScript = `#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Capture Spark
# @raycast.mode silent
# @raycast.packageName Sparkkeep

# Optional parameters:
# @raycast.icon ⚡
# @raycast.argument1 { "type": "text", "placeholder": "URL or note" }

URL="\${1}"
curl -s -X POST "${currentOrigin}/api/v1/capture" \\
  -H "Authorization: Bearer YOUR_MASTER_PASSPHRASE" \\
  -H "Content-Type: application/json" \\
  -d "{\\"url\\": \\"$URL\\"}"

echo "Saved to Sparkkeep"`;

  const mcpConfig = `{
  "mcpServers": {
    "sparkkeep": {
      "command": "npx",
      "args": [
        "-y",
        "@sparkkeep/mcp",
        "--endpoint", "${currentOrigin}",
        "--token", "YOUR_MASTER_PASSPHRASE"
      ]
    }
  }
}`;

  return (
    <div className="settings-panel" role="tabpanel">
      <nav className="settings-section-index" aria-label={t('settings.integrations.navAria')} ref={indexNavRef}>
        {INTEGRATION_SECTIONS.map(({ slug, titleKey }) => (
          <button
            key={slug}
            type="button"
            className="settings-section-index-chip"
            aria-current={activeSection === slug ? 'true' : undefined}
            onClick={() => activateSection(slug)}
          >
            {t(titleKey)}
          </button>
        ))}
      </nav>

      <div className="settings-group" role="group" aria-labelledby="settings-group-knowledge-sinks">
        <div className="settings-group-header">
          <div className="settings-group-heading">
            <Library size={20} className="settings-group-icon" aria-hidden="true" />
            <h2 className="settings-group-title" id="settings-group-knowledge-sinks">{t('settings.integrations.groups.knowledge.title')}</h2>
          </div>
          <p className="settings-group-desc">{t('settings.integrations.groups.knowledge.desc')}</p>
        </div>

        <CollapsibleSection
          slug="notion"
          expanded={!collapsedSections.has('notion')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Brain size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('notion')}>{t('settings.integrations.sections.notion')}</h3>
              </div>
              <span className="settings-section-desc">
                {t('settings.integrations.notion.desc')}
              </span>
            </div>
          }
        >

          <div className="setup-form-group">
            <label htmlFor="notion-token">{t('settings.integrations.notion.tokenLabel')}</label>
            <input
              id="notion-token"
              type="password"
              value={notionToken}
              onChange={(e) => setNotionToken(e.target.value)}
              className="setup-input"
              placeholder="secret_..."
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <span className="setup-hint">
              {t('settings.integrations.notion.tokenHintBefore')}{' '}
              <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer">
                notion.so/my-integrations
              </a>
              {t('settings.integrations.notion.tokenHintAfter')}
            </span>
          </div>

          <div className="setup-form-group">
            <label htmlFor="notion-database-id">{t('settings.integrations.notion.databaseLabel')}</label>
            <input
              id="notion-database-id"
              type="text"
              value={notionDatabaseId}
              onChange={(e) => setNotionDatabaseId(e.target.value)}
              className="setup-input"
              placeholder={t('settings.integrations.notion.databasePlaceholder')}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <span className="setup-hint">
              {t('settings.integrations.notion.databaseHint')}{' '}
              <code>{`https://notion.so/workspace/<DATABASE_ID>?v=...`}</code>{' '}
              {t('settings.integrations.notion.databaseHintAfter')} <code>?v=</code>.
            </span>
          </div>

          <div className="setup-form-group" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notionAutoExport}
                onChange={(e) => setNotionAutoExport(e.target.checked)}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                {t('settings.integrations.notion.autoExport')}
              </span>
            </label>
            <span className="setup-hint" style={{ marginLeft: 'auto', fontSize: '11px' }}>
              {t('settings.integrations.notion.autoExportHint')}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '14px' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={testingNotion || syncingNotion}
              onClick={handleTestNotion}
              style={{ whiteSpace: 'nowrap' }}
            >
              {testingNotion ? t('common.testing') : t('settings.integrations.actions.testConnection')}
            </button>
            <button
              type="button"
              className="setup-btn-primary"
              disabled={syncingNotion || testingNotion}
              onClick={handleSyncNotion}
              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <HardDrive size={14} />
              <span>{syncingNotion ? t('common.syncing') : t('settings.integrations.actions.syncNow')}</span>
            </button>
            <button
              type="button"
              className="setup-btn-secondary"
              onClick={handleSaveNotionSettings}
              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Save size={14} />
              <span>{t('settings.integrations.actions.saveSettings')}</span>
            </button>
          </div>

          {notionTestResult && (
            <div
              className="setup-info-box"
              style={{
                marginTop: '12px',
                background: notionTestResult.success
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                borderColor: notionTestResult.success
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)',
              }}
            >
              {notionTestResult.success ? (
                <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)' }} />
              ) : (
                <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />
              )}
              <span style={{ fontSize: '13px' }}>{notionTestResult.message}</span>
            </div>
          )}

          {notionSyncResult && (
            <div
              className={`setup-info-box`}
              style={{
                marginTop: '12px',
                background: notionSyncResult.success
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                borderColor: notionSyncResult.success
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)',
              }}
            >
              {notionSyncResult.success ? (
                <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)' }} />
              ) : (
                <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />
              )}
              <span style={{ fontSize: '13px' }}>{notionSyncResult.message}</span>
            </div>
          )}

          <div className="setup-info-box" style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-dim)' }}>
            <strong>{t('settings.integrations.notion.howTitle')}</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', lineHeight: 1.7 }}>
              <li>{t('settings.integrations.notion.howProperties')}</li>
              <li>{t('settings.integrations.notion.howIdempotent')}</li>
              <li>{t('settings.integrations.notion.howBlocks')}</li>
              <li>{t('settings.integrations.notion.howChunking')}</li>
              <li>{t('settings.integrations.notion.howRate')}</li>
            </ul>
          </div>
        </CollapsibleSection>


        <CollapsibleSection
          slug="obsidian"
          style={{ marginTop: '28px' }}
          expanded={!collapsedSections.has('obsidian')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderSync size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('obsidian')}>{t('settings.integrations.sections.obsidian')}</h3>
              </div>
              <span className="settings-section-desc">
                {t('settings.integrations.obsidian.desc')}
              </span>
            </div>
          }
        >

          <div className="setup-form-group">
            <label htmlFor="obsidian-vault-path">{t('settings.integrations.obsidian.pathLabel')}</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                id="obsidian-vault-path"
                type="text"
                value={vaultPath}
                onChange={(e) => {
                  setVaultPath(e.target.value);
                  onVaultPathChange?.(e.target.value);
                }}
                className="setup-input"
                placeholder="/home/user/Documents/ObsidianVault or C:\Users\User\Documents\Vault"
                style={{ flex: 1, minWidth: '240px', fontFamily: 'var(--font-mono)' }}
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={testingObsidian || syncingObsidian}
                onClick={handleTestObsidian}
                style={{ whiteSpace: 'nowrap' }}
              >
                <span>{testingObsidian ? t('common.testing') : t('settings.integrations.actions.testConnection')}</span>
              </button>
              <button
                type="button"
                className="setup-btn-primary"
                disabled={syncingObsidian || testingObsidian}
                onClick={handleSyncObsidian}
                style={{ whiteSpace: 'nowrap' }}
              >
                <FolderSync size={14} />
                <span>{syncingObsidian ? t('common.syncing') : t('settings.integrations.obsidian.syncNow')}</span>
              </button>
            </div>
            <span className="setup-hint">
              {t('settings.integrations.obsidian.pathHint')}
            </span>
          </div>

          <div className="setup-form-group" style={{ marginTop: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={obsidianAutoExport}
                onChange={() => {
                  setObsidianAutoExport(!obsidianAutoExport);
                  handleSaveObsidianAutoExport();
                }}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                {t('settings.integrations.obsidian.autoExport')}
              </span>
            </label>
            <span className="setup-hint" style={{ marginTop: '6px', display: 'block' }}>
              {t('settings.integrations.obsidian.autoExportHint')}
            </span>
          </div>

          {testResult && (
            <div
              className="setup-info-box"
              style={{
                marginTop: '12px',
                background: testResult.success
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                borderColor: testResult.success
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)',
              }}
            >
              {testResult.success ? (
                <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)' }} />
              ) : (
                <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />
              )}
              <span style={{ fontSize: '13px' }}>{testResult.message}</span>
            </div>
          )}

          {lastSyncResult && (
            <div
              className={`setup-info-box`}
              style={{
                marginTop: '12px',
                background: lastSyncResult.success
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                borderColor: lastSyncResult.success
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)',
              }}
            >
              {lastSyncResult.success ? (
                <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)' }} />
              ) : (
                <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />
              )}
              <span style={{ fontSize: '13px' }}>{lastSyncResult.message}</span>
            </div>
          )}
        </CollapsibleSection>


        <CollapsibleSection
          slug="joplin"
          style={{ marginTop: '28px' }}
          expanded={!collapsedSections.has('joplin')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('joplin')}>{t('settings.integrations.sections.joplin')}</h3>
              </div>
              <span className="settings-section-desc">
                {t('settings.integrations.joplin.desc')}
              </span>
            </div>
          }
        >

          <div className="setup-form-group">
            <label>{t('settings.integrations.joplin.mode')}</label>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="joplin-mode"
                  value="server"
                  checked={joplinMode === "server"}
                  onChange={() => {
                    setJoplinMode("server");
                    if (!joplinBaseUrl || joplinBaseUrl === 'http://127.0.0.1:41184') {
                      setJoplinBaseUrl('https://joplin.example.com');
                    }
                  }}
                />
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Database size={14} style={{ color: '#e85d04' }} />
                  {t('settings.integrations.joplin.modeServer')}
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="joplin-mode"
                  value="clipper"
                  checked={joplinMode === "clipper"}
                  onChange={() => {
                    setJoplinMode("clipper");
                    setJoplinBaseUrl('http://127.0.0.1:41184');
                  }}
                />
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Monitor size={14} style={{ color: '#4a90d9' }} />
                  {t('settings.integrations.joplin.modeClipper')}
                </span>
              </label>
            </div>
            <span className="setup-hint">
              {t('settings.integrations.joplin.modeHint')}
            </span>
          </div>

          <div className="setup-form-group">
            <label htmlFor="joplin-base-url">{t('settings.integrations.joplin.baseUrl')}</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <input
                id="joplin-base-url"
                type="url"
                value={joplinBaseUrl}
                onChange={(e) => setJoplinBaseUrl(e.target.value)}
                className="setup-input"
                placeholder={joplinMode === "server" ? "https://joplin.example.com" : "http://127.0.0.1:41184"}
                style={{ flex: 1, minWidth: '240px', fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <span className="setup-hint">
              {joplinMode === 'server'
                ? t('settings.integrations.joplin.baseUrlHintServer')
                : t('settings.integrations.joplin.baseUrlHintClipper')}
            </span>
          </div>

          {joplinMode === "server" && (
            <div>
              <div className="setup-form-group">
                <label htmlFor="joplin-email">{t('settings.integrations.joplin.emailLabel')}</label>
                <input
                  id="joplin-email"
                  type="email"
                  value={joplinEmail}
                  onChange={(e) => setJoplinEmail(e.target.value)}
                  className="setup-input"
                  placeholder="admin@joplin.example.com"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <span className="setup-hint">{t('settings.integrations.joplin.emailHint')}</span>
              </div>

              <div className="setup-form-group">
                <label htmlFor="joplin-password">{t('settings.integrations.joplin.passwordLabel')}</label>
                <input
                  id="joplin-password"
                  type="password"
                  value={joplinPassword}
                  onChange={(e) => setJoplinPassword(e.target.value)}
                  className="setup-input"
                  placeholder="••••••••"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <span className="setup-hint">{t('settings.integrations.joplin.passwordHint')}</span>
              </div>
            </div>
          )}

          {joplinMode === "clipper" && (
            <div className="setup-form-group">
              <label htmlFor="joplin-token">{t('settings.integrations.joplin.tokenLabel')}</label>
              <input
                id="joplin-token"
                type="password"
                value={joplinToken}
                onChange={(e) => setJoplinToken(e.target.value)}
                className="setup-input"
                placeholder="••••••••"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <span className="setup-hint">
                {t('settings.integrations.joplin.tokenHint')}
              </span>
            </div>
          )}

          <div className="setup-form-group" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={joplinAutoExport}
                onChange={(e) => setJoplinAutoExport(e.target.checked)}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                {t('settings.integrations.joplin.autoExport')}
              </span>
            </label>
            <span className="setup-hint" style={{ marginLeft: 'auto', fontSize: '11px' }}>
              {t('settings.integrations.joplin.autoExportHint')}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '14px' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={testingJoplin || syncingJoplin}
              onClick={handleTestJoplin}
              style={{ whiteSpace: 'nowrap' }}
            >
              {testingJoplin ? t('common.testing') : t('settings.integrations.actions.testConnection')}
            </button>
            <button
              type="button"
              className="setup-btn-primary"
              disabled={syncingJoplin || testingJoplin}
              onClick={handleSyncJoplin}
              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <HardDrive size={14} />
              <span>{syncingJoplin ? t('common.syncing') : t('settings.integrations.actions.syncNow')}</span>
            </button>
            <button
              type="button"
              className="setup-btn-secondary"
              onClick={handleSaveJoplinSettings}
              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Save size={14} />
              <span>{t('settings.integrations.actions.saveSettings')}</span>
            </button>
          </div>

          {joplinTestResult && (
            <div
              className="setup-info-box"
              style={{
                marginTop: '12px',
                background: joplinTestResult.success
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                borderColor: joplinTestResult.success
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)',
              }}
            >
              {joplinTestResult.success ? (
                <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)' }} />
              ) : (
                <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />
              )}
              <span style={{ fontSize: '13px' }}>{joplinTestResult.message}</span>
            </div>
          )}

          {joplinSyncResult && (
            <div
              className={`setup-info-box`}
              style={{
                marginTop: '12px',
                background: joplinSyncResult.success
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                borderColor: joplinSyncResult.success
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)',
              }}
            >
              {joplinSyncResult.success ? (
                <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)' }} />
              ) : (
                <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />
              )}
              <span style={{ fontSize: '13px' }}>{joplinSyncResult.message}</span>
            </div>
          )}

          <div className="setup-info-box" style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-dim)' }}>
            <strong>{t('settings.integrations.joplin.howTitle')}</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', lineHeight: 1.7 }}>
              <li>{t('settings.integrations.joplin.howNotebook')}</li>
              <li>
                {t('settings.integrations.joplin.howIdBefore')}{' '}
                <code>{'sha256("sparkkeep:card:{id}")[:32]'}</code>{' '}
                {t('settings.integrations.joplin.howIdAfter')}
              </li>
              <li>{t('settings.integrations.joplin.howTags')}</li>
              <li>{t('settings.integrations.joplin.howContent')}</li>
              <li>{t('settings.integrations.joplin.howE2ee')}</li>
            </ul>
          </div>
        </CollapsibleSection>



      </div>

      <div className="settings-group" role="group" aria-labelledby="settings-group-inbound-capture-tools">
        <div className="settings-group-header">
          <div className="settings-group-heading">
            <Inbox size={20} className="settings-group-icon" aria-hidden="true" />
            <h2 className="settings-group-title" id="settings-group-inbound-capture-tools">{t('settings.integrations.groups.inbound.title')}</h2>
          </div>
          <p className="settings-group-desc">{t('settings.integrations.groups.inbound.desc')}</p>
        </div>

        <CollapsibleSection
          slug="browser-extension"
          expanded={!collapsedSections.has('browser-extension')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Globe size={18} style={{ color: 'var(--accent)' }} />
                  <h3 {...headingProps('browser-extension')}>{t('settings.integrations.sections.browserExtension')}</h3>
                </div>
                <span
                  className={`settings-badge ${extensionInstalled ? 'success' : 'neutral'}`}
                  style={{ fontSize: '10.5px' }}
                >
                  {extensionInstalled
                    ? t('settings.integrations.browser.detected')
                    : t('settings.integrations.browser.available')}
                </span>
              </div>
              <span className="settings-section-desc">
                {t('settings.integrations.browser.desc')}
              </span>
            </div>
          }
        >

          <div
            className="setup-info-box"
            style={{
              background: 'var(--bg-surface-elevated, #161822)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                  {pairSuccess ? t('settings.integrations.browser.pairedTitle') : t('settings.integrations.browser.pairTitle')}
                </strong>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
                  {t('settings.integrations.browser.pairDescBefore')}
                  <code style={{ color: 'var(--accent)' }}>{currentOrigin}</code>
                  {t('settings.integrations.browser.pairDescAfter')}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="setup-btn-primary"
                  onClick={handlePairExtension}
                  style={{ fontSize: '12px', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Sparkles size={14} />
                  <span>{t('settings.integrations.browser.pairAction')}</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowExtensionGuide(!showExtensionGuide)}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  {showExtensionGuide
                    ? t('settings.integrations.browser.hideGuide')
                    : t('settings.integrations.browser.showGuide')}
                </button>
              </div>
            </div>

            {showExtensionGuide && (
              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '10px',
                  fontSize: '12px',
                  color: 'var(--text-dim)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                  {t('settings.integrations.browser.guideTitle')}
                </div>
                <ol style={{ paddingLeft: '18px', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li>
                    {t('settings.integrations.browser.step1Before')}{' '}
                    <code>chrome://extensions</code>
                    {t('settings.integrations.browser.step1Mid')}
                    <code>about:debugging</code>
                    {t('settings.integrations.browser.step1After')}
                  </li>
                  <li>
                    {t('settings.integrations.browser.step2Before')}{' '}
                    <code>extension/</code>{' '}
                    {t('settings.integrations.browser.step2After')}
                  </li>
                  <li>{t('settings.integrations.browser.step3')}</li>
                  <li>
                    {t('settings.integrations.browser.step4Before')}{' '}
                    <code>Alt+Shift+S</code>{' '}
                    {t('settings.integrations.browser.step4After')}
                  </li>
                </ol>
              </div>
            )}
          </div>
        </CollapsibleSection>


        <CollapsibleSection
          slug="bookmarklet"
          style={{ marginTop: '24px' }}
          expanded={!collapsedSections.has('bookmarklet')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bookmark size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('bookmarklet')}>{t('settings.integrations.sections.bookmarklet')}</h3>
              </div>
              <span className="settings-section-desc">
                {t('settings.integrations.bookmarklet.desc')}
              </span>
            </div>
          }
        >

          <div className="setup-info-box" style={{ marginBottom: '14px' }}>
            <span>
              {t('settings.integrations.bookmarklet.info')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <a
              href={bookmarkletCode}
              onClick={(e) => {
                e.preventDefault();
                showToast(t('settings.integrations.bookmarklet.dragToast'));
              }}
              className="setup-btn-primary"
              style={{
                cursor: 'grab',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
              title={t('settings.integrations.bookmarklet.dragTitle')}
            >
              <Bookmark size={15} />
              <span>{t('settings.integrations.bookmarklet.saveButton')}</span>
            </a>

            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                copyToClipboard(
                  bookmarkletCode,
                  'bookmarklet',
                  t('settings.integrations.copyLabels.bookmarklet')
                )
              }
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {copiedId === 'bookmarklet' ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedId === 'bookmarklet' ? t('common.copied') : t('settings.integrations.bookmarklet.copy')}</span>
            </button>
          </div>
        </CollapsibleSection>


        <CollapsibleSection
          slug="ios-shortcut"
          style={{ marginTop: '28px' }}
          expanded={!collapsedSections.has('ios-shortcut')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('ios-shortcut')}>{t('settings.integrations.sections.iosShortcut')}</h3>
              </div>
              <span className="settings-section-desc">
                {t('settings.integrations.ios.desc')}
              </span>
            </div>
          }
        >

          <div
            style={{
              background: 'var(--surface-sunken, #090a0f)',
              padding: '14px',
              borderRadius: 'var(--radius-md, 8px)',
              border: '1px solid var(--border-subtle)',
              fontSize: '12.5px',
              color: 'var(--text-dim)',
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
              {t('settings.integrations.ios.stepsTitle')}
            </div>
            <ol style={{ paddingLeft: '18px', margin: 0 }}>
              <li>{t('settings.integrations.ios.step1')}</li>
              <li>
                {t('settings.integrations.ios.step2Before')}{' '}
                <code style={{ color: 'var(--accent)' }}>{`${currentOrigin}/api/v1/capture`}</code>
              </li>
              <li>
                {t('settings.integrations.ios.step3Before')}
                <br />
                • <code style={{ color: 'var(--accent)' }}>Authorization</code>:{' '}
                <code style={{ color: 'var(--accent)' }}>Bearer YOUR_MASTER_PASSPHRASE</code>
                <br />
                • <code style={{ color: 'var(--accent)' }}>Content-Type</code>:{' '}
                <code style={{ color: 'var(--accent)' }}>application/json</code>
              </li>
              <li>
                {t('settings.integrations.ios.step4Before')}{' '}
                <code style={{ color: 'var(--accent)' }}>
                  {'{"url": Shortcut Input, "text": "Captured via iOS"}'}
                </code>
              </li>
            </ol>
          </div>
        </CollapsibleSection>


        <CollapsibleSection
          slug="raycast"
          style={{ marginTop: '28px' }}
          expanded={!collapsedSections.has('raycast')}
          onToggle={toggleSection}
          header={
            <div
              className="settings-section-header"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Command size={18} style={{ color: 'var(--accent)' }} />
                  <h3 {...headingProps('raycast')}>{t('settings.integrations.sections.raycast')}</h3>
                </div>
                <span className="settings-section-desc">
                  {t('settings.integrations.raycast.desc')}
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  copyToClipboard(raycastScript, 'raycast', t('settings.integrations.copyLabels.raycast'))
                }
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 10px' }}
              >
                {copiedId === 'raycast' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedId === 'raycast' ? t('common.copied') : t('settings.integrations.raycast.copyScript')}</span>
              </button>
            </div>
          }
        >

          <pre
            style={{
              background: 'var(--surface-sunken, #090a0f)',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          >
            {raycastScript}
          </pre>
        </CollapsibleSection>


        <CollapsibleSection
          slug="mcp"
          style={{ marginTop: '28px' }}
          expanded={!collapsedSections.has('mcp')}
          onToggle={toggleSection}
          header={
            <div
              className="settings-section-header"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={18} style={{ color: 'var(--accent)' }} />
                  <h3 {...headingProps('mcp')}>{t('settings.integrations.sections.mcp')}</h3>
                </div>
                <span className="settings-section-desc">
                  {t('settings.integrations.mcp.desc')}
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  copyToClipboard(mcpConfig, 'mcp', t('settings.integrations.copyLabels.mcp'))
                }
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 10px' }}
              >
                {copiedId === 'mcp' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedId === 'mcp' ? t('common.copied') : t('settings.integrations.mcp.copyConfig')}</span>
              </button>
            </div>
          }
        >

          <pre
            style={{
              background: 'var(--surface-sunken, #090a0f)',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)',
              overflowX: 'auto',
            }}
          >
            {mcpConfig}
          </pre>
          <span className="setup-hint">
            {t('settings.integrations.mcp.hintBefore')}{' '}
            <code>claude_desktop_config.json</code>{' '}
            {t('settings.integrations.mcp.hintMid')} <code>mcpServers</code>{' '}
            {t('settings.integrations.mcp.hintAfter')}
          </span>
        </CollapsibleSection>


        <CollapsibleSection
          slug="capture-api"
          style={{ marginTop: '28px' }}
          expanded={!collapsedSections.has('capture-api')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('capture-api')}>{t('settings.integrations.sections.captureApi')}</h3>
              </div>
              <span className="settings-section-desc">
                {t('settings.integrations.captureApi.desc')}
              </span>
            </div>
          }
        >

          <div className="setup-info-box">
            <Terminal size={16} />
            <span>
              {t('settings.integrations.captureApi.info')}
            </span>
          </div>

          <div className="setup-form-group">
            <label>{t('settings.integrations.captureApi.example')}</label>
            <pre
              style={{
                background: 'var(--surface-sunken, #090a0f)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-dim)',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
  {`curl -X POST ${currentOrigin}/api/v1/capture \\
    -H "Authorization: Bearer YOUR_MASTER_PASSPHRASE" \\
    -H "Content-Type: application/json" \\
    -d '{
      "url": "https://example.com/article",
      "text": "Some optional caption or notes"
    }'`}
            </pre>
          </div>
        </CollapsibleSection>


      </div>

      <div className="settings-group" role="group" aria-labelledby="settings-group-automation-testing">
        <div className="settings-group-header">
          <div className="settings-group-heading">
            <FlaskConical size={20} className="settings-group-icon" aria-hidden="true" />
            <h2 className="settings-group-title" id="settings-group-automation-testing">{t('settings.integrations.groups.automation.title')}</h2>
          </div>
          <p className="settings-group-desc">{t('settings.integrations.groups.automation.desc')}</p>
        </div>

        <CollapsibleSection
          slug="webhook"
          expanded={!collapsedSections.has('webhook')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('webhook')}>{t('settings.integrations.sections.webhook')}</h3>
              </div>
              <span className="settings-section-desc">
                {t('settings.integrations.webhook.desc')}
              </span>
            </div>
          }
        >

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
            <div className="setup-form-group">
              <label htmlFor="test-webhook-url">{t('settings.integrations.webhook.urlLabel')}</label>
              <input
                id="test-webhook-url"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="setup-input"
                placeholder="https://hooks.zapier.com/hooks/catch/..."
              />
            </div>

            <div className="setup-form-group">
              <label htmlFor="test-webhook-secret">{t('settings.integrations.webhook.secretLabel')}</label>
              <input
                id="test-webhook-secret"
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="setup-input"
                placeholder={t('settings.integrations.webhook.secretPlaceholder')}
              />
            </div>
          </div>

          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={testingWebhook || !webhookUrl.trim()}
              onClick={handleTestWebhook}
            >
              {testingWebhook ? t('settings.integrations.webhook.triggering') : t('settings.integrations.webhook.dispatch')}
            </button>

            {webhookResult && (
              <span
                style={{
                  fontSize: '13px',
                  color: webhookResult.success
                    ? 'var(--accent-emerald, #10b981)'
                    : 'var(--color-error, #ef4444)',
                  fontWeight: 500,
                }}
              >
                {webhookResult.message}
              </span>
            )}
          </div>
        </CollapsibleSection>


        <CollapsibleSection
          slug="client-apps"
          style={{ marginTop: '28px' }}
          expanded={!collapsedSections.has('client-apps')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('client-apps')}>{t('settings.integrations.sections.clientApps')}</h3>
              </div>
              <span className="settings-section-desc">
                {t('settings.integrations.clientApps.desc')}
              </span>
            </div>
          }
        >

          <div className="setup-info-box" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { id: 'obsidian', label: 'Obsidian App', icon: BookOpen, uri: 'obsidian://new?name={title}&content={markdown}', color: '#483699' },
              { id: 'logseq', label: 'Logseq', icon: Bookmark, uri: 'logseq://x-callback-url/quickCapture?title={title}&content={markdown}', color: '#1890ff' },
              { id: 'things', label: 'Things 3', icon: Target, uri: 'things:///add?title={title}&notes={markdown}', color: '#e67e22' },
              { id: 'todoist', label: 'Todoist', icon: CheckSquare, uri: 'https://todoist.com/showTask?text={title}&description={markdown}', color: '#e44d2a' },
            ].map((app) => {
              const enabled = clientIntentsEnabled.split(',').filter(Boolean).includes(app.id);
              const Icon = app.icon;
              return (
                <div
                  key={app.id}
                  className="setup-form-group"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '200px' }}>
                    <Icon size={18} style={{ color: app.color }} />
                    <div>
                      <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>{app.label}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        {app.uri}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={enabled ? 'setup-btn-primary' : 'btn-secondary'}
                    onClick={() => handleToggleClientIntent(app.id)}
                    disabled={savingIntents === app.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      minWidth: '80px',
                      justifyContent: 'center',
                    }}
                  >
                    {savingIntents === app.id ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                        {t('common.saving')}
                      </span>
                    ) : enabled ? (
                      <>
                        <Check size={12} />
                        <span>{t('common.enabled')}</span>
                      </>
                    ) : (
                      <>
                        <span>{t('common.enable')}</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
            <div className="setup-form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '200px' }}>
                <GitBranch size={18} style={{ color: '#24292f' }} />
                <div>
                  <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>GitHub Issues</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                    {'https://github.com/{{owner}}/{{repo}}/issues/new?title={title}&body={markdown}'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                  placeholder={t('settings.integrations.clientApps.repoPlaceholder')}
                  className="setup-input"
                  style={{ flex: 1, minWidth: '200px', maxWidth: '300px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                />
                <button
                  type="button"
                  className="setup-btn-primary"
                  onClick={handleSaveGithubRepo}
                  disabled={!githubRepo.trim()}
                  style={{ whiteSpace: 'nowrap', fontSize: '12px', padding: '6px 14px' }}
                >
                  {t('settings.integrations.clientApps.saveRepo')}
                </button>
              </div>
              <span className="setup-hint">
                {t('settings.integrations.clientApps.repoHintBefore')}{' '}
                <code style={{ color: 'var(--accent)' }}>owner/repo</code>.
              </span>
            </div>
          </div>
        </CollapsibleSection>


      </div>

      <div className="settings-group" role="group" aria-labelledby="settings-group-export-syndication">
        <div className="settings-group-header">
          <div className="settings-group-heading">
            <Share2 size={20} className="settings-group-icon" aria-hidden="true" />
            <h2 className="settings-group-title" id="settings-group-export-syndication">{t('settings.integrations.groups.export.title')}</h2>
          </div>
          <p className="settings-group-desc">{t('settings.integrations.groups.export.desc')}</p>
        </div>

        <CollapsibleSection
          slug="library-export"
          expanded={!collapsedSections.has('library-export')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('library-export')}>{t('settings.integrations.sections.libraryExport')}</h3>
              </div>
              <span className="settings-section-desc">
                {t('settings.integrations.library.desc')}
              </span>
            </div>
          }
        >

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '14px' }}>
            <button
              type="button"
              className="setup-btn-secondary"
              onClick={() => api.downloadLibraryExport('json')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 14px', borderRadius: '10px', cursor: 'pointer' }}
            >
              <FileCode size={15} />
              <span>{t('settings.integrations.library.json')}</span>
            </button>
            <button
              type="button"
              className="setup-btn-secondary"
              onClick={() => api.downloadLibraryExport('zip')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 14px', borderRadius: '10px', cursor: 'pointer' }}
            >
              <FileArchive size={15} />
              <span>{t('settings.integrations.library.zip')}</span>
            </button>
          </div>
        </CollapsibleSection>


        <CollapsibleSection
          slug="outbox-feed"
          style={{ marginTop: '28px' }}
          expanded={!collapsedSections.has('outbox-feed')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Rss size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('outbox-feed')}>{t('settings.integrations.sections.outboxFeed')}</h3>
              </div>
              <span className="settings-section-desc">
                {t('settings.integrations.outbox.desc')}
              </span>
            </div>
          }
        >

          <div className="setup-info-box" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '240px' }}>
                <Rss size={20} style={{ color: 'var(--accent)' }} />
                <div>
                  <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>{t('settings.integrations.outbox.tokenTitle')}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    {outboxToken || t('settings.integrations.outbox.notGenerated')}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleLoadOutboxToken}
                  disabled={loadingToken}
                  style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                >
                  {loadingToken
                    ? t('common.loading')
                    : outboxToken
                    ? t('settings.integrations.outbox.show')
                    : t('settings.integrations.outbox.generate')}
                </button>
                {outboxToken && !showFullToken && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowFullToken(true)}
                    style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                  >
                    <Eye size={14} /> {t('common.reveal')}
                  </button>
                )}
                {outboxToken && showFullToken && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowFullToken(false)}
                    style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                  >
                    <EyeOff size={14} /> {t('common.hide')}
                  </button>
                )}
                {showFullToken && outboxToken && (
                  <button
                    type="button"
                    className="setup-btn-primary"
                    onClick={() =>
                      copyToClipboard(outboxToken, 'outbox-token', t('settings.integrations.copyLabels.token'))
                    }
                    style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copiedId === 'outbox-token' ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedId === 'outbox-token' ? t('common.copied') : t('settings.integrations.outbox.copyToken')}</span>
                  </button>
                )}
                {outboxToken && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleRegenerateOutboxToken}
                    disabled={regeneratingToken}
                    style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                  >
                    {regeneratingToken ? (
                      <RotateCcw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <>
                        <RotateCcw size={14} />
                        <span>{t('settings.integrations.outbox.regenerate')}</span>
                      </>
                    )}
                  </button>
                )}
                {feedUrl && (
                  <button
                    type="button"
                    className="setup-btn-primary"
                    onClick={() => copyToClipboard(feedUrl, 'feed-url', t('settings.integrations.copyLabels.feedUrl'))}
                    style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copiedId === 'feed-url' ? <Check size={14} /> : <Link2 size={14} />}
                    <span>{copiedId === 'feed-url' ? t('common.copied') : t('settings.integrations.outbox.copyFeed')}</span>
                  </button>
                )}
              </div>
            </div>

            {showFullToken && outboxToken && feedUrl && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginTop: '4px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                  <strong>{t('settings.integrations.outbox.feedUrlLabel')}</strong>{' '}
                  <code style={{ color: 'var(--accent)' }}>{feedUrl}</code>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  <a href={`${feedUrl}&status=doing,done`} target="_blank" rel="noopener noreferrer" className="filter-link">status=doing,done</a>
                  <a href={`${feedUrl}&type=article`} target="_blank" rel="noopener noreferrer" className="filter-link">type=article</a>
                  <a href={`${feedUrl}&research_only=1`} target="_blank" rel="noopener noreferrer" className="filter-link">research_only=1</a>
                  <a href={`${feedUrl}&limit=50`} target="_blank" rel="noopener noreferrer" className="filter-link">limit=50</a>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  <strong>{t('settings.integrations.outbox.availableFilters')}</strong>
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px' }}>
                    <li>
                      <code>status</code> — {t('settings.integrations.outbox.filterCommaSeparated')}{' '}
                      <code>inbox</code>, <code>review</code>, <code>to-do</code>,{' '}
                      <code>in-progress</code>, <code>done</code>, <code>shelved</code>,{' '}
                      <code>dismissed</code>
                    </li>
                    <li>
                      <code>type</code> — {t('settings.integrations.outbox.filterCommaSeparated')}{' '}
                      <code>article</code>, <code>video</code>, <code>tool</code>, <code>repo</code>,{' '}
                      <code>book</code>, <code>guide</code>, <code>product</code>, <code>place</code>,{' '}
                      <code>idea</code>, <code>claim</code>, <code>tutorial</code>, <code>paper</code>,{' '}
                      <code>company</code>, <code>quote</code>, <code>other</code>
                    </li>
                    <li>
                      <code>research_only</code> — <code>1</code>{' '}
                      {t('settings.integrations.outbox.filterResearchOnlyBefore')}{' '}
                      <code>true</code>{' '}
                      {t('settings.integrations.outbox.filterResearchOnlyAfter')}
                    </li>
                    <li>
                      <code>since</code> —{' '}
                      {t('settings.integrations.outbox.filterSinceBefore')}{' '}
                      <code>2024-01-15T00:00:00Z</code>
                      {t('settings.integrations.outbox.filterSinceAfter')}
                    </li>
                    <li>
                      <code>limit</code> — {t('settings.integrations.outbox.filterLimitText')}
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {tokenError && (
              <div style={{ color: 'var(--color-error, #ef4444)', fontSize: '12px', marginTop: '8px' }}>
                {tokenError}
              </div>
            )}
          </div>
        </CollapsibleSection>


      </div>

    </div>
  );
};
