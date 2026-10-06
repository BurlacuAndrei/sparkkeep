import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { SelectOption } from './selectOptions';

export interface CustomSelectProps<T extends string = string> {
  id?: string;
  name?: string;
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

export function CustomSelect<T extends string = string>({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className = '',
  triggerClassName = '',
  size = 'md',
  ariaLabel,
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const reactId = useId();
  const selectId = id || `custom-select-${reactId}`;
  const listboxId = `${selectId}-listbox`;

  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const activeIndex = focusedIndex >= 0 ? focusedIndex : (selectedIndex >= 0 ? selectedIndex : 0);

  // Handle click outside to close dropdown
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen]);

  // Ensure focused item scrolls into view on arrow navigation
  useEffect(() => {
    if (isOpen && activeIndex >= 0 && menuRef.current) {
      const itemEl = menuRef.current.children[activeIndex] as HTMLElement | undefined;
      itemEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, activeIndex]);

  const handleSelect = (opt: SelectOption<T>) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setIsOpen(false);
    setFocusedIndex(-1);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const base = prev >= 0 ? prev : (selectedIndex >= 0 ? selectedIndex : 0);
          return base + 1 < options.length ? base + 1 : 0;
        });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const base = prev >= 0 ? prev : (selectedIndex >= 0 ? selectedIndex : 0);
          return base - 1 >= 0 ? base - 1 : options.length - 1;
        });
        break;
      }
      case 'Home': {
        e.preventDefault();
        setFocusedIndex(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        setFocusedIndex(options.length - 1);
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        e.stopPropagation();
        if (activeIndex >= 0 && activeIndex < options.length) {
          handleSelect(options[activeIndex]);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        setFocusedIndex(-1);
        triggerRef.current?.focus();
        break;
      }
      case 'Tab': {
        setIsOpen(false);
        setFocusedIndex(-1);
        break;
      }
      default:
        break;
    }
  };

  const toggleOpen = () => {
    if (disabled) return;
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
      } else {
        setFocusedIndex(-1);
      }
      return next;
    });
  };

  return (
    <div
      ref={wrapperRef}
      className={`custom-select-wrapper ${isOpen ? 'is-open' : ''} ${className}`}
      onKeyDown={handleKeyDown}
    >
      {name && <input type="hidden" name={name} value={value} />}

      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        className={`custom-select-trigger size-${size} ${isOpen ? 'is-open' : ''} ${triggerClassName}`}
        onClick={toggleOpen}
      >
        <span className="custom-select-value">
          {selectedOption ? (
            <>
              {selectedOption.icon && <span className="custom-select-icon">{selectedOption.icon}</span>}
              <span className="custom-select-label">{selectedOption.label}</span>
              {selectedOption.badge && <span className="custom-select-badge">{selectedOption.badge}</span>}
            </>
          ) : (
            <span className="custom-select-placeholder">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={size === 'sm' ? 13 : 15}
          strokeWidth={1.75}
          className={`custom-select-chevron ${isOpen ? 'open' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel || 'Options'}
          className={`custom-select-menu size-${size}`}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isFocused = idx === activeIndex;

            return (
              <button
                key={opt.value}
                id={`${listboxId}-option-${idx}`}
                role="option"
                type="button"
                aria-selected={isSelected}
                disabled={opt.disabled}
                className={`custom-select-item size-${size} ${isSelected ? 'is-selected' : ''} ${
                  isFocused ? 'is-focused' : ''
                }`}
                onClick={() => handleSelect(opt)}
                onMouseEnter={() => setFocusedIndex(idx)}
              >
                <div className="custom-select-item-content">
                  {opt.icon && <span className="custom-select-item-icon">{opt.icon}</span>}
                  <span className="custom-select-item-label">{opt.label}</span>
                  {opt.description && <span className="custom-select-item-desc">{opt.description}</span>}
                  {opt.badge && <span className="custom-select-item-badge">{opt.badge}</span>}
                </div>
                {isSelected && (
                  <Check size={size === 'sm' ? 13 : 14} strokeWidth={2} className="custom-select-check-icon" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
