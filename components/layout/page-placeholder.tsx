import { Badge } from "@/components/ui/badge";

interface PagePlaceholderProps {
  title: string;
  description: string;
  comingSoon?: boolean;
}

/**
 * Minimal Phase 0 stand-in so every primary route renders. Each of these
 * pages is replaced by a real screen in later build phases.
 */
export function PagePlaceholder({
  title,
  description,
  comingSoon = false,
}: PagePlaceholderProps) {
  return (
    <section className="mx-auto max-w-2xl py-16 text-center sm:py-24">
      <div className="mb-4 flex items-center justify-center gap-2">
        <Badge variant="outline" className="text-muted-foreground">
          Simulated Demo Data
        </Badge>
        {comingSoon ? <Badge>Coming soon</Badge> : null}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-balance text-muted-foreground">{description}</p>
    </section>
  );
}
