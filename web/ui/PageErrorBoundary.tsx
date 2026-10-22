import { Component, type ReactNode } from 'react';
import { ErrorBanner } from './ErrorBanner.js';

interface Props {
  resetKey: unknown;
  children: ReactNode;
}
interface State {
  error: Error | null;
  resetKey: unknown;
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error): void {
    console.error(error);
  }

  render() {
    return this.state.error ? <ErrorBanner>Bot error: unexpected data</ErrorBanner> : this.props.children;
  }
}
