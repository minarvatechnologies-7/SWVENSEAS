import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ error, info });
    console.error("App crash:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace", background: "#fff", minHeight: "100vh" }}>
          <div style={{ background: "#fef2f2", border: "2px solid #ef4444", borderRadius: 12, padding: 24, maxWidth: 800, margin: "40px auto" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#ef4444", marginBottom: 12 }}>⚠ App Error (screenshot this)</div>
            <div style={{ fontSize: 14, color: "#1e293b", fontWeight: 700, marginBottom: 8 }}>
              {this.state.error.toString()}
            </div>
            <pre style={{ fontSize: 11, color: "#64748b", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f8fafc", padding: 12, borderRadius: 8, maxHeight: 300, overflow: "auto" }}>
              {this.state.error.stack}
            </pre>
            <button onClick={() => { this.setState({ error: null, info: null }); window.location.reload(); }}
              style={{ marginTop: 16, background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
