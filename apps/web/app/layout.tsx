import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Used by the login page brand-side typography per design handoff.
// Loaded at the root so it's available on first render of /login.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Heizen",
    template: "%s · Heizen",
  },
  description:
    "Connect a repo, pick an environment, deploy. Heizen renders Pulumi from your stack, ships it to AWS, and keeps it live.",
  applicationName: "Heizen",
  authors: [{ name: "Heizen" }],
  keywords: [
    "infrastructure",
    "deployment",
    "Pulumi",
    "AWS",
    "ECS",
    "Lightsail",
    "CI/CD",
  ],
  openGraph: {
    type: "website",
    title: "Heizen",
    description:
      "Connect a repo, pick an environment, deploy. Heizen handles the infra.",
    siteName: "Heizen",
  },
  twitter: {
    card: "summary",
    title: "Heizen",
    description: "Ship infrastructure, not YAML.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
