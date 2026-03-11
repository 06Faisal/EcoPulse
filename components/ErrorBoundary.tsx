import React from 'react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('EcoPulse Error Boundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
                    <div className="w-full max-w-md text-center">
                        <div className="w-16 h-16 bg-rose-500/10 rounded-3xl flex items-center justify-center text-rose-500 text-3xl mx-auto mb-6">
                            <i className="fa-solid fa-triangle-exclamation" />
                        </div>
                        <h1 className="text-2xl font-black text-slate-800 dark:text-white mb-2">
                            Something went wrong
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                            EcoPulse encountered an unexpected error. Your data is safe — try reloading the app.
                        </p>
                        {this.state.error && (
                            <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-xl text-[11px] text-slate-400 font-mono mb-6 text-left break-all">
                                {this.state.error.message}
                            </div>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white py-4 px-5 rounded-2xl font-black uppercase tracking-[0.18em] shadow-xl transition-colors"
                        >
                            Reload App
                        </button>
                    </div>
                </div>
            );
        }

        return (this as React.Component<ErrorBoundaryProps, ErrorBoundaryState>).props.children;
    }
}

export default ErrorBoundary;
