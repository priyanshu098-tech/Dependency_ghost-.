const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const BASE = "https://api.github.com";

function headers() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "dependency-ghost/1.0",
  };
}

export async function fetchRaw(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res.text();
}

export async function getAuthenticatedUser(): Promise<{ login: string }> {
  const res = await fetch(`${BASE}/user`, { headers: headers() });
  if (!res.ok) throw new Error(`GitHub auth failed: ${res.status}`);
  return res.json() as Promise<{ login: string }>;
}

export async function createRepo(name: string, description: string): Promise<{ full_name: string; html_url: string }> {
  const res = await fetch(`${BASE}/user/repos`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name, description, private: false, auto_init: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create repo: ${res.status} ${body}`);
  }
  return res.json() as Promise<{ full_name: string; html_url: string }>;
}

export async function getFileContent(owner: string, repo: string, path: string): Promise<{ content: string; sha: string } | null> {
  const res = await fetch(`${BASE}/repos/${owner}/${repo}/contents/${path}`, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get file: ${res.status}`);
  const data = await res.json() as { content: string; sha: string };
  return data;
}

export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content).toString("base64"),
  };
  if (sha) body.sha = sha;

  const res = await fetch(`${BASE}/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to create/update file: ${res.status} ${errBody}`);
  }
}

export async function triggerWorkflow(
  owner: string,
  repo: string,
  workflowId: string,
  ref: string,
  inputs: Record<string, string>
): Promise<void> {
  const res = await fetch(`${BASE}/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ref, inputs }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to trigger workflow: ${res.status} ${errBody}`);
  }
}

export async function getLatestWorkflowRun(owner: string, repo: string, workflowId: string): Promise<{ id: number; status: string; conclusion: string | null; html_url: string } | null> {
  const res = await fetch(`${BASE}/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=1`, {
    headers: headers(),
  });
  if (!res.ok) return null;
  const data = await res.json() as { workflow_runs: Array<{ id: number; status: string; conclusion: string | null; html_url: string }> };
  return data.workflow_runs[0] ?? null;
}

export async function getWorkflowRunLogs(owner: string, repo: string, runId: number): Promise<string> {
  const res = await fetch(`${BASE}/repos/${owner}/${repo}/actions/runs/${runId}/logs`, {
    headers: headers(),
    redirect: "follow",
  });
  if (!res.ok) return "";
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("utf-8").substring(0, 50000);
}

export async function createBranch(owner: string, repo: string, branch: string, fromBranch = "main"): Promise<void> {
  const refRes = await fetch(`${BASE}/repos/${owner}/${repo}/git/refs/heads/${fromBranch}`, { headers: headers() });
  if (!refRes.ok) throw new Error(`Failed to get base branch ref: ${refRes.status}`);
  const refData = await refRes.json() as { object: { sha: string } };
  const sha = refData.object.sha;

  const res = await fetch(`${BASE}/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to create branch: ${res.status} ${errBody}`);
  }
}

export async function createPullRequest(
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base = "main"
): Promise<{ html_url: string; number: number }> {
  const res = await fetch(`${BASE}/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ title, body, head, base }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to create PR: ${res.status} ${errBody}`);
  }
  return res.json() as Promise<{ html_url: string; number: number }>;
}

export function parseRepoUrl(url: string): { owner: string; repo: string } {
  const clean = url.replace(/\.git$/, "").replace(/\/$/, "");
  const match = clean.match(/github\.com\/([^/]+)\/([^/]+)$/);
  if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
  return { owner: match[1], repo: match[2] };
}

export function getRawUrl(owner: string, repo: string, path: string, branch = "main"): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}
