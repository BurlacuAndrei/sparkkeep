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

export interface IntegrationsTabProps {
  showToast: (msg: string) => void;
  authToken?: string;
  initialVaultPath?: string;
  onVaultPathChange?: (path: string) => void;
}

const INTEGRATION_SECTIONS = [
  { slug: 'browser-extension', title: 'Official Browser Extension (Chrome & Firefox)' },
  { slug: 'bookmarklet', title: 'Browser Bookmarklet' },
  { slug: 'ios-shortcut', title: 'Apple iOS Shortcut & Share Sheet' },
  { slug: 'raycast', title: 'Raycast Extension / Script Command' },
  { slug: 'mcp', title: 'Model Context Protocol (MCP)' },
  { slug: 'capture-api', title: 'Universal Inbound Capture API' },
  { slug: 'obsidian', title: 'Obsidian Vault Export' },
  { slug: 'joplin', title: 'Joplin Knowledge Sink' },
  { slug: 'notion', title: 'Notion Knowledge Sink' },
  { slug: 'library-export', title: 'Data Sovereignty & Full Library Export' },
  { slug: 'outbox-feed', title: 'Outbox RSS Feed' },
  { slug: 'webhook', title: 'Webhook Test Triggers' },
  { slug: 'client-apps', title: 'Client App Shortcuts' },
] as const;

type SectionSlug = (typeof INTEGRATION_SECTIONS)[number]['slug'];

const COLLAPSED_STORAGE_KEY = 'sparkkeep_integrations_collapsed';
const SECTION_ID_PREFIX = 'integration-';
const SECTION_HASH_PREFIX = `#${SECTION_ID_PREFIX}`;

const isSectionSlug = (value: string): value is SectionSlug =>
  INTEGRATION_SECTIONS.some((section) => section.slug === value);

