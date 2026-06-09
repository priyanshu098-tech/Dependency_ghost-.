import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateScan, useGetWorkflowYaml, useSetupSandbox, getGetWorkflowYamlQueryKey } from "@workspace/api-client-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Terminal, ChevronDown, Rocket, Github } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  repoUrl: z.string().url("Must be a valid URL"),
  sandboxRepo: z.string().optional(),
});

export default function NewScan() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createScan = useCreateScan();
  const setupSandbox = useSetupSandbox();
  const { data: workflow } = useGetWorkflowYaml({ query: { queryKey: getGetWorkflowYamlQueryKey() }});
  
  const [sandboxRepoName, setSandboxRepoName] = useState("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      repoUrl: "",
      sandboxRepo: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createScan.mutate({ data: {
      repoUrl: values.repoUrl,
      sandboxRepo: values.sandboxRepo || null
    }}, {
      onSuccess: (scan) => {
        toast({ title: "Scan initiated", description: `Scan #${scan.id} created successfully.` });
        setLocation(`/scan/${scan.id}`);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to create scan", variant: "destructive" });
      }
    });
  }

  const handleSetupSandbox = () => {
    if (!sandboxRepoName) {
      toast({ title: "Validation Error", description: "Provide a sandbox repo name", variant: "destructive" });
      return;
    }
    setupSandbox.mutate({ data: { repoName: sandboxRepoName } }, {
      onSuccess: (info) => {
        toast({ title: "Sandbox Created", description: `Created ${info.repoFullName}` });
        form.setValue("sandboxRepo", info.repoFullName);
      },
      onError: () => {
        toast({ title: "Setup Failed", description: "Unknown error", variant: "destructive" });
      }
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Terminal className="w-8 h-8 text-primary" />
          INITIATE NEW SCAN
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">Deploy the 3-agent pipeline to detect silent breaking changes.</p>
      </div>

      <Card className="border-primary/20 bg-card/50">
        <CardHeader>
          <CardTitle>TARGET REPOSITORY</CardTitle>
          <CardDescription>Enter the GitHub repository URL to analyze.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="repoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-primary">REPO_URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://github.com/owner/repo" {...field} className="font-mono bg-background" data-testid="input-repo-url" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sandboxRepo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-primary">SANDBOX_REPO (OPTIONAL)</FormLabel>
                    <FormControl>
                      <Input placeholder="owner/sandbox-repo" {...field} className="font-mono bg-background" data-testid="input-sandbox-repo" />
                    </FormControl>
                    <FormDescription>Used by EXECUTE agent to run tests. Provide existing or create below.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full font-mono font-bold text-lg h-14" disabled={createScan.isPending} data-testid="button-submit-scan">
                <Rocket className="w-5 h-5 mr-2" />
                {createScan.isPending ? "INITIALIZING..." : "SCAN & FIX"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-border bg-card/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Github className="w-5 h-5" /> SETUP SANDBOX REPO
          </CardTitle>
          <CardDescription>Create a dedicated sandbox repository via GitHub API for execution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              placeholder="sandbox-name" 
              value={sandboxRepoName} 
              onChange={e => setSandboxRepoName(e.target.value)}
              className="font-mono max-w-sm bg-background"
            />
            <Button variant="secondary" onClick={handleSetupSandbox} disabled={setupSandbox.isPending} data-testid="button-setup-sandbox">
              CREATE
            </Button>
          </div>

          {workflow && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="font-mono text-xs w-full justify-between mt-4">
                  VIEW WORKFLOW YAML
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <pre className="p-4 bg-black text-emerald-400 text-xs font-mono rounded overflow-x-auto border border-emerald-900/30">
                  {workflow.yaml}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
