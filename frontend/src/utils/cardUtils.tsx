import React from 'react';
import { Video, Camera, Share2, Code2, AtSign, Send, Globe } from 'lucide-react';
import type { TranslateFn, TranslatePluralFn } from '../i18n';

export function getPlatformInfo(url?: string): { name: string; icon: React.ReactNode; color: string } {
  if (!url) return { name: 'Web', icon: <Globe size={11} />, color: 'var(--text-dim, #64748b)' };
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    return { name: 'YouTube', icon: <Video size={11} />, color: '#ef4444' };
  }
  if (lower.includes('instagram.com')) {
    return { name: 'Instagram', icon: <Camera size={11} />, color: '#ec4899' };
  }
  if (lower.includes('facebook.com') || lower.includes('fb.watch')) {
    return { name: 'Facebook', icon: <Share2 size={11} />, color: '#3b82f6' };
  }
  if (lower.includes('github.com')) {
    return { name: 'GitHub', icon: <Code2 size={11} />, color: 'var(--text-main, #334155)' };
  }
  if (lower.includes('twitter.com') || lower.includes('x.com')) {
    return { name: 'X', icon: <AtSign size={11} />, color: '#38bdf8' };
  }
  if (lower.includes('t.me') || lower.includes('telegram.me')) {
    return { name: 'Telegram', icon: <Send size={11} />, color: '#0ea5e9' };
  }
  return { name: 'Web', icon: <Globe size={11} />, color: 'var(--text-dim, #64748b)' };
}

export function formatRelativeAge(
  dateStr: string | undefined,
  t: TranslateFn,
  tp: TranslatePluralFn
): string {
  if (!dateStr) return '';
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return '';
  const diffSec = Math.floor((Date.now() - time) / 1000);
  if (diffSec < 60) return t('cards.age.now');
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t('cards.age.minutes', { count: diffMin });
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return t('cards.age.hours', { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return t('cards.age.days', { count: diffDays });
  const diffMonths = Math.floor(diffDays / 30);
  return tp('cards.age.months', diffMonths);
}

export function extractHostname(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return trimmed.split('/')[0].replace(/^www\./i, '');
  }
}

