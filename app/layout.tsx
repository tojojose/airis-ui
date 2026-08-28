import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Airis Vision Governance',
  description: 'Configurable visual intelligence for safer, better-governed operations.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
  openGraph: {
    title: 'Airis Vision Governance',
    description: 'See risk. Apply context. Act with confidence.',
    type: 'website',
    images: [{ url: 'https://app.trominos.com/og.png', width: 1242, height: 652, alt: 'Airis Vision Governance' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Airis Vision Governance',
    description: 'See risk. Apply context. Act with confidence.',
    images: ['https://app.trominos.com/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#12261f',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
