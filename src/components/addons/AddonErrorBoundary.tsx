import { Component, type ErrorInfo, type ReactNode } from "react";

export interface AddonErrorBoundaryProps {
  addonId?: string;
  slotId?: string;
  fallback?: ReactNode;
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface AddonErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AddonErrorBoundary extends Component<
  AddonErrorBoundaryProps,
  AddonErrorBoundaryState
> {
  constructor(props: AddonErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): AddonErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { addonId, slotId, onError } = this.props;
    if (process.env.NODE_ENV !== "production") {
      console.error(
        `[AddonErrorBoundary] Failed to render slot "${slotId || "unknown"}" (addon: "${addonId || "unknown"}"):`,
        error,
        errorInfo,
      );
    }
    onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
