import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.visinexa.com'),
  title: 'Visinexa | Human-led visual compliance intelligence',
  description: 'Visinexa analyzes construction images and video against the rules that apply where you operate, with explainable findings for human review.',
  openGraph: {
    title: 'Visinexa | Human-led visual compliance intelligence',
    description: 'Visual evidence, jurisdiction-aware context, and confidence scores for accountable human review.',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: 'Visinexa visual compliance intelligence for construction' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Visinexa | Human-led visual compliance intelligence',
    description: 'Visual evidence, jurisdiction-aware context, and confidence scores for accountable human review.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
