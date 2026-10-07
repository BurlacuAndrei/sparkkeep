import React, { useState, useEffect } from 'react';
import {
  Clock,
  Moon,
  Sparkles,
  Plus,
  Trash2,
  Play,
  Save,
  CheckCircle2,
  AlertCircle,
  Lock,
  Calendar,
  Filter,
  Check,
  X,
} from 'lucide-react';
import * as api from '../api';
import { ResearchRule, QuietWindowConfig, Playbook } from '../types';

interface ResearchSchedulerProps {
  showToast: (msg: string) => void;
  onOpenLicenseModal?: () => void;
}

export const ResearchScheduler: React.FC<ResearchSchedulerProps> = ({
  showToast,
  onOpenLicenseModal,
}) => {
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quietWindow, setQuietWindow] = useState<QuietWindowConfig>({
    enabled: false,
    start: '23:00',
    end: '07:00',
  });
  const [savingQuietWindow, setSavingQuietWindow] = useState(false);

  const [rules, setRules] = useState<ResearchRule[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [editingRule, setEditingRule] = useState<ResearchRule | null>(null);
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const lic = await api.fetchLicenseStatus().catch(() => ({
        ok: false,
        status: { tier: 'community', features: [] as string[], is_lifetime: false, is_valid: false },
      }));
      const pro = Boolean(lic?.status?.features?.includes('deep_research_v2'));
      setIsPro(pro);

      if (pro) {
        const [qw, rls, pbs] = await Promise.all([
          api.fetchQuietWindow().catch(() => ({ enabled: false, start: '23:00', end: '07:00' })),
          api.fetchResearchRules().catch(() => []),
          api.fetchPlaybooks().catch(() => []),
        ]);
        setQuietWindow(qw);
        setRules(rls);
        setPlaybooks(pbs);
      }
    } catch (err) {
      showToast(api.getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveQuietWindow = async () => {
    setSavingQuietWindow(true);
    try {
      await api.updateQuietWindow(quietWindow);
      showToast('Quiet window settings saved');
    } catch (err) {
      showToast(api.getErrorMessage(err));
    } finally {
      setSavingQuietWindow(false);
    }
  };

  const handleToggleRule = async (rule: ResearchRule) => {
    try {
      const updated = { ...rule, enabled: !rule.enabled };
      await api.updateResearchRule(rule.id, updated);
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
      showToast(`Rule ${updated.enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      showToast(api.getErrorMessage(err));
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;
    try {
      await api.deleteResearchRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      showToast('Rule deleted');
    } catch (err) {
      showToast(api.getErrorMessage(err));
    }
  };

  const handleRunRule = async (id: string) => {
    setRunningRuleId(id);
    try {
      const queued = await api.runResearchRule(id);
      showToast(`Rule executed: queued ${queued.length} card(s)`);
    } catch (err) {
      showToast(api.getErrorMessage(err));
    } finally {
      setRunningRuleId(null);
    }
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    try {
      if (!editingRule.name.trim()) {
        showToast('Rule name is required');
        return;
      }
      if (editingRule.id && rules.some((r) => r.id === editingRule.id)) {
        await api.updateResearchRule(editingRule.id, editingRule);
        setRules((prev) => prev.map((r) => (r.id === editingRule.id ? editingRule : r)));
        showToast('Rule updated successfully');
      } else {
        const created = await api.createResearchRule(editingRule);
        setRules((prev) => [...prev, created]);
        showToast('Rule created successfully');
      }
      setEditingRule(null);
    } catch (err) {
      showToast(api.getErrorMessage(err));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
        Loading scheduled research settings...
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className="settings-panel">
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.08))',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: 14,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'rgba(99, 102, 241, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8',
              }}
            >
              <Moon size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                Batch & Scheduled Overnight Research
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#94a3b8' }}>
                Pro Feature · Bounded background queue with overnight windows & automation rules
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#cbd5e1' }}>
              <Sparkles size={16} color="#818cf8" style={{ marginTop: 2, flexShrink: 0 }} />
              <span>
                <strong>Persistent Overnight Queue:</strong> Queue cards during the day; the background worker processes them sequentially overnight.
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#cbd5e1' }}>
              <Clock size={16} color="#818cf8" style={{ marginTop: 2, flexShrink: 0 }} />
              <span>
                <strong>Quiet Window:</strong> Confine resource-heavy LLM passes to specific hours (e.g. 23:00 – 07:00).
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#cbd5e1' }}>
              <Filter size={16} color="#818cf8" style={{ marginTop: 2, flexShrink: 0 }} />
              <span>
                <strong>Automated Nightly Rules:</strong> Automatically research high-worthiness inbox items created in the last 24h.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              className="btn-primary"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #9333ea)',
                border: 'none',
                padding: '9px 18px',
                fontSize: 13,
                fontWeight: 600,
              }}
              onClick={onOpenLicenseModal}
            >
              <Lock size={14} style={{ marginRight: 6 }} />
              Unlock with Pro License
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-panel">
      {/* Quiet Window Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-section-title">
            <Moon size={16} color="#818cf8" />
            <span>Quiet Window (Overnight Execution)</span>
          </div>
          <p className="settings-section-desc">
            When enabled, queued research runs are held and only processed during the specified time window.
          </p>
        </div>

        <div
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={quietWindow.enabled}
              onChange={(e) => setQuietWindow({ ...quietWindow, enabled: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: 'var(--accent-indigo)' }}
            />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-main)' }}>
              Enable Quiet Window (only run research within window)
            </span>
          </label>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              opacity: quietWindow.enabled ? 1 : 0.5,
              pointerEvents: quietWindow.enabled ? 'auto' : 'none',
            }}
          >
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4, display: 'block' }}>
                START TIME (HH:MM)
              </label>
              <input
                type="time"
                className="form-input"
                style={{ width: '100%' }}
                value={quietWindow.start}
                onChange={(e) => setQuietWindow({ ...quietWindow, start: e.target.value })}
              />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4, display: 'block' }}>
                END TIME (HH:MM)
              </label>
              <input
                type="time"
                className="form-input"
                style={{ width: '100%' }}
                value={quietWindow.end}
                onChange={(e) => setQuietWindow({ ...quietWindow, end: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '6px 14px', fontSize: 12.5 }}
              disabled={savingQuietWindow}
              onClick={handleSaveQuietWindow}
            >
              <Save size={13} style={{ marginRight: 6 }} />
              {savingQuietWindow ? 'Saving...' : 'Save Window Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Rules Section */}
      <div className="settings-section" style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div className="settings-section-header">
            <div className="settings-section-title">
              <Calendar size={16} color="#818cf8" />
              <span>Scheduled Automation Rules</span>
            </div>
            <p className="settings-section-desc">
              Automatically queue research for matching cards on a recurring daily schedule.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: '6px 12px', fontSize: 12.5 }}
            onClick={() =>
              setEditingRule({
                id: `rule_${Date.now()}`,
                name: 'Nightly High Priority Inbox',
                enabled: true,
                time: '02:00',
                filters: {
                  status: 'inbox',
                  worthiness: 'high',
                  max_age_hours: 24,
                },
                max_cards: 10,
              })
            }
          >
            <Plus size={14} style={{ marginRight: 4 }} />
            New Rule
          </button>
        </div>

        {rules.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: '#94a3b8',
              background: 'var(--bg-surface-elevated)',
              borderRadius: 10,
              border: '1px dashed var(--border-subtle)',
              fontSize: 13,
            }}
          >
            No scheduled research rules configured yet. Click "New Rule" to create one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rules.map((rule) => {
              const pbName = rule.playbook_id
                ? playbooks.find((p) => p.id === rule.playbook_id)?.name || `Playbook #${rule.playbook_id}`
                : 'Auto (Card Match)';

              return (
                <div
                  key={rule.id}
                  style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 10,
                    padding: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>
                        {rule.name}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: rule.enabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                          color: rule.enabled ? '#34d399' : '#94a3b8',
                          border: `1px solid ${rule.enabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
                        }}
                      >
                        {rule.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11.5, color: '#94a3b8' }}>
                      <span>⏰ <strong>{rule.time}</strong></span>
                      <span>· Status: <strong>{rule.filters.status || 'all'}</strong></span>
                      {rule.filters.worthiness && <span>· Worthiness: <strong>{rule.filters.worthiness}</strong></span>}
                      {rule.filters.type && <span>· Type: <strong>{rule.filters.type}</strong></span>}
                      <span>· Max: <strong>{rule.max_cards} cards</strong></span>
                      <span>· Playbook: <strong>{pbName}</strong></span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      title="Run now immediately"
                      style={{ padding: '6px 10px', fontSize: 11.5 }}
                      disabled={runningRuleId === rule.id}
                      onClick={() => handleRunRule(rule.id)}
                    >
                      <Play size={12} style={{ marginRight: 4 }} />
                      {runningRuleId === rule.id ? 'Running...' : 'Run Now'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '6px 10px', fontSize: 11.5 }}
                      onClick={() => setEditingRule(rule)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                      style={{ padding: '6px 10px', fontSize: 11.5 }}
                      onClick={() => handleToggleRule(rule)}
                    >
                      {rule.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Delete rule"
                      style={{ color: '#f87171' }}
                      onClick={() => handleDeleteRule(rule.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit / Create Rule Modal */}
      {editingRule && (
        <div className="modal-overlay" onClick={() => setEditingRule(null)}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {rules.some((r) => r.id === editingRule.id) ? 'Edit Rule' : 'New Research Rule'}
              </h3>
              <button type="button" className="close-btn" onClick={() => setEditingRule(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRule} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>RULE NAME</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={editingRule.name}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  placeholder="e.g. Nightly High Priority Inbox"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>SCHEDULE TIME (HH:MM)</label>
                  <input
                    type="time"
                    className="form-input"
                    required
                    value={editingRule.time}
                    onChange={(e) => setEditingRule({ ...editingRule, time: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>MAX CARDS PER RUN</label>
                  <input
                    type="number"
                    className="form-input"
                    min={1}
                    max={50}
                    value={editingRule.max_cards}
                    onChange={(e) => setEditingRule({ ...editingRule, max_cards: parseInt(e.target.value) || 10 })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>CARD STATUS</label>
                  <select
                    className="form-select"
                    value={editingRule.filters.status || ''}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        filters: { ...editingRule.filters, status: e.target.value },
                      })
                    }
                  >
                    <option value="">Any Status</option>
                    <option value="inbox">Inbox</option>
                    <option value="doing">Doing</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>WORTHINESS</label>
                  <select
                    className="form-select"
                    value={editingRule.filters.worthiness || ''}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        filters: { ...editingRule.filters, worthiness: e.target.value },
                      })
                    }
                  >
                    <option value="">Any Worthiness</option>
                    <option value="high">High only</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>CARD TYPE</label>
                  <select
                    className="form-select"
                    value={editingRule.filters.type || ''}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        filters: { ...editingRule.filters, type: e.target.value },
                      })
                    }
                  >
                    <option value="">Any Type</option>
                    <option value="article">Article</option>
                    <option value="repo">Repo / Code</option>
                    <option value="paper">Paper</option>
                    <option value="tool">Tool</option>
                    <option value="video">Video</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>MAX AGE (HOURS)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="0 = no limit"
                    value={editingRule.filters.max_age_hours || ''}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        filters: { ...editingRule.filters, max_age_hours: parseInt(e.target.value) || 0 },
                      })
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label>PLAYBOOK OVERRIDE</label>
                <select
                  className="form-select"
                  value={editingRule.playbook_id || ''}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      playbook_id: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                >
                  <option value="">Auto (Default per Card Type)</option>
                  {playbooks.map((pb) => (
                    <option key={pb.id} value={pb.id}>
                      {pb.name} {pb.is_builtin ? '(Built-in)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingRule(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  <Save size={14} style={{ marginRight: 6 }} />
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
