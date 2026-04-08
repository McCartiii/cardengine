import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/components/AuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "CardEngine",
  description: "Your all-in-one TCG companion — scan, collect, build, and master every card game.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen bg-bg text-white">
        <ErrorBoundary>
          <AuthProvider>
            <Sidebar />
            <main className="flex-1 min-h-screen overflow-y-auto">
              <div className="animate-enter">
                {children}
              </div>
            </main>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
