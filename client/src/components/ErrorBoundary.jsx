import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught component crash:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-red-50 border border-red-200 rounded-2xl my-4 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <h3 className="text-lg font-bold text-red-800 mb-2">Something went wrong</h3>
          <p className="text-sm text-red-600 mb-4 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred in this section of the app.'}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            Reload App / Reset Section
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
