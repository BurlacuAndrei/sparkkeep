import React, { useState } from 'react';
import { Card, Reference, ReferenceKind } from '../../types';
import { CustomSelect } from '../CustomSelect';
import { cardHorizonOptions, cardStatusOptions, cardTypeOptions } from '../selectOptions';
import {
  AlertTriangle,
  ExternalLink,
  Link2,
  Plus,
  Tag,
  Trash2,
  X,
  Sliders,
} from 'lucide-react';
import { useLocale } from '../../i18n';
import { enumLabel } from '../../utils/cardEnumLabels';

export interface CardMetadataPanelProps {
  card: Card;
  horizon: 'short-term' | 'medium-term' | 'long-term';
  status: string;
  cardType: string;
  tags: string[];
  references: Reference[];
  onHorizonChange: (horizon: 'short-term' | 'medium-term' | 'long-term') => void;
  onStatusChange: (status: string) => void;
  onTypeChange: (type: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (index: number) => void;
  onAddReference: (ref: Reference) => void;
  onRemoveReference: (index: number) => void;
  showSelectors?: boolean;
}

export const CardMetadataPanel: React.FC<CardMetadataPanelProps> = ({
  card,
  horizon,
  status,
  cardType,
  tags,
  references,
  onHorizonChange,
  onStatusChange,
  onTypeChange,
  onAddTag,
  onRemoveTag,
  onAddReference,
  onRemoveReference,
  showSelectors = true,
}) => {
  // Local state for adding tag
  const [newTagInput, setNewTagInput] = useState('');
  const { t } = useLocale();

  // Local state for adding reference
  const [newRefKind, setNewRefKind] = useState<ReferenceKind>('url');
  const [newRefLabel, setNewRefLabel] = useState('');
  const [newRefUrl, setNewRefUrl] = useState('');

  const handleAddTagSubmit = () => {
    const trimmed = newTagInput.trim();
    if (!trimmed) return;
    onAddTag(trimmed);
    setNewTagInput('');
  };

  const handleAddReferenceSubmit = () => {
    const lbl = newRefLabel.trim();
    const u = newRefUrl.trim();
    if (!lbl && !u) return;
    const item: Reference = {
      kind: newRefKind,
      label: lbl || u,
      ...(u ? { url: u } : {}),
    };
    onAddReference(item);
    setNewRefLabel('');
    setNewRefUrl('');
    setNewRefKind('url');
  };

  return (
    <>
      {/* 1. Metadata Controls & Selectors */}
      {showSelectors && (
        <div className="rail-section">
          <div className="rail-section-title">
            <Sliders size={13} color="var(--accent-indigo, #818cf8)" />
            <span>{t('cards.metadata.title')}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Status Selector */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-main)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t('cards.metadata.status')}
              </label>
              <CustomSelect
                id="panel-status-select"
                value={status}
                onChange={onStatusChange}
                options={cardStatusOptions(t)}
                ariaLabel={t('cards.metadata.statusAria')}
              />
            </div>

            {/* Type Selector */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-main)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t('cards.metadata.type')}
              </label>
              <CustomSelect
                id="panel-type-select"
                value={cardType}
                onChange={onTypeChange}
                options={cardTypeOptions(t)}
                ariaLabel={t('cards.metadata.typeAria')}
              />
            </div>

            {/* Horizon Selector */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-main)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t('cards.metadata.horizon')}
              </label>
              <CustomSelect
                id="panel-horizon-select"
                value={horizon}
                onChange={(val) => onHorizonChange(val as any)}
                options={cardHorizonOptions(t)}
                ariaLabel={t('cards.metadata.horizonAria')}
              />
            </div>

