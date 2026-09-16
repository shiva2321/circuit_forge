import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by CircuitForge ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900/90 border border-rose-500/40 rounded-2xl p-6 shadow-2xl backdrop-blur text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Circuit Studio Recovery</h2>
              <p className="text-xs text-slate-400 mt-1">
                An interface error occurred, but your EDA state and knowledge base remain preserved.
              </p>
            </div>
            {this.state.error && (
              <div className="text-left bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-rose-300 max-h-32 overflow-y-auto">
                {this.state.error.message || 'Unknown render exception'}
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center space-x-2 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Circuit Studio</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