const sectionTitle = (slug: SectionSlug): string =>
  INTEGRATION_SECTIONS.find((section) => section.slug === slug)?.title ?? slug;

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
  const bodyId = `integration-body-${slug}`;
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
          aria-label={`Toggle ${sectionTitle(slug)} section`}
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
  // Extension State & Pairing
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);
  const [pairSuccess, setPairSuccess] = useState(false);

  // Obsidian Vault state
  const [vaultPath, setVaultPath] = useState('');
  const [obsidianAutoExport, setObsidianAutoExport] = useState(false);
  const [syncingObsidian, setSyncingObsidian] = useState(false);
  const [testingObsidian, setTestingObsidian] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Webhook Test Trigger state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);

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
  const [joplinSyncResult, setJoplinSyncResult] = useState<string | null>(null);

  // Notion Knowledge Sink state
  const [notionToken, setNotionToken] = useState<string>('');
  const [notionDatabaseId, setNotionDatabaseId] = useState<string>('');
  const [notionAutoExport, setNotionAutoExport] = useState(false);
  const [testingNotion, setTestingNotion] = useState(false);
  const [syncingNotion, setSyncingNotion] = useState(false);
  const [notionTestResult, setNotionTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [notionSyncResult, setNotionSyncResult] = useState<string | null>(null);

  // Collapsible sections: collapsed slugs persist for the browser session.
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionSlug>>(readCollapsedSections);
  const [activeSection, setActiveSection] = useState<SectionSlug | null>(null);

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

  const copyToClipboard = (text: string, id: string, label: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      showToast(`${label} copied to clipboard!`);
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
          showToast('⚡ Extension paired to this instance successfully!');
          setTimeout(() => setPairSuccess(false), 4000);
        } else {
          showToast(`Pairing failed: ${e.data.error || 'Unknown error'}`);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    window.postMessage({ type: 'SPARKKEEP_EXTENSION_PING' }, '*');
    return () => window.removeEventListener('message', handleMessage);
  }, [showToast]);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';

  const handlePairExtension = () => {
    window.postMessage({
      type: 'SPARKKEEP_PAIR_EXTENSION',
      serverUrl: currentOrigin,
      token: authToken || '',
    }, '*');
    setTimeout(() => {
      if (!extensionInstalled) {
        showToast('Pairing handshake sent! If extension is loaded, it is now paired.');
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
        const msg = res.message || 'Obsidian vault directory is accessible and writable!';
        setTestResult({ success: true, message: `✅ ${msg}` });
        showToast(msg);
      } else {
        const msg = res.message || 'Obsidian vault connection test failed.';
        setTestResult({ success: false, message: `❌ ${msg}` });
        showToast(`Test failed: ${msg}`);
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setTestResult({ success: false, message: `❌ Error testing vault: ${errMsg}` });
      showToast(`Error testing vault: ${errMsg}`);
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
      const msg = `Synced ${res.written} notes to ${res.vault_path}`;
      setLastSyncResult(`✅ ${msg}`);
      showToast(`📁 ${msg}`);
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setLastSyncResult(`❌ Error syncing to vault: ${errMsg}`);
      showToast(`Error syncing to vault: ${errMsg}`);
    } finally {
      setSyncingObsidian(false);
    }
  };

  const handleSaveObsidianAutoExport = async () => {
    try {
      await api.patchSettings({ obsidian_auto_export: obsidianAutoExport });
      showToast(`Obsidian auto-export ${obsidianAutoExport ? 'enabled' : 'disabled'}`);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
      // Revert on error
      setObsidianAutoExport(!obsidianAutoExport);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) {
      setWebhookResult('❌ Please enter a webhook target URL.');
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
        setWebhookResult(`✅ Success (HTTP ${res.status_code}) - Endpoint responded cleanly!`);
        showToast(`Webhook test succeeded with HTTP ${res.status_code}!`);
      } else {
        const errDetail = res.error ? `: ${res.error}` : '';
        setWebhookResult(`❌ Error (HTTP ${res.status_code})${errDetail}`);
        showToast(`Webhook test failed: HTTP ${res.status_code}`);
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setWebhookResult(`❌ Request failed: ${errMsg}`);
      showToast(`Webhook request failed: ${errMsg}`);
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
        setTokenError('Failed to load token');
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
        showToast('✅ New feed token generated!');
      } else {
        setTokenError('Failed to regenerate token');
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
        const msg = res.message || 'Joplin connection successful!';
        setJoplinTestResult({ success: true, message: `✅ ${msg}` });
        showToast(msg);
      } else {
        const msg = res.message || 'Joplin connection test failed.';
        setJoplinTestResult({ success: false, message: `❌ ${msg}` });
        showToast(`Test failed: ${msg}`);
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setJoplinTestResult({ success: false, message: `❌ Error testing Joplin: ${errMsg}` });
      showToast(`Error testing Joplin: ${errMsg}`);
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
        const msg = `Synced ${res.written} notes to Joplin`;
        setJoplinSyncResult(`✅ ${msg}`);
        showToast(`📓 ${msg}`);
      } else {
        setJoplinSyncResult(`❌ Sync failed`);
        showToast('Sync failed');
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setJoplinSyncResult(`❌ Error syncing to Joplin: ${errMsg}`);
      showToast(`Error syncing to Joplin: ${errMsg}`);
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
      showToast('Joplin settings saved');
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
        const msg = res.message || 'Notion connection successful!';
        setNotionTestResult({ success: true, message: `✅ ${msg}` });
        showToast(msg);
      } else {
        const msg = res.message || 'Notion connection test failed.';
        setNotionTestResult({ success: false, message: `❌ ${msg}` });
        showToast(`Test failed: ${msg}`);
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setNotionTestResult({ success: false, message: `❌ Error testing Notion: ${errMsg}` });
      showToast(`Error testing Notion: ${errMsg}`);
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
        const msg = `Synced ${res.written} notes to Notion`;
        setNotionSyncResult(`✅ ${msg}`);
        showToast(`📓 ${msg}`);
      } else {
        setNotionSyncResult(`❌ Sync failed`);
        showToast('Sync failed');
      }
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setNotionSyncResult(`❌ Error syncing to Notion: ${errMsg}`);
      showToast(`Error syncing to Notion: ${errMsg}`);
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
      showToast('Notion settings saved');
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
      showToast(`${intentId} ${isEnabled ? 'disabled' : 'enabled'}`);
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
      showToast('GitHub repository saved');
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
      <nav className="settings-section-index" aria-label="Integration sections">
        {INTEGRATION_SECTIONS.map(({ slug, title }) => (
          <button
            key={slug}
            type="button"
            className="settings-section-index-chip"
            aria-current={activeSection === slug ? 'true' : undefined}
            onClick={() => activateSection(slug)}
          >
            {title}
          </button>
        ))}
      </nav>

      <div className="settings-group" role="group" aria-labelledby="settings-group-inbound-capture-tools">
        <div className="settings-group-header">
          <div className="settings-group-heading">
            <Inbox size={20} className="settings-group-icon" aria-hidden="true" />
            <h2 className="settings-group-title" id="settings-group-inbound-capture-tools">Inbound Capture Tools</h2>
          </div>
          <p className="settings-group-desc">Inbound: tools capture into Sparkkeep; MCP clients read the library.</p>
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
                  <h3 {...headingProps('browser-extension')}>Official Browser Extension (Chrome &amp; Firefox)</h3>
                </div>
                <span
                  className={`settings-badge ${extensionInstalled ? 'success' : 'neutral'}`}
                  style={{ fontSize: '10.5px' }}
                >
                  {extensionInstalled ? 'Extension Detected (Active)' : 'Available for Chrome & Firefox'}
                </span>
              </div>
              <span className="settings-section-desc">
                1-Click web clipping, highlighted quote extraction, and automatic triage directly into your private Sparkkeep instance.
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
                  {pairSuccess ? '✓ Paired with Instance!' : 'Magic Instance Pairing'}
                </strong>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
                  Preconfigures the extension with this server address (<code style={{ color: 'var(--accent)' }}>{currentOrigin}</code>) and your authentication credentials.
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
                  <span>1-Click Pair Extension</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowExtensionGuide(!showExtensionGuide)}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  {showExtensionGuide ? 'Hide Guide' : 'Setup Guide'}
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
                  How to load the extension in your browser:
                </div>
                <ol style={{ paddingLeft: '18px', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li>
                    Open <code>chrome://extensions</code> (Chrome/Brave/Edge) or <code>about:debugging</code> (Firefox).
                  </li>
                  <li>
                    Enable <strong>Developer Mode</strong>, click <strong>Load unpacked</strong>, and select the <code>extension/</code> directory inside this repo.
                  </li>
                  <li>
                    Return to this page and click <strong>1-Click Pair Extension</strong> above to automatically connect!
                  </li>
                  <li>
                    Use shortcut <code>Alt+Shift+S</code> on any page or right-click any highlighted text to clip.
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
                <h3 {...headingProps('bookmarklet')}>Browser Bookmarklet</h3>
              </div>
              <span className="settings-section-desc">
                Instantly capture any webpage or article directly into Sparkkeep from Chrome, Safari, Firefox, or Edge.
              </span>
            </div>
          }
        >

          <div className="setup-info-box" style={{ marginBottom: '14px' }}>
            <span>
              Drag the button below directly to your browser's bookmarks bar, or copy the code snippet into a manual bookmark URL.
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <a
              href={bookmarkletCode}
              onClick={(e) => {
                e.preventDefault();
                showToast('Drag this button directly to your browser Bookmarks Bar!');
              }}
              className="setup-btn-primary"
              style={{
                cursor: 'grab',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
              title="Drag to your Bookmarks Toolbar"
            >
              <Bookmark size={15} />
              <span>⚡ Save to Sparkkeep</span>
            </a>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => copyToClipboard(bookmarkletCode, 'bookmarklet', 'Bookmarklet code')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {copiedId === 'bookmarklet' ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedId === 'bookmarklet' ? 'Copied' : 'Copy Bookmarklet Code'}</span>
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
                <h3 {...headingProps('ios-shortcut')}>Apple iOS Shortcut &amp; Share Sheet</h3>
              </div>
              <span className="settings-section-desc">
                Share articles, tweets, and links from Safari or any iOS app directly into Sparkkeep using Apple Shortcuts.
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
              Shortcut Steps in Apple Shortcuts app:
            </div>
            <ol style={{ paddingLeft: '18px', margin: 0 }}>
              <li>Create a new shortcut named <strong>"Send to Sparkkeep"</strong> and enable <em>Show in Share Sheet</em>.</li>
              <li>Add action: <strong>Get Contents of URL</strong> with address: <code style={{ color: 'var(--accent)' }}>{currentOrigin}/api/v1/capture</code></li>
              <li>Set Method to <strong>POST</strong> and Headers:
                <br />
                • <code style={{ color: 'var(--accent)' }}>Authorization</code>: <code style={{ color: 'var(--accent)' }}>Bearer YOUR_MASTER_PASSPHRASE</code>
                <br />
                • <code style={{ color: 'var(--accent)' }}>Content-Type</code>: <code style={{ color: 'var(--accent)' }}>application/json</code>
              </li>
              <li>Set Request Body (JSON): <code style={{ color: 'var(--accent)' }}>{`{"url": Shortcut Input, "text": "Captured via iOS"}`}</code></li>
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
                  <h3 {...headingProps('raycast')}>Raycast Extension / Script Command</h3>
                </div>
                <span className="settings-section-desc">
                  Trigger instant captures straight from your Mac keystrokes using a Raycast Script Command.
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => copyToClipboard(raycastScript, 'raycast', 'Raycast script')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 10px' }}
              >
                {copiedId === 'raycast' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedId === 'raycast' ? 'Copied' : 'Copy Script'}</span>
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
                  <h3 {...headingProps('mcp')}>Model Context Protocol (MCP)</h3>
                </div>
                <span className="settings-section-desc">
                  Empower Claude Desktop, Cursor, and Zed AI agents to query your Sparkkeep library as an active knowledge context.
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => copyToClipboard(mcpConfig, 'mcp', 'MCP server config')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 10px' }}
              >
                {copiedId === 'mcp' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedId === 'mcp' ? 'Copied' : 'Copy MCP Config'}</span>
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
            Paste into your <code>claude_desktop_config.json</code> under <code>mcpServers</code> to expose Sparkkeep search directly to your AI conversations.
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
                <h3 {...headingProps('capture-api')}>Universal Inbound Capture API</h3>
              </div>
              <span className="settings-section-desc">
                Send raw URLs and ideas into Sparkkeep from custom scripts, cron jobs, or command lines.
              </span>
            </div>
          }
        >

          <div className="setup-info-box">
            <Terminal size={16} />
            <span>
              Use your master passphrase as the Bearer token to authorize capture requests.
            </span>
          </div>

          <div className="setup-form-group">
            <label>Example cURL Request</label>
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

      <div className="settings-group" role="group" aria-labelledby="settings-group-knowledge-sinks">
        <div className="settings-group-header">
          <div className="settings-group-heading">
            <Library size={20} className="settings-group-icon" aria-hidden="true" />
            <h2 className="settings-group-title" id="settings-group-knowledge-sinks">Knowledge Sinks</h2>
          </div>
          <p className="settings-group-desc">Outbound: Sparkkeep writes your library into your notes app.</p>
        </div>

        <CollapsibleSection
          slug="obsidian"
          expanded={!collapsedSections.has('obsidian')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderSync size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('obsidian')}>Obsidian Vault Export</h3>
              </div>
              <span className="settings-section-desc">
                Mirror and export your Sparkkeep library into your local or networked Obsidian knowledge base with full Markdown and YAML frontmatter.
              </span>
            </div>
          }
        >

          <div className="setup-form-group">
            <label htmlFor="obsidian-vault-path">Obsidian Vault Directory Path</label>
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
                <span>{testingObsidian ? 'Testing...' : 'Test Connection'}</span>
              </button>
              <button
                type="button"
                className="setup-btn-primary"
                disabled={syncingObsidian || testingObsidian}
                onClick={handleSyncObsidian}
                style={{ whiteSpace: 'nowrap' }}
              >
                <FolderSync size={14} />
                <span>{syncingObsidian ? 'Syncing...' : 'Sync Vault Now'}</span>
              </button>
            </div>
            <span className="setup-hint">
              Leave blank to use the default configured system vault path. Creates folder structures with tags, executive summaries, and research reports.
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
                Auto-export on status change & research completion
              </span>
            </label>
            <span className="setup-hint" style={{ marginTop: '6px', display: 'block' }}>
              When enabled, cards transitioning to To-Do, In Progress, or Done — and cards with completed research — are automatically exported to your Obsidian vault.
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
                background: lastSyncResult.startsWith('✅')
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                borderColor: lastSyncResult.startsWith('✅')
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)',
              }}
            >
              {lastSyncResult.startsWith('✅') ? (
                <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)' }} />
              ) : (
                <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />
              )}
              <span style={{ fontSize: '13px' }}>{lastSyncResult}</span>
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
                <h3 {...headingProps('joplin')}>Joplin Knowledge Sink</h3>
              </div>
              <span className="settings-section-desc">
                Sync your Sparkkeep library to Joplin via Self-Hosted Server or Desktop Clipper API. Notes use deterministic IDs for idempotent upserts.
              </span>
            </div>
          }
        >

          <div className="setup-form-group">
            <label>Mode</label>
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
                  Self-Hosted Server
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
                  Desktop Clipper API
                </span>
              </label>
            </div>
            <span className="setup-hint">
              Server mode requires email/password for authentication. Clipper mode requires only the clipper token (Joplin Desktop must be running with Clipper plugin enabled).
            </span>
          </div>

          <div className="setup-form-group">
            <label htmlFor="joplin-base-url">Base URL</label>
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
              {joplinMode === "server"
                ? "Your self-hosted Joplin Server URL (e.g., https://joplin.yourdomain.com)"
                : "Joplin Desktop Clipper API endpoint (default: http://127.0.0.1:41184)"}
            </span>
          </div>

          {joplinMode === "server" && (
            <div>
              <div className="setup-form-group">
                <label htmlFor="joplin-email">Email (Server Mode)</label>
                <input
                  id="joplin-email"
                  type="email"
                  value={joplinEmail}
                  onChange={(e) => setJoplinEmail(e.target.value)}
                  className="setup-input"
                  placeholder="admin@joplin.example.com"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <span className="setup-hint">Email used to authenticate with Joplin Server.</span>
              </div>

              <div className="setup-form-group">
                <label htmlFor="joplin-password">Password (Server Mode)</label>
                <input
                  id="joplin-password"
                  type="password"
                  value={joplinPassword}
                  onChange={(e) => setJoplinPassword(e.target.value)}
                  className="setup-input"
                  placeholder="••••••••"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <span className="setup-hint">Password for Joplin Server authentication. Used only to obtain a session token.</span>
              </div>
            </div>
          )}

          {joplinMode === "clipper" && (
            <div className="setup-form-group">
              <label htmlFor="joplin-token">Clipper Token (Desktop Mode)</label>
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
                Token from Joplin Desktop → Options → Web Clipper → "Authorization token". Joplin must be running with the Web Clipper service enabled.
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
                Auto-export on card changes (requires Ticket 06 background sync)
              </span>
            </label>
            <span className="setup-hint" style={{ marginLeft: 'auto', fontSize: '11px' }}>
              When enabled, new/updated cards are automatically synced to Joplin.
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
              {testingJoplin ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="button"
              className="setup-btn-primary"
              disabled={syncingJoplin || testingJoplin}
              onClick={handleSyncJoplin}
              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <HardDrive size={14} />
              <span>{syncingJoplin ? 'Syncing...' : 'Sync Library Now'}</span>
            </button>
            <button
              type="button"
              className="setup-btn-secondary"
              onClick={handleSaveJoplinSettings}
              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Save size={14} />
              <span>Save Settings</span>
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
                background: joplinSyncResult.startsWith('✅')
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                borderColor: joplinSyncResult.startsWith('✅')
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)',
              }}
            >
              {joplinSyncResult.startsWith('✅') ? (
                <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)' }} />
              ) : (
                <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />
              )}
              <span style={{ fontSize: '13px' }}>{joplinSyncResult}</span>
            </div>
          )}

          <div className="setup-info-box" style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-dim)' }}>
            <strong>How it works:</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', lineHeight: 1.7 }}>
              <li>Notes are created in a <strong>Sparkkeep</strong> notebook (auto-created).</li>
              <li>Each card gets a deterministic 32-char hex ID: <code>{`sha256("sparkkeep:card:{id}")[:32]`}</code> — re-syncing updates the same note.</li>
              <li>Tags are synced as Joplin tags with deterministic IDs.</li>
              <li>Markdown includes: Title, Executive Summary, Value Proposition, Proposed Actions (as checkboxes), References, Research Dossier.</li>
              <li><strong>E2EE note:</strong> Target notebook must have End-to-End Encryption disabled in Joplin (Settings → Encryption).</li>
            </ul>
          </div>
        </CollapsibleSection>


        <CollapsibleSection
          slug="notion"
          style={{ marginTop: '28px' }}
          expanded={!collapsedSections.has('notion')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Brain size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('notion')}>Notion Knowledge Sink</h3>
              </div>
              <span className="settings-section-desc">
                Sync your Sparkkeep library to a Notion database with rich block rendering, auto-provisioned schema, and idempotent upserts via Sparkkeep ID.
              </span>
            </div>
          }
        >

          <div className="setup-form-group">
            <label htmlFor="notion-token">Integration Token</label>
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
              Create an Internal Integration at{' '}
              <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer">
                notion.so/my-integrations
              </a>{' '}
              , then share your target database with the integration.
            </span>
          </div>

          <div className="setup-form-group">
            <label htmlFor="notion-database-id">Database ID</label>
            <input
              id="notion-database-id"
              type="text"
              value={notionDatabaseId}
              onChange={(e) => setNotionDatabaseId(e.target.value)}
              className="setup-input"
              placeholder="32-char database ID from Notion URL"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <span className="setup-hint">
              Found in the database URL:{' '}
              <code>{`https://notion.so/workspace/<DATABASE_ID>?v=...`}</code> {' '}
              — the 32-char segment before <code>?v=</code>.
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
                Auto-export on card changes (requires Ticket 06 background sync)
              </span>
            </label>
            <span className="setup-hint" style={{ marginLeft: 'auto', fontSize: '11px' }}>
              When enabled, new/updated cards are automatically synced to Notion.
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
              {testingNotion ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="button"
              className="setup-btn-primary"
              disabled={syncingNotion || testingNotion}
              onClick={handleSyncNotion}
              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <HardDrive size={14} />
              <span>{syncingNotion ? 'Syncing...' : 'Sync Library Now'}</span>
            </button>
            <button
              type="button"
              className="setup-btn-secondary"
              onClick={handleSaveNotionSettings}
              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Save size={14} />
              <span>Save Settings</span>
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
                background: notionSyncResult.startsWith('✅')
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                borderColor: notionSyncResult.startsWith('✅')
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)',
              }}
            >
              {notionSyncResult.startsWith('✅') ? (
                <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)' }} />
              ) : (
                <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />
              )}
              <span style={{ fontSize: '13px' }}>{notionSyncResult}</span>
            </div>
          )}

          <div className="setup-info-box" style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-dim)' }}>
            <strong>How it works:</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', lineHeight: 1.7 }}>
              <li>Database properties are auto-provisioned: Sparkkeep ID (number), Card Type, Horizon, Status, Tags, Source URL, Created At, Updated At, Researched.</li>
              <li>Upsert is idempotent via <strong>Sparkkeep ID</strong> property — re-syncing updates the same page.</li>
              <li>Content rendered as Notion blocks: headings, paragraphs, lists, checkboxes, code blocks, callouts for Research Dossier.</li>
              <li>Long text auto-chunked at 2,000 chars; blocks batched at 100 per API call.</li>
              <li>Rate limits handled with exponential backoff.</li>
            </ul>
          </div>
        </CollapsibleSection>

      </div>

      <div className="settings-group" role="group" aria-labelledby="settings-group-export-syndication">
        <div className="settings-group-header">
          <div className="settings-group-heading">
            <Share2 size={20} className="settings-group-icon" aria-hidden="true" />
            <h2 className="settings-group-title" id="settings-group-export-syndication">Export & Syndication</h2>
          </div>
          <p className="settings-group-desc">Outbound: Sparkkeep publishes your library to readers and feeds.</p>
        </div>

        <CollapsibleSection
          slug="library-export"
          expanded={!collapsedSections.has('library-export')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('library-export')}>Data Sovereignty & Full Library Export</h3>
              </div>
              <span className="settings-section-desc">
                Download your entire library directly in your browser. Zero vendor lock-in guaranteed.
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
              <span>Download Full Library (.JSON)</span>
            </button>
            <button
              type="button"
              className="setup-btn-secondary"
              onClick={() => api.downloadLibraryExport('zip')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 14px', borderRadius: '10px', cursor: 'pointer' }}
            >
              <FileArchive size={15} />
              <span>Download Markdown Archive (.ZIP)</span>
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
                <h3 {...headingProps('outbox-feed')}>Outbox RSS Feed</h3>
              </div>
              <span className="settings-section-desc">
                Authenticated, filterable RSS 2.0 feed of your outbox cards with full research dossiers. Use with feed readers, automation tools, or custom dashboards.
              </span>
            </div>
          }
        >

          <div className="setup-info-box" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '240px' }}>
                <Rss size={20} style={{ color: 'var(--accent)' }} />
                <div>
                  <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>Feed Token</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    {outboxToken || 'Not generated'}
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
                  {loadingToken ? 'Loading...' : outboxToken ? 'Show Token' : 'Generate Token'}
                </button>
                {outboxToken && !showFullToken && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowFullToken(true)}
                    style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                  >
                    <Eye size={14} /> Reveal
                  </button>
                )}
                {outboxToken && showFullToken && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowFullToken(false)}
                    style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                  >
                    <EyeOff size={14} /> Hide
                  </button>
                )}
                {showFullToken && outboxToken && (
                  <button
                    type="button"
                    className="setup-btn-primary"
                    onClick={() => copyToClipboard(outboxToken, 'outbox-token', 'Feed token')}
                    style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copiedId === 'outbox-token' ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedId === 'outbox-token' ? 'Copied' : 'Copy Token'}</span>
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
                        <span>Regenerate</span>
                      </>
                    )}
                  </button>
                )}
                {feedUrl && (
                  <button
                    type="button"
                    className="setup-btn-primary"
                    onClick={() => copyToClipboard(feedUrl, 'feed-url', 'Feed URL')}
                    style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copiedId === 'feed-url' ? <Check size={14} /> : <Link2 size={14} />}
                    <span>{copiedId === 'feed-url' ? 'Copied' : 'Copy Feed URL'}</span>
                  </button>
                )}
              </div>
            </div>

            {showFullToken && outboxToken && feedUrl && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginTop: '4px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                  <strong>Feed URL:</strong> <code style={{ color: 'var(--accent)' }}>{feedUrl}</code>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  <a href={`${feedUrl}&status=doing,done`} target="_blank" rel="noopener noreferrer" className="filter-link">status=doing,done</a>
                  <a href={`${feedUrl}&type=article`} target="_blank" rel="noopener noreferrer" className="filter-link">type=article</a>
                  <a href={`${feedUrl}&research_only=1`} target="_blank" rel="noopener noreferrer" className="filter-link">research_only=1</a>
                  <a href={`${feedUrl}&limit=50`} target="_blank" rel="noopener noreferrer" className="filter-link">limit=50</a>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  <strong>Available filters:</strong>
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px' }}>
                    <li><code>status</code> — comma-separated: <code>inbox</code>, <code>review</code>, <code>to-do</code>, <code>in-progress</code>, <code>done</code>, <code>shelved</code>, <code>dismissed</code></li>
                    <li><code>type</code> — comma-separated: <code>article</code>, <code>video</code>, <code>tool</code>, <code>repo</code>, <code>book</code>, <code>guide</code>, <code>product</code>, <code>place</code>, <code>idea</code>, <code>claim</code>, <code>tutorial</code>, <code>paper</code>, <code>company</code>, <code>quote</code>, <code>other</code></li>
                    <li><code>research_only</code> — <code>1</code> or <code>true</code> to include only cards with completed research</li>
                    <li><code>since</code> — RFC3339 timestamp (e.g., <code>2024-01-15T00:00:00Z</code>)</li>
                    <li><code>limit</code> — max items (default 100, max 100)</li>
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

      <div className="settings-group" role="group" aria-labelledby="settings-group-automation-testing">
        <div className="settings-group-header">
          <div className="settings-group-heading">
            <FlaskConical size={20} className="settings-group-icon" aria-hidden="true" />
            <h2 className="settings-group-title" id="settings-group-automation-testing">Automation & Testing</h2>
          </div>
          <p className="settings-group-desc">Bidirectional: other apps trigger and verify Sparkkeep flows.</p>
        </div>

        <CollapsibleSection
          slug="webhook"
          expanded={!collapsedSections.has('webhook')}
          onToggle={toggleSection}
          header={
            <div className="settings-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send size={18} style={{ color: 'var(--accent)' }} />
                <h3 {...headingProps('webhook')}>Webhook Test Triggers</h3>
              </div>
              <span className="settings-section-desc">
                Test outbound webhook payloads and dispatch triggers to external automation platforms like Zapier, n8n, Make, or custom API endpoints.
              </span>
            </div>
          }
        >

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
            <div className="setup-form-group">
              <label htmlFor="test-webhook-url">Destination Webhook URL</label>
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
              <label htmlFor="test-webhook-secret">Webhook Secret / Bearer (Optional)</label>
              <input
                id="test-webhook-secret"
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="setup-input"
                placeholder="Secret token"
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
              {testingWebhook ? 'Triggering...' : 'Dispatch Test Payload'}
            </button>

            {webhookResult && (
              <span
                style={{
                  fontSize: '13px',
                  color: webhookResult.startsWith('✅')
                    ? 'var(--accent-emerald, #10b981)'
                    : 'var(--color-error, #ef4444)',
                  fontWeight: 500,
                }}
              >
                {webhookResult}
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
                <h3 {...headingProps('client-apps')}>Client App Shortcuts</h3>
              </div>
              <span className="settings-section-desc">
                Open cards directly in your favorite note-taking and task apps via URI schemes. Enable the apps you use.
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
                        Saving...
                      </span>
                    ) : enabled ? (
                      <>
                        <Check size={12} />
                        <span>Enabled</span>
                      </>
                    ) : (
                      <>
                        <span>Enable</span>
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
                  placeholder="owner/repo (e.g., facebook/react)"
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
                  Save Repository
                </button>
              </div>
              <span className="setup-hint">
                Required for GitHub Issues intent. Format: <code style={{ color: 'var(--accent)' }}>owner/repo</code>.
              </span>
            </div>
          </div>
        </CollapsibleSection>


      </div>
    </div>
  );
};
