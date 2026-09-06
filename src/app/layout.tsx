import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Video to Job Aid',
  description: 'Convert a software demo video and transcript into an editable PowerPoint job aid.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="site-header">
          <span className="brand">Video → Job Aid</span>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
