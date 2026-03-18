import React from 'react';

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    fontFamily: 'system-ui, sans-serif',
                    color: '#333',
                    padding: '2rem',
                    textAlign: 'center',
                }}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Something went wrong</h2>
                    <p style={{ color: '#666', marginBottom: '1rem', maxWidth: '500px' }}>
                        {this.state.error?.message || 'An unexpected error occurred.'}
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '0.5rem 1.5rem',
                            borderRadius: '0.5rem',
                            border: '1px solid #ddd',
                            background: '#111',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                        }}
                    >
                        Reload
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
