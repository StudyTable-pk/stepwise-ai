import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StepWise AI",
  description:
    "An interactive AI learning environment. The Board is the classroom, the AI is the teacher, your work is the evidence."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