            {/* Worthiness Rating */}
            {card.worthiness?.level && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: 11, color: 'var(--text-main)', fontWeight: 600 }}>{t('cards.metadata.worthiness')}</span>
                <span
                  className={`card-worthiness-chip ${card.worthiness.level.toLowerCase()}`}
                  title={
                    card.worthiness.reason ||
                    t('cards.item.worthinessTitle', {
                      level: enumLabel(t, 'worthiness', card.worthiness.level),
                    })
                  }
                >
                  {t('cards.metadata.worth', {
                    level: enumLabel(t, 'worthiness', card.worthiness.level).toUpperCase(),
                  })}
                </span>
              </div>
            )}

            {/* Signals Badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
              {card.signals?.extraction && card.signals.extraction !== 'full' && (
                <span className="card-signal-badge warning" title={t('cards.metadata.extractionTitle')}>
                  <AlertTriangle size={10} strokeWidth={2} />
                  <span>
                    {t('cards.metadata.extractionValue', {
                      value: enumLabel(t, 'extraction', card.signals.extraction),
                    })}
                  </span>
                </span>
              )}
              {card.signals?.promo && (
                <span className="card-signal-badge promo">
                  {t('cards.metadata.promoContent')}
                </span>
              )}
              {card.signals?.source_quality && (
                <span
                  className="card-signal-badge"
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'rgba(99, 102, 241, 0.1)',
                    color: '#818cf8',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                  }}
                  title={t('cards.metadata.qualityTitle', { value: card.signals.source_quality })}
                >
                  {t('cards.metadata.quality', { value: card.signals.source_quality })}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. References Manager */}
      <div className="rail-section">
        <div className="rail-section-title">
          <Link2 size={13} color="var(--accent-blue)" />
          <span>{t('cards.metadata.references', { count: references.length })}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {references.map((ref, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 6px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                <span className={`ref-kind-chip ref-kind-${ref.kind}`}>{ref.kind}</span>
                <span style={{ color: 'var(--text-main)' }} className="line-clamp-1">
                  {ref.label || ref.url}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {ref.url && (
                  <a href={ref.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)' }}>
                    <ExternalLink size={11} />
                  </a>
                )}
                <button
                  type="button"
                  className="close-btn"
                  onClick={() => onRemoveReference(idx)}
                  title={t('cards.metadata.removeReference')}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}

          {references.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>
              {t('cards.metadata.noReferences')}
            </div>
          )}
        </div>

        {/* Add Reference inline */}
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <select
            className="form-input"
            value={newRefKind}
            onChange={(e) => setNewRefKind(e.target.value as ReferenceKind)}
            style={{ width: 68, padding: '3px 4px', fontSize: 11 }}
          >
            <option value="url">{t('cards.metadata.refKinds.url')}</option>
            <option value="repo">{t('cards.metadata.refKinds.repo')}</option>
            <option value="tool">{t('cards.metadata.refKinds.tool')}</option>
            <option value="product">{t('cards.metadata.refKinds.product')}</option>
            <option value="person">{t('cards.metadata.refKinds.person')}</option>
            <option value="org">{t('cards.metadata.refKinds.org')}</option>
            <option value="paper">{t('cards.metadata.refKinds.paper')}</option>
            <option value="other">{t('cards.metadata.refKinds.other')}</option>
          </select>
          <input
            type="text"
            className="form-input"
            placeholder={t('cards.metadata.refPlaceholder')}
            value={newRefUrl || newRefLabel}
            onChange={(e) => {
              setNewRefUrl(e.target.value);
              setNewRefLabel(e.target.value);
            }}
            style={{ flex: 1, padding: '3px 6px', fontSize: 11 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddReferenceSubmit();
              }
            }}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={handleAddReferenceSubmit}
            style={{ padding: '3px 8px' }}
            title={t('cards.metadata.addReference')}
          >
            <Plus size={11} />
          </button>
        </div>
      </div>

      {/* 3. Tags Chips with Add/Remove */}
      <div className="rail-section">
        <div className="rail-section-title">
          <Tag size={13} color="var(--accent-purple)" />
          <span>{t('cards.metadata.tags', { count: tags.length })}</span>
        </div>

        {/* Tags Chips Display */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {tags.map((tag, idx) => (
            <span
              key={idx}
              className="tag-chip"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(167, 139, 250, 0.12)',
                borderColor: 'rgba(167, 139, 250, 0.3)',
                color: 'var(--accent-purple)',
              }}
            >
              <span>#{tag}</span>
              <button
                type="button"
                onClick={() => onRemoveTag(idx)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'inherit',
                  opacity: 0.6,
                }}
                title={t('cards.metadata.removeTag', { tag })}
              >
                <X size={10} />
              </button>
            </span>
          ))}

          {tags.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>
              {t('cards.metadata.noTags')}
            </div>
          )}
        </div>

        {/* Add Tag Input */}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            className="form-input"
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            placeholder={t('cards.metadata.tagPlaceholder')}
            style={{ fontSize: 11.5, padding: '4px 8px', flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTagSubmit();
              }
            }}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={handleAddTagSubmit}
            style={{ padding: '4px 10px', fontSize: 11 }}
          >
            <Plus size={11} color="#a78bfa" />
            <span>{t('cards.metadata.add')}</span>
          </button>
        </div>
      </div>
    </>
  );
};
