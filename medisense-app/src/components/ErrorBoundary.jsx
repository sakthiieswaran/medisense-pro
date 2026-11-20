import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { COLORS, Card, Heading } from "../shared.jsx";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || "Unexpected render error" };
  }

  componentDidCatch(error, info) {
    console.error("[MediSense ErrorBoundary]", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, errorMessage: "" });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Card className="p-6 max-w-lg mx-auto my-10 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ background: COLORS.dangerSoft }}
        >
          <AlertTriangle size={22} color={COLORS.coral} />
        </div>
        <Heading size={19} className="mb-1">
          Unable to display this screen
        </Heading>
        <p className="text-[13.5px] mb-5" style={{ color: COLORS.inkSoft }}>
          Something unexpected happened while rendering this view. Your health data remains safely saved.
        </p>
        <button
          onClick={this.reset}
          className="inline-flex items-center gap-2 text-[13.5px] font-semibold px-5 py-2.5 rounded-[10px] text-white shadow-sm hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{ background: COLORS.primary, "--tw-ring-color": COLORS.primary }}
        >
          <RefreshCw size={14} /> Try again
        </button>
      </Card>
    );
  }
}
