import React, { useState, useEffect, useCallback } from 'react';
import { Card, Tag, DigestData } from './types';
import * as api from './api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { KanbanBoard } from './components/KanbanBoard';
import { TriageView } from './components/TriageView';
import { DigestView } from './components/DigestView';
import { CardModal } from './components/CardModal';
import { NewCardModal } from './components/NewCardModal';
import { Bell } from 'lucide-react';

export function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [digest, setDigest] = useState<DigestData | null>(null);

  // Filters & Navigation
  const [viewMode, setViewMode] = useState<'kanban' | 'triage' | 'digest'>('kanban');
  const [horizon, setHorizon] = useState('');
  const [status, setStatus] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [query, setQuery] = useState('');

  // Modals & Feedback
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    const flashEl = document.getElementById('flash');
    if (flashEl) flashEl.textContent = msg;
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
      if (flashEl && flashEl.textContent === msg) flashEl.textContent = '';
    }, 3500);
  }, []);

  const loadCards = useCallback(async () => {
    try {
      const data = await api.fetchCards({
        horizon,
        status,
        tag: selectedTag,
        q: query,
      });
      setCards(data);
    } catch (err: any) {
      showToast(err.message);
    }
  }, [horizon, status, selectedTag, query, showToast]);

  const loadTags = useCallback(async () => {
    try {
      const data = await api.fetchTags();
      setTags(data);
    } catch (err: any) {
      showToast(err.message);
    }
  }, [showToast]);

  const loadDigest = useCallback(async () => {
    try {
      const data = await api.fetchDigest();
      setDigest(data);
    } catch (err: any) {
      showToast(err.message);
    }
  }, [showToast]);

  const reloadAll = useCallback(() => {
    loadCards();
    loadTags();
    if (viewMode === 'digest') loadDigest();
  }, [loadCards, loadTags, loadDigest, viewMode]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    if (viewMode === 'digest') {
      loadDigest();
    } else {
      loadCards();
    }
  }, [viewMode, loadCards, loadDigest]);

  // The share-sheet POST redirects back to here with ?captured=true: confirm
  // the capture and refresh so the new card is on screen. The query is scrubbed
  // so a reload does not toast (or refetch) a second time.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('captured') !== 'true') return;
    showToast('Captured new spark from Share Sheet!');
    window.history.replaceState({}, '', window.location.pathname);
    reloadAll();
  }, [showToast, reloadAll]);

  // Card status change
  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.updateCard(id, { status: newStatus as any });
      showToast(`Updated card #${id} → ${newStatus}`);
      reloadAll();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // Trigger Research
  const handleResearch = async (id: number) => {
    try {
      await api.triggerResearch(id);
      showToast(`Research queued for card #${id}`);
      reloadAll();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // Retry Card
  const handleRetry = async (id: number) => {
    try {
      await api.retryCard(id);
      showToast(`Retried extraction for card #${id}`);
      reloadAll();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // Create Card
  const handleCreateCard = async (newCard: Partial<Card>) => {
    try {
      await api.createCard(newCard);
      showToast('Spark captured successfully!');
      reloadAll();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // Update Card
  const handleUpdateCard = async (id: number, patch: Partial<Card>) => {
    try {
      await api.updateCard(id, patch);
      showToast(`Saved changes to card #${id}`);
      reloadAll();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  return (
    <div className="app-container">
      <Header
        query={query}
        onQueryChange={setQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenNewCard={() => setIsNewModalOpen(true)}
        onTriggerResearch={handleResearch}
        flashMessage={toastMessage || ''}
      />

      <div className="main-layout">
        <Sidebar
          horizon={horizon}
          onHorizonChange={setHorizon}
          status={status}
          onStatusChange={setStatus}
          selectedTag={selectedTag}
          onTagSelect={setSelectedTag}
          tags={tags}
        />

        <main className="content-area">
          {viewMode === 'triage' && (
            <TriageView
              cards={cards}
              onStatusChange={handleStatusChange}
              onResearch={handleResearch}
              onRetry={handleRetry}
              onOpenCardDetail={setSelectedCard}
              onRefresh={reloadAll}
            />
          )}

          {viewMode === 'kanban' && (
            <KanbanBoard
              cards={cards}
              onSelectCard={setSelectedCard}
              onStatusChange={handleStatusChange}
              onResearch={handleResearch}
              onRetry={handleRetry}
            />
          )}

          {viewMode === 'digest' && (
            <DigestView
              digest={digest}
              onSelectCard={setSelectedCard}
              onStatusChange={handleStatusChange}
              onResearch={handleResearch}
              onRetry={handleRetry}
            />
          )}
        </main>
      </div>

      {/* Card Detail Modal */}
      {selectedCard && (
        <CardModal
          key={selectedCard.id}
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleUpdateCard}
          onResearch={handleResearch}
          onRetry={handleRetry}
          showToast={showToast}
        />
      )}

      {/* New Card Modal */}
      {isNewModalOpen && (
        <NewCardModal
          onClose={() => setIsNewModalOpen(false)}
          onCreate={handleCreateCard}
        />
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="toast">
          <Bell size={16} color="#818cf8" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;