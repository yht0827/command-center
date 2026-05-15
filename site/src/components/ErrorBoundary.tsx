import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** 라우트 변경 시 boundary를 리셋하기 위한 키 */
  resetKey?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, info: null });
    }
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="p-6 max-w-[760px] mx-auto">
        <div className="text-[11px] font-semibold text-red-400 uppercase tracking-wider mb-1.5">
          Render Error
        </div>
        <h2 className="text-base font-bold mb-3">화면을 그리던 중 오류가 발생했어요</h2>
        <p className="text-[13px] text-text-muted leading-relaxed mb-4">
          좌측 메뉴에서 다른 페이지로 이동하거나 새로고침하면 복구됩니다. 반복되면 아래 정보를 공유해주세요.
        </p>
        <pre className="text-[12px] bg-bg-code border border-border rounded-md p-3 text-text-code whitespace-pre-wrap break-words">
{error.name}: {error.message}
{info?.componentStack ?? ''}
        </pre>
      </div>
    );
  }
}
