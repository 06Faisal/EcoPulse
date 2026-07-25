import React from 'react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    /** Name of the screen being guarded. When set, the boundary renders inline
     *  and offers a retry, so one failing tab cannot blank the entire app. */
    section?: string;
    /** Changing this value clears the error — used to reset on tab change. */
    resetKey?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, error: null };

    // This project's TS setup does not resolve `this.props` / `this.setState`
    // on the class directly (the original render() already worked around it
    // with a cast); these accessors keep that workaround in one place.
    private get self(): React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
        return this as React.Component<ErrorBoundaryProps, ErrorBoundaryState>;
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidUpdate(prev: ErrorBoundaryProps) {
        // Navigating away from a broken screen should clear it, otherwise the
        // error persists over every subsequent tab.
        if (this.state.hasError && prev.resetKey !== this.self.props.resetKey) {
            this.self.setState({ hasError: false, error: null });
        }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('EcoPulse Error Boundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError && this.self.props.section) {
            return (
                <div className="py-16 px-6 text-center">
                    <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 text-xl mx-auto mb-4">
                        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                    </div>
                    <h2 className="text-base font-bold text-slate-800 dark:text-white mb-1">
                        {this.self.props.section} could not be displayed
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                        The rest of the app is still working. Switch tabs, or try again.
                    </p>
                    <button
                        onClick={() => this.self.setState({ hasError: false, error: null })}
                        className="px-5 py-2.5 bg-slate-900 dark:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-colors"
                    >
                        Try again
                    </button>
                </div>
            );
        }

        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
                    <div className="w-full max-w-md text-center">
                        <div className="w-16 h-16 bg-rose-500/10 rounded-3xl flex items-center justify-center text-rose-500 text-3xl mx-auto mb-6">
                            <i className="fa-solid fa-triangle-exclamation" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                            Something went wrong
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                            EcoPulse encountered an unexpected error. Your data is safe — try reloading the app.
                        </p>
                        {this.state.error && (
                            <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-xl text-[0.6875rem] text-slate-400 font-mono mb-6 text-left break-all">
                                {this.state.error.message}
                            </div>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white py-4 px-5 rounded-2xl font-bold uppercase tracking-[0.08em] shadow-xl transition-colors"
                        >
                            Reload App
                        </button>
                    </div>
                </div>
            );
        }

        return this.self.props.children;
    }
}

export default ErrorBoundary;
