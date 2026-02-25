import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class SemanticConfirmationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[SemanticConfirmationErrorBoundary] Confirmation rendering failed", {
      error,
      errorInfo,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="agent-message-row">
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">I couldn&apos;t prepare that confirmation safely.</div>
              <div className="mt-1 text-xs opacity-90">
                Please retry so I can prepare it again using the latest information.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
