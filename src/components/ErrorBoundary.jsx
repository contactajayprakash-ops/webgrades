import { Component } from 'react'

// Last-resort catch so a render error (or a code chunk that can't load while
// offline) shows a way out instead of a blank page.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="login-wrap">
        <div className="card card-pad" style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ marginBottom: 8 }}>Something went wrong</h1>
          <p className="muted" style={{ marginBottom: 16 }}>
            WebGrades couldn't finish loading. If you're offline, reconnect and try again.
          </p>
          <button className="btn" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}
