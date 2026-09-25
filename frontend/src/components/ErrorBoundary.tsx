import React from 'react';

interface State {
  hasError: boolean;
  error?: Error;
}

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
        <div style={{
          padding: 40,
          textAlign: 'center',
          color: '#f8fafc',
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(244, 63, 94, 0.15)',
            color: '#fb7185',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
          }}>
            ⚠
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Something went wrong</h2>
          <p style={{ color: '#94a3b8', maxWidth: 400, fontSize: 14, lineHeight: 1.6 }}>
            {this.state.error?.message || 'An unexpected error occurred in the application.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
            style={{
              marginTop: 8,
              padding: '10px 24px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
