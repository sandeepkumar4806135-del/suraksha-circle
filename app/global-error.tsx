"use client";

import { useEffect } from "react";

/**
 * Root global error boundary — catches critical layout-level failures.
 *
 * This renders its own <html>/<body> shell because it replaces the entire
 * root layout. It is intentionally self-contained (no app component imports)
 * so a broken module graph can never cascade into this fallback.
 */
interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[Suraksha Circle] Global layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#7f1d1d",
            padding: 16,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <section
            style={{
              maxWidth: 480,
              width: "100%",
              borderRadius: 24,
              backgroundColor: "#dc2626",
              border: "2px solid #b91c1c",
              padding: 24,
              textAlign: "center",
              boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
            }}
            aria-label="कुछ गड़बड़ हो गया"
            data-testid="global-error-recovery"
          >
            <h1
              style={{
                color: "#fff",
                fontSize: 32,
                fontWeight: 900,
                margin: "16px 0 8px",
              }}
            >
              कुछ गड़बड़ हो गया
            </h1>
            <p
              style={{
                color: "rgba(255,255,255,0.95)",
                fontSize: 20,
                fontWeight: 600,
                margin: "0 0 20px",
              }}
            >
              हम एक जादू से ठीक कर सकते हैं। अगर नहीं, तो Emergency 112 पर
              कॉल करें।
            </p>
            {error?.message && (
              <details
                style={{
                  backgroundColor: "rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  padding: 12,
                  textAlign: "left",
                  marginBottom: 20,
                }}
              >
                <summary
                  style={{
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  तकनीकी विवरण:
                </summary>
                <pre
                  style={{
                    backgroundColor: "#0f172a",
                    borderRadius: 12,
                    padding: 12,
                    color: "#fecaca",
                    overflowX: "auto",
                    wordBreak: "break-all",
                    marginTop: 8,
                  }}
                >
                  {error.message}
                </pre>
              </details>
            )}
            <button
              type="button"
              onClick={() => reset()}
              style={{
                width: "100%",
                minHeight: 80,
                borderRadius: 16,
                backgroundColor: "#059669",
                color: "#fff",
                fontSize: 24,
                fontWeight: 900,
                border: "none",
                cursor: "pointer",
                marginBottom: 12,
              }}
              aria-label="पुनः प्रयास करें / Try Again"
            >
              ↻ पुनः प्रयास करें / Try Again
            </button>
            <a
              href="tel:112"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                width: "100%",
                minHeight: 80,
                borderRadius: 16,
                backgroundColor: "#991b1b",
                color: "#fff",
                fontSize: 24,
                fontWeight: 900,
                textDecoration: "none",
                boxSizing: "border-box",
              }}
              aria-label="Emergency 112 — अभी कॉल करें"
            >
              🆘 Emergency 112 — अभी कॉल करें
            </a>
            <p
              style={{
                color: "rgba(255,255,255,0.9)",
                fontSize: 18,
                fontWeight: 700,
                marginTop: 8,
              }}
            >
              कोई भी आपातकालीन स्थिति में 112 पर कॉल कर सकता है। यह फ्री है।
            </p>
          </section>
        </div>
      </body>
    </html>
  );
}
