"use client";

import { useEffect } from "react";
/**
 * Root-level boundary — catches errors thrown by the root layout itself.
 * Must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`[global-error] ${error.name}${error.digest ? ` (${error.digest})` : ""}`);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ textAlign: "center", display: "grid", gap: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Application error</h2>
          <p style={{ fontSize: 14, opacity: 0.7 }}>The application failed to start. Please try again.</p>
          <button
            onClick={reset}
            style={{
              margin: "0 auto",
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #3f3f46",
              background: "#fafafa",
              color: "#18181b",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
