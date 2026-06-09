import { Component } from "react";

/**
 * Catches any runtime React error and shows a friendly Hebrew screen
 * instead of the silent white screen of death.  Wrap the app root.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Best-effort log to the console; the user gets a friendly screen anyway.
    // eslint-disable-next-line no-console
    console.error("App crash:", error, info?.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    // Hard reload — easier than trying to recover broken state.
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const msg = String(this.state.error?.message || this.state.error || "שגיאה לא ידועה");

    return (
      <div className="h-full bg-[#0A0A0A] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-red-500/15 flex items-center justify-center mb-5">
          <span className="text-4xl">⚠️</span>
        </div>
        <h1 className="text-white font-black text-2xl mb-2">משהו השתבש</h1>
        <p className="text-gray-400 text-sm leading-relaxed max-w-xs mb-6">
          נתקלנו בבעיה לא צפויה. ננסה לטעון מחדש?
        </p>
        <details className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-6 max-w-sm w-full text-right">
          <summary className="text-gray-500 text-xs cursor-pointer">פרטים טכניים</summary>
          <p className="text-red-300 text-[11px] mt-2 break-words font-mono leading-relaxed">
            {msg.slice(0, 300)}
          </p>
        </details>
        <button onClick={this.reset}
          className="bg-brand-500 text-white font-bold px-6 py-3.5 rounded-2xl active:bg-brand-600 shadow-lg shadow-brand-500/30">
          🔄 טען מחדש
        </button>
      </div>
    );
  }
}
