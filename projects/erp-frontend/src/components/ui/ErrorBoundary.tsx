'use client';

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
    console.error('Caratloop ERP Uncaught Error:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-textPrimary flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full glass-card p-8 border border-primary/30 rounded-2xl text-center shadow-2xl space-y-6">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto border border-primary/20">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold font-playfair text-textPrimary">An Unexpected Error Occurred</h2>
              <p className="text-sm text-textSecondary">
                Caratloop ERP encountered a temporary rendering issue. The transaction engine remains intact.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-background p-3 rounded-lg border border-border text-left overflow-x-auto text-xs font-mono text-red-600">
                {this.state.error.message || 'Unknown runtime error'}
              </div>
            )}

            <button
              onClick={this.handleReload}
              className="w-full py-3 bg-primary text-black font-bold uppercase tracking-wider rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2 text-xs shadow-lg shadow-[#D4A843]/20"
            >
              <RefreshCw className="w-4 h-4" /> Reload System Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
