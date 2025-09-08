import { z } from "zod";

export const insertClusterRequestSchema = z.object({
  clusterName: z.string().min(1).max(64),
  tier: z.string().min(1),
});

export type InsertClusterRequest = z.infer<typeof insertClusterRequestSchema>;
