import { Router } from "express";
import { createRepo, getAuthenticatedUser } from "../lib/github.js";
import { getWorkflowYaml } from "../lib/agents.js";
import { z } from "zod";

const router = Router();

const setupSchema = z.object({
  repoName: z.string().min(1).max(100),
});

router.post("/sandbox/setup", async (req, res) => {
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body — repoName is required" });
    return;
  }

  try {
    const user = await getAuthenticatedUser();
    const repoData = await createRepo(
      parsed.data.repoName,
      "Sandbox repository for Dependency Ghost workflow execution"
    );

    const workflowYaml = getWorkflowYaml();
    const { createOrUpdateFile } = await import("../lib/github.js");

    // Give GitHub a moment to initialize the repo
    await new Promise(r => setTimeout(r, 3000));

    const workflowPath = ".github/workflows/dependency-ghost-test.yml";
    await createOrUpdateFile(
      user.login,
      parsed.data.repoName,
      workflowPath,
      workflowYaml,
      "chore: add dependency ghost workflow"
    );

    res.json({
      repoUrl: repoData.html_url,
      repoFullName: repoData.full_name,
      workflowPath,
      message: `Sandbox repository created at ${repoData.html_url}. The GitHub Actions workflow has been added automatically.`,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to setup sandbox");
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create sandbox repository" });
  }
});

router.get("/sandbox/workflow-yaml", (_req, res) => {
  res.json({ yaml: getWorkflowYaml() });
});

export default router;
