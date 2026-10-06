import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  fallback: ReactNode;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Mapbox GL throws while starting up when the device has no WebGL (old phones, some locked-down
 * browsers, headless test runners). Without this boundary that error would take down the whole
 * page; with it, only the map is replaced by a notice and every list and link keeps working.
 */
export class MapErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn("The map could not start:", error.message, info.componentStack);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
