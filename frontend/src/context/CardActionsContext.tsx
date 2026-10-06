import React, { createContext, useContext, ReactNode } from 'react';
import { Card } from '../types';

export interface CardActions {
  onSelectCard: (card: Card | null) => void;
  onStatusChange: (id: number, status: string) => Promise<void> | void;
  onResearch: (id: number) => Promise<void> | void;
  onRetry: (id: number) => Promise<void> | void;
  onUpdateCard?: (id: number, patch: Partial<Card>) => Promise<void> | void;
  showToast: (msg: string) => void;
}

const CardActionsContext = createContext<CardActions | null>(null);

export interface CardActionsProviderProps {
  value: CardActions;
  children: ReactNode;
}

export const CardActionsProvider: React.FC<CardActionsProviderProps> = ({ value, children }) => {
  return (
    <CardActionsContext.Provider value={value}>
      {children}
    </CardActionsContext.Provider>
  );
};

export function useCardActions(): CardActions {
  const ctx = useContext(CardActionsContext);
  if (!ctx) {
    throw new Error('useCardActions must be used within a CardActionsProvider');
  }
  return ctx;
}
