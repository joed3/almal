import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-8 max-w-xl mx-auto mt-16 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-300 font-semibold mb-2">Something went wrong</p>
          <p className="text-red-400 text-sm font-mono">{this.state.error.message}</p>
          <button
            className="mt-4 px-4 py-2 text-sm rounded bg-red-800 text-red-100 hover:bg-red-700"
            onClick={() => this.setState({ error: null })}
          >
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
