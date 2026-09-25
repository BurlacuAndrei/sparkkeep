# Prompt 16 — Fix Stale State in `CardModal`

## Goal
Fix the `CardModal` component so it correctly resets its local state when a different card is opened.

## Problem
`CardModal.tsx` (lines 20-30) initializes `useState` hooks from `card` props. React hooks don't re-initialize when props change — they only run on first mount. Opening Card A, then clicking Card B, shows Card A's data in the form.

## Changes Required

1. **`frontend/src/components/CardModal.tsx`**:
   - **Option A (Recommended)**: Add a `key` prop to the `CardModal` in `App.tsx` so React remounts the component:
     ```tsx
     <CardModal
       key={selectedCard?.id ?? 'none'}
       card={selectedCard}
       ...
     />
     ```
   - **Option B**: Use `useEffect` to sync state when `card` prop changes:
     ```tsx
     useEffect(() => {
       if (card) {
         setTitle(card.title);
         setSummary(card.summary);
         // ... reset all fields
       }
     }, [card]);
     ```
   - Option A is simpler and more correct (fresh React instance per card).

2. **`frontend/src/App.tsx`**:
   - If using Option A, add `key={selectedCard?.id}` to the `<CardModal>` JSX

## Acceptance Criteria
- Opening Card A then Card B shows Card B's data correctly
- Form edits on Card A don't bleed into Card B's view
- No regressions in card editing flow

## Severity: HIGH
