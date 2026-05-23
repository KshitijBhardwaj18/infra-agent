"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface StackResource {
  id: string;
  pulumiUrn: string;
  type: string;
  name: string;
  dependencies: string[];
}

export function ResourceGraph({ resources }: { resources: StackResource[] }) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = resources.map((r, i) => ({
      id: r.pulumiUrn,
      data: { label: `${r.name}\n${r.type.split("::").pop()}` },
      position: { x: (i % 4) * 220, y: Math.floor(i / 4) * 100 },
      style: {
        background: "#141416",
        border: "1px solid #27272a",
        color: "#fafafa",
        fontSize: 11,
        padding: 8,
        borderRadius: 6,
        width: 180,
      },
    }));

    const edges: Edge[] = [];
    for (const r of resources) {
      for (const dep of r.dependencies) {
        if (resources.some((res) => res.pulumiUrn === dep)) {
          edges.push({
            id: `${dep}->${r.pulumiUrn}`,
            source: dep,
            target: r.pulumiUrn,
            style: { stroke: "#3b82f6" },
          });
        }
      }
    }

    return { nodes, edges };
  }, [resources]);

  if (resources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No resources deployed yet.</p>
    );
  }

  return (
    <div className="h-96 rounded-lg border border-zinc-800 bg-zinc-900">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background color="#27272a" />
        <Controls />
        <MiniMap nodeColor="#3b82f6" />
      </ReactFlow>
    </div>
  );
}
