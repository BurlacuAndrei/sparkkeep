import React from 'react';
import { AlertTriangle } from 'lucide-react';
// The boundary sits above LocaleProvider, so it translates through the
// locale-independent helper instead of the hook.
import { translateCurrent } from '../i18n';

interface State {
  hasError: boolean;
  error?: Error;
}

interface FallbackProps {
  error?: Error;
  onReload: () => void;
}

const ErrorFallback: React.FC<FallbackProps> = ({ error, onReload }) => {
  return (
    <div style={{
      padding: 40,
      textAlign: 'center',
      color: 'var(--text-main)',
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    }}>
      <div style={{
        width: 52,
        height: 52,
        borderRadius: '50%',
        background: 'rgba(244, 63, 94, 0.1)',
        border: '1px solid rgba(244, 63, 94, 0.25)',
        color: '#fb7185',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <AlertTriangle size={24} strokeWidth={1.5} />
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>{translateCurrent('errors.title')}</h2>
      <p style={{ color: 'var(--text-dim)', maxWidth: 400, fontSize: 13.5, lineHeight: 1.6 }}>
        {error?.message || translateCurrent('errors.description')}
      </p>
      <button
        type="button"
        className="btn-primary"
        onClick={onReload}
        style={{ marginTop: 8 }}
      >
        {translateCurrent('errors.reload')}
      </button>
    </div>
  );
};

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
        <ErrorFallback
          error={this.state.error}
          onReload={() => {
            this.setState({ hasError: false });
            window.location.reload();
          }}
        />
      );
    }
    return this.props.children;
  }
}
