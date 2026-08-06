import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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
    console.error('Uncaught error:', error, errorInfo);
  }

  // Duck-typed rather than `instanceof ApiError` -- admin and client portals each define their own
  // ApiError class (see api/client.ts), and this shared component can't import either without a
  // circular dependency. Both set status 0 when axios gets no response at all (server unreachable).
  private isServerDown(): boolean {
    const error = this.state.error as (Error & { status?: number }) | null;
    return error?.status === 0 || error?.message === 'Network Error';
  }

  private handleReset = () => {
    // A network-failed request (e.g. the config fetch every page suspends on) is cached as a
    // rejected promise -- resetting state just re-throws the same error immediately. Reload instead
    // so the app actually retries once the server is back.
    if (this.isServerDown()) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      const serverDown = this.isServerDown();
      return (
        <div className="mx-auto my-12 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">
            {serverDown ? 'Server unavailable' : 'Something went wrong'}
          </h2>
          <p className="mt-2 text-sm text-red-700 dark:text-red-400">
            {serverDown
              ? "We can't reach the server right now. Please check your connection and try again shortly."
              : this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-red-700 transition"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
