import { Component, type ReactNode } from "react";
import { reportError } from "@/lib/error-reporter";
import { ErrorRetry } from "@/components/ui/ErrorRetry";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    if (import.meta.env.DEV) console.error("[ErrorBoundary]", error, info);
    reportError({
      errorType: "frontend_crash",
      errorMessage: error.message || "Component crash",
      stackTrace: error.stack,
      componentName: info.componentStack?.split("\n")[1]?.trim() || undefined,
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-gray-50">
          <ErrorRetry
            title="Something went wrong"
            description={this.state.error?.message || "An unexpected error occurred."}
            onRetry={this.handleRetry}
            variant="page"
          />
        </div>
      );
    }
    return this.props.children;
  }
}
