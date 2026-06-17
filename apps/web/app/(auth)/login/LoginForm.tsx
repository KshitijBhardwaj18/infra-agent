"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { HeizenMark } from "@/components/HeizenMark";
import { signIn } from "@/lib/auth-client";
import styles from "./login.module.css";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3002";
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
  const next = safeNext(searchParams.get("next"), "/dashboard");
  const { theme, resolvedTheme, setTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [emailErr, setEmailErr] = useState(false);
  const [passErr, setPassErr] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // next-themes can't know the resolved theme during SSR, so the icon
  // swap has to wait until the component mounts on the client. Before
  // mount we render a neutral placeholder to keep server + client HTML
  // identical and avoid the hydration mismatch warning.
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
        {/* ── LEFT / brand side ──────────────────────────────── */}
        <aside className={styles.brandside}>
          <div className={styles.gridBg} />
          <div className={styles.glow} />

          <div className={styles.brand}>
            <HeizenMark className={styles.mark} />
            <span className={styles.brandName}>heizen</span>
          </div>

          <div className={styles.pitch}>
            <h1>
              Deploy. Maintain.
              <br />
              <em>Keep infra live.</em>
            </h1>

            <div className={styles.scene}>
              <svg
                className={styles.flow}
                viewBox="0 0 460 150"
                fill="none"
                aria-hidden="true"
              >
                <path className={styles.edge} d="M70 75 H150" />
                <path className={styles.edgeLive} d="M70 75 H150" />
                <path className={styles.edge} d="M210 75 H290" />
                <path className={styles.edgeLive} d="M210 75 H290" />
                <path className={styles.edge} d="M350 75 H410" />
                <path className={styles.edgeLive} d="M350 75 H410" />
                <g>
                  <rect className={styles.node} x="20" y="55" width="50" height="40" rx="10" />
                  <path className={styles.glyph} d="M37 75 h16 M45 67 v16" />
                  <text className={styles.nlabel} x="45" y="112" textAnchor="middle">
                    trigger
                  </text>
                </g>
                <g>
                  <rect className={styles.nodeHot} x="150" y="55" width="60" height="40" rx="10" />
                  <path className={styles.glyph} d="M168 75 l8 -8 8 8 M168 75 l8 8 8 -8" />
                  <text className={styles.nlabel} x="180" y="112" textAnchor="middle">
                    transform
                  </text>
                </g>
                <g>
                  <rect className={styles.nodeHot} x="290" y="55" width="60" height="40" rx="10" />
                  <circle className={styles.glyph} cx="320" cy="75" r="8" />
                  <path className={styles.glyph} d="M320 71 v4 l3 2" />
                  <text className={styles.nlabel} x="320" y="112" textAnchor="middle">
                    deploy
                  </text>
                </g>
                <g>
                  <rect className={styles.node} x="410" y="55" width="40" height="40" rx="10" />
                  <path className={styles.glyph} d="M422 75 l5 5 9 -10" />
                  <text className={styles.nlabel} x="430" y="112" textAnchor="middle">
                    verify
                  </text>
                </g>
                <circle className={styles.pulse} r="3.2">
                  <animateMotion dur="2.4s" repeatCount="indefinite" path="M70 75 H150" />
                </circle>
                <circle className={styles.pulse} r="3.2">
                  <animateMotion dur="2.4s" begin="0.8s" repeatCount="indefinite" path="M210 75 H290" />
                </circle>
                <circle className={styles.pulse} r="3.2">
                  <animateMotion dur="2.4s" begin="1.6s" repeatCount="indefinite" path="M350 75 H410" />
                </circle>
              </svg>
            </div>
          </div>

          <div />
        </aside>

        {/* ── RIGHT / form side ──────────────────────────────── */}
        <main className={styles.formside}>
          <div className={styles.top}>
            {/* "Request access" omitted — no signup endpoint exists yet.
                If you add a /api/auth/sign-up route later, restore it here. */}
            <button
              type="button"
              className={styles.themeToggle}
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label="Toggle light or dark theme"
              suppressHydrationWarning
            >
              {!mounted ? (
                // Same shape on every render until we know the theme on
                // the client. Empty SVG keeps layout stable.
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
                <span className={styles.brandName}>heizen</span>
              </div>

              <h2>Welcome back</h2>
              <p className={styles.sub}>Sign in to your Heizen workspace.</p>

              <div className={`${styles.field} ${styles.fieldFirst}`}>
                <label className={styles.fieldLabel} htmlFor="email">
                  Work email
                  {/* "Forgot?" removed — no password reset endpoint. */}
                </label>
                <div className={styles.inputWrap}>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@heizen.com"
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

              <label className={styles.remember}>
                <input
                  type="checkbox"
                  className={styles.rememberInput}
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className={`${styles.rememberBox} ${remember ? styles.rememberBoxChecked : ""}`}>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M5 12l5 5L20 6" />
                  </svg>
                </span>
                Keep me signed in
              </label>

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
                    <span>Sign in</span>
                    <span className={styles.arrow}>→</span>
                  </>
                )}
              </button>

              <p className={styles.switch}>
                Are you an administrator?{" "}
                <a className={styles.switchLink} href={`${ADMIN_URL}/login`}>
                  Go to admin sign-in
                </a>
              </p>
            </form>
          </div>

          <div className={styles.foot}>
            <span>© 2026 Heizen</span>
            <span className={styles.footLinks}>
              {/* Static for now — no Privacy/Terms/Status pages yet. Hash
                  hrefs avoid 404s without misleading the user. */}
              <a href="#" aria-disabled>Privacy</a>
              <a href="#" aria-disabled>Terms</a>
              <a href="#" aria-disabled>Status</a>
            </span>
          </div>
        </main>
      </div>
    </div>
  );
}
