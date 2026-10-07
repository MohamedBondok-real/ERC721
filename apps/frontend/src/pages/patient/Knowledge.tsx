import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Clock, ExternalLink, Search } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import { DisclaimerCard, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/Feedback";
import { Input } from "@/components/ui/Input";

interface ArticleSummary {
  slug: string;
  category: string;
  title: string;
  summary: string;
  readingTimeMinutes: number;
  updatedAt: string;
}

interface ArticleDetail extends ArticleSummary {
  sections: { heading: string; body: string; bullets?: string[] }[];
  references: { organization: string; title: string; url: string }[];
}

export function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const openSlug = params.get("article") ?? null;

  const categories = useQuery({
    queryKey: queryKeys.knowledge.categories,
    queryFn: ({ signal }) => api.get<{ categories: { category: string; count: number }[] }>("/knowledge/categories", undefined, signal),
  });

  const articles = useQuery({
    queryKey: queryKeys.knowledge.articles(category),
    queryFn: ({ signal }) =>
      api.get<{ articles: ArticleSummary[] }>("/knowledge/articles", category ? { category } : undefined, signal),
  });

  const article = useQuery({
    queryKey: queryKeys.knowledge.article(openSlug ?? ""),
    queryFn: ({ signal }) => api.get<{ article: ArticleDetail; disclaimer: string }>(`/knowledge/articles/${openSlug}`, undefined, signal),
    enabled: Boolean(openSlug),
  });

  if (openSlug) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setParams({})}>
          <ArrowLeft className="size-4" /> Back to the knowledge centre
        </Button>

        {article.isLoading ? <Skeleton className="h-64 w-full" /> : null}
        {article.error ? <ErrorState message="We couldn't load that article." onRetry={() => void article.refetch()} /> : null}

        {article.data ? (
          <article className="space-y-6">
            <header>
              <Badge tone="accent">{article.data.article.category}</Badge>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{article.data.article.title}</h1>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-4" /> {article.data.article.readingTimeMinutes} min read
              </p>
            </header>

            <DisclaimerCard />

            <p className="text-lg leading-relaxed text-muted-foreground">{article.data.article.summary}</p>

            {article.data.article.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
                <p className="mt-2 leading-relaxed text-muted-foreground">{section.body}</p>
                {section.bullets?.length ? (
                  <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>• {bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            {article.data.article.references.length ? (
              <section>
                <h2 className="text-xl font-semibold tracking-tight">References</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {article.data.article.references.map((reference) => (
                    <li key={`${reference.organization}-${reference.title}`}>
                      <span className="font-medium">{reference.organization}</span>
                      <span className="text-muted-foreground"> — {reference.title}</span>
                      <a
                        href={reference.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="ml-1 inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="size-3" /> source
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </article>
        ) : null}
      </div>
    );
  }

  const filtered = (articles.data?.articles ?? []).filter(
    (entry) =>
      !search.trim() ||
      entry.title.toLowerCase().includes(search.toLowerCase()) ||
      entry.summary.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Centre"
        description="Plain-language educational articles with sources. Nothing here is a diagnosis or a treatment recommendation."
      />

      <DisclaimerCard />

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search articles"
              className="pl-9"
              aria-label="Search articles"
            />
          </div>

          <Card>
            <CardContent className="space-y-1 pt-6">
              <CategoryButton active={!category} label="All topics" count={articles.data?.articles.length} onClick={() => setCategory(undefined)} />
              {categories.data?.categories.map((entry) => (
                <CategoryButton
                  key={entry.category}
                  active={category === entry.category}
                  label={entry.category}
                  count={entry.count}
                  onClick={() => setCategory(entry.category)}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {articles.error ? <ErrorState message="We couldn't load the articles." onRetry={() => void articles.refetch()} /> : null}

          {articles.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))}
            </div>
          ) : filtered.length ? (
            filtered.map((entry) => (
              <Card key={entry.slug} className="transition-colors hover:border-primary/40">
                <CardHead
                  title={entry.title}
                  description={entry.summary}
                  action={
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/app/knowledge?article=${entry.slug}`}>
                        <BookOpen className="size-4" /> Read
                      </Link>
                    </Button>
                  }
                />
                <CardContent className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone="muted">{entry.category}</Badge>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" /> {entry.readingTimeMinutes} min
                  </span>
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyState
              title="No articles match"
              description="Try a different search term or pick another topic."
              icon={<BookOpen className="size-5" />}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex w-full items-center justify-between gap-2 rounded-md bg-primary px-3 py-2 text-left text-sm font-medium text-primary-foreground"
          : "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      }
    >
      <span>{label}</span>
      {count !== undefined ? <span className="text-xs opacity-70">{count}</span> : null}
    </button>
  );
}
