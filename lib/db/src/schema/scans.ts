import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scansTable = pgTable("scans", {
  id: serial("id").primaryKey(),
  repoUrl: text("repo_url").notNull(),
  sandboxRepo: text("sandbox_repo"),
  status: text("status").notNull().default("pending"),
  contractMap: text("contract_map"),
  workflowRunId: text("workflow_run_id"),
  prUrl: text("pr_url"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
});

export const scanLogsTable = pgTable("scan_logs", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull().references(() => scansTable.id, { onDelete: "cascade" }),
  agent: text("agent").notNull(),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mismatchesTable = pgTable("mismatches", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull().references(() => scansTable.id, { onDelete: "cascade" }),
  dependency: text("dependency").notNull(),
  functionName: text("function_name").notNull(),
  expected: text("expected").notNull(),
  actual: text("actual").notNull(),
  severity: text("severity").notNull().default("medium"),
  patch: text("patch"),
  patchStatus: text("patch_status"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settingsTable = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertScanSchema = createInsertSchema(scansTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScanLogSchema = createInsertSchema(scanLogsTable).omit({ id: true, createdAt: true });
export const insertMismatchSchema = createInsertSchema(mismatchesTable).omit({ id: true, createdAt: true });

export type Scan = typeof scansTable.$inferSelect;
export type InsertScan = z.infer<typeof insertScanSchema>;
export type ScanLog = typeof scanLogsTable.$inferSelect;
export type InsertScanLog = z.infer<typeof insertScanLogSchema>;
export type Mismatch = typeof mismatchesTable.$inferSelect;
export type InsertMismatch = z.infer<typeof insertMismatchSchema>;
