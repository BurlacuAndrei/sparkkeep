import React, { useState } from 'react';
import { CardComment } from '../../types';
import { MessageSquare, User, Send } from 'lucide-react';
import { useLocale } from '../../i18n';

export interface CardCommentsSectionProps {
  cardId: number;
  comments: CardComment[];
  onAddComment: (content: string) => Promise<void> | void;
}

export const CardCommentsSection: React.FC<CardCommentsSectionProps> = ({
  comments,
  onAddComment,
}) => {
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useLocale();

  const handleSubmit = async () => {
    const trimmed = newComment.trim();
    if (!trimmed || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onAddComment(trimmed);
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rail-section">
      <div className="rail-section-title">
        <MessageSquare size={13} color="var(--accent-amber)" />
        <span>{t('cards.comments.title', { count: comments.length })}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
        {comments.map((c) => (
          <div
            key={c.id}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              padding: 6,
              fontSize: 11.5,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              {/* Author Badge */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 9.5,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: 'var(--color-warning-bg)',
                  color: 'var(--color-warning-text)',
                }}
              >
                <User size={9} />
                <span>{t('cards.comments.user')}</span>
              </span>

              {/* Timestamp */}
              <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                {new Date(c.created_at).toLocaleString()}
              </span>
            </div>

            <div style={{ color: 'var(--text-main)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {c.content}
            </div>
          </div>
        ))}

        {comments.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>
            {t('cards.comments.empty')}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <textarea
          className="form-textarea"
          rows={2}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={t('cards.comments.placeholder')}
          style={{ flex: 1, fontSize: 11.5 }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!newComment.trim() || isSubmitting}
          style={{ padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <Send size={11} />
          <span>{isSubmitting ? t('cards.comments.posting') : t('cards.comments.post')}</span>
        </button>
      </div>
    </div>
  );
};
