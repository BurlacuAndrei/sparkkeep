import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { LocaleProvider } from '../i18n';

describe('Sidebar', () => {
  const dummyTags = [
    { name: 'ai', count: 5 },
    { name: 'devtools', count: 3 },
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  it('renders collapsed state with vertical tab when isCollapsed is true', () => {
    const onToggleCollapse = vi.fn();
    const onTagSelect = vi.fn();

    render(
      <LocaleProvider locale="en">
        <Sidebar
          tags={dummyTags}
          selectedTag=""
          onTagSelect={onTagSelect}
          isCollapsed={true}
          onToggleCollapse={onToggleCollapse}
        />
      </LocaleProvider>
    );

    const verticalTab = screen.getByRole('button', { name: /TAGS/i });
    expect(verticalTab).toBeDefined();
    expect(screen.queryByText('devtools')).toBeNull();

    fireEvent.click(verticalTab);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('renders active tag indicator in collapsed state', () => {
    const onToggleCollapse = vi.fn();
    const onTagSelect = vi.fn();

    render(
      <LocaleProvider locale="en">
        <Sidebar
          tags={dummyTags}
          selectedTag="ai"
          onTagSelect={onTagSelect}
          isCollapsed={true}
          onToggleCollapse={onToggleCollapse}
        />
      </LocaleProvider>
    );

    const verticalTab = screen.getByRole('button', { name: /TAGS · ai/i });
    expect(verticalTab).toBeDefined();
    expect(verticalTab.classList.contains('has-active-tag')).toBe(true);
  });

  it('renders expanded state with tags and collapse button when isCollapsed is false', () => {
    const onToggleCollapse = vi.fn();
    const onTagSelect = vi.fn();

    render(
      <LocaleProvider locale="en">
        <Sidebar
          tags={dummyTags}
          selectedTag=""
          onTagSelect={onTagSelect}
          isCollapsed={false}
          onToggleCollapse={onToggleCollapse}
        />
      </LocaleProvider>
    );

    expect(screen.getByText('#ai')).toBeDefined();
    expect(screen.getByText('#devtools')).toBeDefined();

    const collapseBtn = screen.getByTitle('Collapse sidebar');
    expect(collapseBtn).toBeDefined();

    fireEvent.click(collapseBtn);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar Romanian locale', () => {
  it('renders translated tag panel, clear action, and support link', () => {
    const onToggleCollapse = vi.fn();
    const onTagSelect = vi.fn();

    render(
      <LocaleProvider locale="ro">
        <Sidebar
          tags={[{ name: 'ai', count: 5 }]}
          selectedTag="ai"
          onTagSelect={onTagSelect}
          isCollapsed={false}
          onToggleCollapse={onToggleCollapse}
        />
      </LocaleProvider>
    );

    expect(screen.getByText('Etichete')).toBeDefined();
    expect(screen.getByText('Golește')).toBeDefined();
    expect(screen.getByTitle('Restrânge bara laterală')).toBeDefined();
    expect(screen.getByText('Cumpără-mi o cafea')).toBeDefined();
  });

  it('renders the populated tag list in Romanian', () => {
    render(
      <LocaleProvider locale="ro">
        <Sidebar
          tags={[{ name: 'ai', count: 5 }]}
          selectedTag=""
          onTagSelect={vi.fn()}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      </LocaleProvider>
    );

    expect(screen.getByText('#ai')).toBeDefined();
  });

  it('renders the empty state in Romanian', () => {
    render(
      <LocaleProvider locale="ro">
        <Sidebar
          tags={[]}
          selectedTag=""
          onTagSelect={vi.fn()}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      </LocaleProvider>
    );

    expect(screen.getByText('Încă nicio etichetă')).toBeDefined();
  });

  it('renders the collapsed tab in Romanian', () => {
    render(
      <LocaleProvider locale="ro">
        <Sidebar
          tags={[]}
          selectedTag=""
          onTagSelect={vi.fn()}
          isCollapsed={true}
          onToggleCollapse={vi.fn()}
        />
      </LocaleProvider>
    );

    expect(screen.getByRole('button', { name: /ETICHETE/i })).toBeDefined();
  });
});
