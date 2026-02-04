import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-slate-950 p-8">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-triangle-exclamation text-3xl text-rose-500"></i>
            </div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white text-center mb-4">
              Something Went Wrong
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6">
              We encountered an unexpected error. Don't worry, your data is safe.
            </p>
            <button
              onClick={this.handleReset}
              className="w-full bg-emerald-500 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-emerald-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
