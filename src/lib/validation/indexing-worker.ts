import { z } from "zod";

const extractedFieldSchema = z.object({
  key: z.string().trim().min(1).max(191),
  value: z.string().trim().min(1).max(500),
  rawValue: z.string().trim().max(1000).optional(),
  confidence: z.number().min(0).max(100),
});

export const workerIdentitySchema = z.object({
  workerId: z.string().trim().min(3).max(191),
});

export const indexingWorkerResultSchema = workerIdentitySchema.extend({
  engine: z.string().trim().min(1).max(191),
  extractedText: z.string().max(4_000_000),
  pageCount: z.number().int().positive().max(10_000).nullable().optional(),
  confidence: z.number().min(0).max(100),
  fields: z.array(extractedFieldSchema).max(200).default([]),
});

export const indexingWorkerFailureSchema = workerIdentitySchema.extend({
  error: z.string().trim().min(1).max(2000),
});
