import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "웹소설 생성기",
  description: "AI 기반 카카오페이지 스타일 웹소설 자동 생성",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <div className="min-h-screen bg-[#0a0a0a]">
          <header className="border-b border-zinc-800 px-6 py-4">
            <div className="mx-auto flex max-w-4xl items-center justify-between">
              <Link href="/" className="text-lg font-bold text-white">
                웹소설 생성기
              </Link>
              <span className="text-xs text-zinc-500">AI-Powered</span>
            </div>
          </header>
          <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
