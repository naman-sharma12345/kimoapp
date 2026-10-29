import { Component } from 'react';
import { createRoot } from 'react-dom/client';
// The studio's design system, imported from apps/web (not copied).
import './preflight.css';
import '@web/styles/fonts.css';
import '@web/styles/tokens.css';
import '@web/styles/ui.css';
import '@web/styles/studio.css';
import '@web/styles/agent.css';
import './styles.css';
import { App } from './App.jsx';

class Boundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="desk-crash" role="alert">
        <b>something went wrong in kimo’s window.</b>
        <pre>{String(this.state.error?.message || this.state.error)}</pre>
        <button className="ui-button ui-button-primary ui-size-md" onClick={() => location.reload()}>
          <span className="ui-button-label">reload</span>
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <Boundary>
    <App />
  </Boundary>,
);
