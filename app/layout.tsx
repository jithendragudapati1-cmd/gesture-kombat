import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gesture Kombat — Your Body. Your Battleground.",
  description: "Gesture-controlled combat. Train your moves, duel the AI, find a random rival, or challenge a friend.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head><link rel="preload" as="image" href="/fighters/raven-original.png"/><link rel="preload" as="image" href="/fighters/vortex-original.png"/></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
