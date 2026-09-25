# Prompt 17 — Add React Error Boundary

## Goal
Wrap the main app in a React Error Boundary so rendering errors don't white-screen the entire application.

## Problem
If any component throws during render (e.g., unexpected null data, missing field), the entire React tree unmounts and the user sees a blank page with no way to recover.

## Changes Required

1. **Create `frontend/src/components/ErrorBoundary.tsx`**:
   ```tsx
   import React from 'react';

   interface State { hasError: boolean; error?: Error }

   export class ErrorBoundary extends React.Component<
     { children: React.ReactNode },
     State
   > {
     state: State = { hasError: false };

     static getDerivedStateFromError(error: Error): State {
       return { hasError: true, error };
     }

     render() {
       if (this.state.hasError) {
         return (
           <div style={{ padding: 40, textAlign: 'center', color: '#f8fafc' }}>
             <h2>Something went wrong</h2>
             <p style={{ color: '#94a3b8' }}>{this.state.error?.message}</p>
             <button
               onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
               style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}
             >
               Reload
             </button>
           </div>
         );
       }
       return this.props.children;
     }
   }
   ```

2. **`frontend/src/main.tsx`**: Wrap `<App />` with `<ErrorBoundary>`:
   ```tsx
   <ErrorBoundary><App /></ErrorBoundary>
   ```

## Acceptance Criteria
- Rendering errors show a styled fallback with a reload button
- The app shell (header/sidebar) survives if the content area throws
- Normal rendering is unaffected

## Severity: MEDIUM
