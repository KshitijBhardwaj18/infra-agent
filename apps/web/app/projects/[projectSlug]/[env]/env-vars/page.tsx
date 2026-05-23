import { redirect } from "next/navigation";

export default async function EnvVarsPage({
  params,
}: {
  params: Promise<{ projectSlug: string; env: string }>;
}) {
  const { projectSlug, env } = await params;
  redirect(`/projects/${projectSlug}/${env}?tab=variables`);
}
