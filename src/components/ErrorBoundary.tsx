import React, { Component, ErrorInfo, ReactNode } from 'react';

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
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetStorage = () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('ujalaa_dairy_state_v1');
      } catch (e) {
        console.error('Error clearing storage:', e);
      }
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              !
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              Ujalaa Dairy — ऐप लोड करने में समस्या आई
            </h1>
            <p className="text-sm text-slate-600">
              एप्लिकेशन में कोई अप्रत्याशित समस्या हुई है। आप पेज को पुनः लोड कर सकते हैं या डेटा को रीफ्रेश कर सकते हैं।
            </p>
            {this.state.error?.message && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs font-mono text-left overflow-auto max-h-32 border border-red-200">
                {this.state.error.message}
              </div>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition"
              >
                पेज पुनः लोड करें (Reload)
              </button>
              <button
                type="button"
                onClick={this.handleResetStorage}
                className="w-full py-2 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium rounded-xl transition"
              >
                कैश साफ़ करें और रीसेट करें (Reset & Reload)
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
