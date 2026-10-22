import { Component, type ReactNode } from 'react';

interface State { failed: boolean }

/** Last resort around the whole shell: a render error must not leave a blank page. */
export class RootErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    console.error(error);
  }

  render() {
    return this.state.failed ? (
      <p className="banner" role="alert">
        Something went wrong — reload the page. <a href="">Reload</a>
      </p>
    ) : (
      this.props.children
    );
  }
}
