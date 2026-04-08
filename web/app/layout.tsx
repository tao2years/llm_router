import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LLM Router Trace Viewer',
  description: 'Inspect Code Agent LLM requests in real time',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className="dark">
      <body className="bg-gray-950 text-gray-100 font-mono antialiased">
        {children}
      </body>
    </html>
  );
}
