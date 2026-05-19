"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Input } from "@/components/ui";
import type { ApiResponse } from "@/lib/api-response";
import { GitHubRepoInputError, parseGitHubRepoInput } from "@/lib/github-url";

type AnalyzeResponseData = {
  repoId: string;
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
};

const exampleRepos = ["vercel/next.js", "facebook/react", "supabase/supabase"];

export function RepoInputForm() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    let normalizedUrl: string;

    try {
      normalizedUrl = parseGitHubRepoInput(repoUrl).normalizedUrl;
    } catch (parseError) {
      if (parseError instanceof GitHubRepoInputError) {
        setError(parseError.message);
        return;
      }

      throw parseError;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repoUrl: normalizedUrl }),
      });
      const payload = (await response.json()) as ApiResponse<AnalyzeResponseData>;

      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Unable to start analysis. Try again." : payload.error.message);
        setIsSubmitting(false);
        return;
      }

      router.push(`/repos/${payload.data.repoId}/status`);
    } catch {
      setError("Unable to start analysis. Check your connection and try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          aria-describedby={error ? "repo-input-error" : undefined}
          aria-invalid={error ? "true" : "false"}
          aria-label="GitHub repository URL"
          onChange={(event) => setRepoUrl(event.target.value)}
          placeholder="github.com/vercel/next.js"
          value={repoUrl}
        />
        <Button className="sm:w-40" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Analyzing..." : "Analyze"}
        </Button>
      </div>

      {error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
          id="repo-input-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {exampleRepos.map((example) => (
          <Button
            aria-label={`Use ${example}`}
            key={example}
            onClick={() => {
              setRepoUrl(example);
              setError(null);
            }}
            type="button"
            variant="secondary"
          >
            {example}
          </Button>
        ))}
      </div>
    </form>
  );
}
