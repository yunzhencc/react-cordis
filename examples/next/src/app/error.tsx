'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="about">
      <h1>暂时无法打开清单</h1>
      <button type="button" onClick={reset}>重试</button>
    </main>
  );
}
