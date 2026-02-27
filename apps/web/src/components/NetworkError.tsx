"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export function NetworkError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 gap-5 text-center animate-enter">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
      >
        ⚠
      </div>
      <div>
        <p className="text-white font-bold text-lg mb-1">Can&apos;t reach the server</p>
        <p className="text-sm max-w-sm mb-2" style={{ color: "#7c6f9a" }}>
          The API at{" "}
          <code className="text-accent-light font-mono text-xs">{API_URL}</code>{" "}
          is unreachable.
        </p>
        <p className="text-xs max-w-sm" style={{ color: "#5a4f7a" }}>
          In Vercel: set{" "}
          <code className="font-mono" style={{ color: "#9d8ec4" }}>NEXT_PUBLIC_API_URL</code>{" "}
          to your Railway API domain, then redeploy.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
        style={{
          background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
          boxShadow: "0 0 20px rgba(124,58,237,0.3)",
        }}
      >
        Try again
      </button>
    </div>
  );
}
