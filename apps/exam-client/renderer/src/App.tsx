import React, { Component, ErrorInfo, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AttemptProvider } from './contexts/AttemptContext';
import { ExamPage } from './routes/exam/ExamPage';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-paper flex items-center justify-center p-6 font-sans">
          <div className="bg-paper-raised border border-hairline rounded p-8 max-w-lg w-full text-center shadow-md">
            <h2 className="font-serif text-xl font-bold text-brick mb-2">Something went wrong</h2>
            <p className="text-sm text-ash-muted mb-4">
              An error occurred while loading the exam interface.
            </p>
            <pre className="text-xs bg-paper p-3 rounded border border-hairline text-left overflow-auto max-h-40 font-mono text-ink mb-6">
              {this.state.error?.message || 'Unknown error'}
            </pre>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 bg-ink text-white rounded text-xs font-semibold hover:bg-ink-light transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AttemptProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ExamPage />} />
            <Route path="/exam" element={<ExamPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AttemptProvider>
    </ErrorBoundary>
  );
};

export default App;
