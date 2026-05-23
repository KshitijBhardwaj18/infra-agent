import { AppShell } from "@/components/layout/AppShell";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
