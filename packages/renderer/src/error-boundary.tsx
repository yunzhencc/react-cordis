import type { ReactNode } from 'react';
import { SlotAssemblyError } from '@react-cordis/slots';
import { Component } from 'react';

/** Shared by slot entries and route pages; reset by remounting. @internal */
export class RenderErrorBoundary extends Component<{
  children?: ReactNode;
  label: string;
  fallback: ReactNode;
}, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(error: unknown) {
    if (error instanceof SlotAssemblyError)
      throw error;
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(`render failed in ${this.props.label}:`, error);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
