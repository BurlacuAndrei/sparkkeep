import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './Sidebar';

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
      <Sidebar
        tags={dummyTags}
        selectedTag=""
        onTagSelect={onTagSelect}
        isCollapsed={true}
        onToggleCollapse={onToggleCollapse}
      />
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
      <Sidebar
        tags={dummyTags}
        selectedTag="ai"
        onTagSelect={onTagSelect}
        isCollapsed={true}
        onToggleCollapse={onToggleCollapse}
      />
    );

    const verticalTab = screen.getByRole('button', { name: /TAGS · ai/i });
    expect(verticalTab).toBeDefined();
    expect(verticalTab.classList.contains('has-active-tag')).toBe(true);
  });

  it('renders expanded state with tags and collapse button when isCollapsed is false', () => {
    const onToggleCollapse = vi.fn();
    const onTagSelect = vi.fn();

    render(
      <Sidebar
        tags={dummyTags}
        selectedTag=""
        onTagSelect={onTagSelect}
        isCollapsed={false}
        onToggleCollapse={onToggleCollapse}
      />
    );

    expect(screen.getByText('#ai')).toBeDefined();
    expect(screen.getByText('#devtools')).toBeDefined();

    const collapseBtn = screen.getByTitle('Collapse sidebar');
    expect(collapseBtn).toBeDefined();

    fireEvent.click(collapseBtn);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });
});
