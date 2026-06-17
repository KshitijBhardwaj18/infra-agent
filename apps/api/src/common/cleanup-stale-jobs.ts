import type { PrismaClient } from "@heizen/db";
import type { Queue } from "bullmq";

/**
 * On API startup: any deployment in QUEUED/DEPLOYING that has no corresponding
 * BullMQ job is the result of a worker crash. Mark them FAILED and revert env
 * status so the UI doesn't show "deploying forever."
 */
export async function cleanupStaleDeployments(
  prisma: PrismaClient,
  deploymentQueue: Queue,
): Promise<void> {
  const stuck = await prisma.deployment.findMany({
    where: { status: { in: ["QUEUED", "DEPLOYING"] } },
    select: { id: true, environmentId: true, status: true },
  });

  for (const d of stuck) {
    const job = await deploymentQueue.getJob(d.id);
    const state = job ? await job.getState() : null;
    if (state === "active" || state === "waiting" || state === "delayed") {
      // Still alive in queue — leave it.
      continue;
    }

    await prisma.deployment.update({
      where: { id: d.id },
      data: {
        status: "FAILED",
        errorMessage: "Worker process restarted before completion",
        completedAt: new Date(),
      },
    });
    await prisma.environment.update({
      where: { id: d.environmentId },
      data: { status: "FAILED" },
    });
  }
}
