import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewCardModal } from './NewCardModal';
import { LocaleProvider } from '../i18n';

const renderModal = (ui: React.ReactElement) =>
  render(<LocaleProvider locale="en">{ui}</LocaleProvider>);

describe('NewCardModal Smart Capture and Manual Fallback', () => {
  it('renders modal with initial focus and placeholder', () => {
    const handleClose = vi.fn();
    renderModal(<NewCardModal onClose={handleClose} />);

    expect(screen.getByText('Capture Spark')).toBeDefined();
    expect(screen.getByPlaceholderText(/Paste URL \(article, GitHub repo/i)).toBeDefined();
  });

  it('captures a URL successfully and calls onClose', async () => {
    const handleClose = vi.fn();
    const handleCapture = vi.fn().mockResolvedValue([1]);

    renderModal(<NewCardModal onClose={handleClose} onCapture={handleCapture} />);

    const sourceInput = screen.getByPlaceholderText(/Paste URL \(article, GitHub repo/i);
    fireEvent.change(sourceInput, { target: { value: 'https://example.com/article' } });

    const submitBtn = screen.getByRole('button', { name: /Capture & Synthesize/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleCapture).toHaveBeenCalledWith({
        url: 'https://example.com/article',
        caption: undefined,
        file: null,
      });
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('captures a text spark note successfully', async () => {
    const handleClose = vi.fn();
    const handleCapture = vi.fn().mockResolvedValue([2]);

    renderModal(<NewCardModal onClose={handleClose} onCapture={handleCapture} />);

    const sourceInput = screen.getByPlaceholderText(/Paste URL \(article, GitHub repo/i);
    fireEvent.change(sourceInput, { target: { value: 'Refactor database indexing layer' } });

    const submitBtn = screen.getByRole('button', { name: /Capture & Synthesize/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleCapture).toHaveBeenCalledWith({
        text: 'Refactor database indexing layer',
        caption: undefined,
        file: null,
      });
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('displays noise gate or server error message upon capture failure', async () => {
    const handleClose = vi.fn();
    const handleCapture = vi.fn().mockRejectedValue(new Error('Discarded by Noise Gate: engagement bait detected'));

    renderModal(<NewCardModal onClose={handleClose} onCapture={handleCapture} />);

    const sourceInput = screen.getByPlaceholderText(/Paste URL \(article, GitHub repo/i);
    fireEvent.change(sourceInput, { target: { value: 'https://clickbait.example.com' } });

    const submitBtn = screen.getByRole('button', { name: /Capture & Synthesize/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Discarded by Noise Gate/i)).toBeDefined();
      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  it('supports manual card creation when expanding manual fallback', async () => {
    const handleClose = vi.fn();
    const handleCreate = vi.fn().mockResolvedValue(undefined);

    renderModal(<NewCardModal onClose={handleClose} onCreate={handleCreate} />);

    const manualToggle = screen.getByRole('button', { name: /Need a blank card without AI/i });
    fireEvent.click(manualToggle);

    const titleInput = screen.getByPlaceholderText('Title of spark');
    fireEvent.change(titleInput, { target: { value: 'Local AI Transcription' } });

    const summaryInput = screen.getByPlaceholderText('Summary...');
    fireEvent.change(summaryInput, { target: { value: 'Quantized whisper running locally' } });

    const saveBtn = screen.getByRole('button', { name: /Create Blank Card/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Local AI Transcription',
          summary: 'Quantized whisper running locally',
          horizon: 'short-term',
          status: 'inbox',
        })
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('closes on Escape key press', () => {
    const handleClose = vi.fn();
    renderModal(<NewCardModal onClose={handleClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalled();
  });
});
