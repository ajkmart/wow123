import { Component, type ReactNode } from "react";
import { reportError } from "../lib/error-reporter";
import { vendorIsDev } from "../lib/envValidation";

type FallbackFn = (reset: () => void, error: Error | null) => ReactNode;

interface Props { children: ReactNode; fallback?: ReactNode | FallbackFn; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    if (vendorIsDev) console.error("[ErrorBoundary]", error, info);
    reportError({
      errorType: "frontend_crash",
      errorMessage: error.message || "Component crash",
      stackTrace: error.stack || info.componentStack,
      componentName: "ErrorBoundary",
    });
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      if (typeof fallback === "function") {
        return (fallback as FallbackFn)(this.reset, this.state.error);
      }
      if (fallback != null) return fallback;
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-white">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Kuch galat ho gaya / Something went wrong</h1>
          <p className="text-gray-500 text-sm mb-6">{this.state.error?.message || "Ek bekaar ghalti aayi. / An unexpected error occurred."}</p>
          <button
            onClick={this.reset}
            className="px-5 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700"
          >
            Dobara koshish karein / Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
