import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="about">
      <h1>没有找到这份清单</h1>
      <Link href="/reading">返回阅读清单</Link>
    </main>
  );
}
