"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { HeizenMark } from "@/components/HeizenMark";
import { signIn } from "@/lib/auth-client";
import styles from "./login.module.css";

const USER_APP_URL =
  process.env.NEXT_PUBLIC_USER_APP_URL ?? "http://localhost:3000";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function safeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.startsWith("/\\")) return fallback;
  return raw;
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"), "/users");
  const { theme, resolvedTheme, setTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailErr, setEmailErr] = useState(false);
  const [passErr, setPassErr] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Gate theme-aware rendering behind a mounted flag so SSR + first
  // client render produce identical HTML (avoids the hydration warning
  // next-themes is known for).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = (resolvedTheme ?? theme) === "dark";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const okEmail = EMAIL_RE.test(email.trim());
    const okPass = password.length > 0;
    setEmailErr(!okEmail);
    setPassErr(!okPass);
    setServerError(null);
    if (!okEmail || !okPass) return;

    setLoading(true);
    try {
      const result = await signIn.email({ email: email.trim(), password });
      if (result.error) {
        setServerError(
          result.error.message ?? "Sign-in failed. Check your credentials.",
        );
      } else {
        window.location.href = next;
      }
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Sign-in failed. Is the API running?",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.split}>
        <aside className={styles.brandside}>
          <div className={styles.gridBg} />
          <div className={styles.glow} />

          <div className={styles.brand}>
            <HeizenMark className={styles.mark} />
            <span className={styles.brandName}>
              heizen
              <span className={styles.adminBadge}>Admin</span>
            </span>
          </div>

          <div className={styles.pitch}>
            <h1>
              Infrastructure
              <br />
              <em>management.</em>
            </h1>

            {/* Command-center radar — purely decorative animation. */}
            <div className={styles.scene}>
              <div className={styles.radar}>
                <svg viewBox="0 0 168 168" aria-hidden="true">
                  <circle className={styles.radarRing} cx="84" cy="84" r="80" />
                  <circle className={styles.radarRing} cx="84" cy="84" r="56" />
                  <circle className={styles.radarRing} cx="84" cy="84" r="32" />
                  <circle className={styles.radarRing} cx="84" cy="84" r="8" />
                  <line className={styles.radarCross} x1="84" y1="4" x2="84" y2="164" />
                  <line className={styles.radarCross} x1="4" y1="84" x2="164" y2="84" />
                  <g className={styles.radarSweep}>
                    <defs>
                      <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M84 84 L84 4 A80 80 0 0 1 158 56 Z" fill="url(#sweepGrad)" />
                    <line x1="84" y1="84" x2="84" y2="4" stroke="var(--accent)" strokeWidth="1.6" />
                  </g>
                  <circle className={`${styles.radarBlip} ${styles.radarBlip1}`} cx="120" cy="52" r="3.4" />
                  <circle className={`${styles.radarBlip} ${styles.radarBlip2}`} cx="58" cy="118" r="3.4" />
                  <circle className={`${styles.radarBlip} ${styles.radarBlip3}`} cx="116" cy="112" r="3.4" />
                </svg>
              </div>
              <div className={styles.monwall}>
                <div className={styles.monrow}>
                  <span className={styles.monrowLbl}>api-edge</span>
                  <span className={styles.monrowTrack}><i className={styles.monrowFill} /></span>
                </div>
                <div className={styles.monrow}>
                  <span className={styles.monrowLbl}>workers</span>
                  <span className={styles.monrowTrack}><i className={styles.monrowFill} /></span>
                </div>
                <div className={styles.monrow}>
                  <span className={styles.monrowLbl}>db-prod</span>
                  <span className={styles.monrowTrack}><i className={styles.monrowFill} /></span>
                </div>
                <div className={styles.monrow}>
                  <span className={styles.monrowLbl}>queues</span>
                  <span className={styles.monrowTrack}><i className={styles.monrowFill} /></span>
                </div>
              </div>
            </div>
          </div>

          <div />
        </aside>

        <main className={styles.formside}>
          <div className={styles.top}>
            <span>Not an admin?</span>
            <a className={styles.altLink} href={`${USER_APP_URL}/login`}>
              User sign-in
            </a>
            <button
              type="button"
              className={styles.themeToggle}
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label="Toggle light or dark theme"
              suppressHydrationWarning
            >
              {!mounted ? (
                <svg viewBox="0 0 24 24" />
              ) : isDark ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4.2" />
                  <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8l1.8-1.8M18 6l1.8-1.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" />
                </svg>
              )}
            </button>
          </div>

          <div className={styles.formwrap}>
            <form className={styles.card} onSubmit={handleSubmit} noValidate>
              <div className={styles.mobileBrand}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.mark} src="/heizen-mark.png" alt="Heizen" />
                <span className={styles.brandName}>
                  heizen
                  <span className={styles.adminBadge}>Admin</span>
                </span>
              </div>

              <div className={styles.secureBanner}>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                This is a privileged area. Access is logged and monitored.
              </div>

              <h2>Admin sign in</h2>
              <p className={styles.sub}>
                Authenticate with your administrator credentials.
              </p>

              <div className={`${styles.field} ${styles.fieldFirst}`}>
                <label className={styles.fieldLabel} htmlFor="email">
                  Admin email
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="admin@heizen.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailErr) setEmailErr(false);
                    }}
                    className={`${styles.input} ${emailErr ? styles.invalidInput : ""}`}
                  />
                </div>
                {emailErr && (
                  <p className={styles.err}>Enter a valid email address.</p>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="password">
                  Password
                  {/* "Reset" link removed — no password reset endpoint. */}
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passErr) setPassErr(false);
                    }}
                    className={`${styles.input} ${passErr ? styles.invalidInput : ""}`}
                  />
                  <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.5-7 10-7c2 0 3.8.66 5.3 1.6M22 12s-3.5 7-10 7c-2 0-3.8-.66-5.3-1.6" />
                        <path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" />
                        <path d="M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {passErr && <p className={styles.err}>Password is required.</p>}
              </div>

              {serverError && (
                <p className={styles.err} style={{ marginBottom: 12, textAlign: "center" }}>
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                className={`${styles.submit} ${loading ? styles.submitLoading : ""}`}
                disabled={loading}
              >
                {loading ? (
                  <span className={styles.spin} />
                ) : (
                  <>
                    <span>Authenticate</span>
                    <span className={styles.arrow}>→</span>
                  </>
                )}
              </button>

              <p className={styles.switch}>
                Need elevated access?{" "}
                {/* No "contact owner" workflow yet — leave as mailto for now. */}
                <a className={styles.switchLink} href="mailto:admin@heizen.tech">
                  Contact your org owner
                </a>
              </p>
            </form>
          </div>

          {/* Footer intentionally left blank — the design-handoff slots
              (session IP, Audit log / Security / Status links) all map
              to surfaces we don't have yet. Empty space reads as
              "intentional" instead of "broken pipe to nowhere". */}
        </main>
      </div>
    </div>
  );
}
