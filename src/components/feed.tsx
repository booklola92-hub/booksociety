import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { PostCard } from "@/components/post-card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePosts, type FeedFilter } from "@/lib/social";

export function Feed({ filter, empty }: { filter: FeedFilter; empty: { title: string; body?: ReactNode } }) {
  const { data: posts, isLoading, error } = usePosts(filter);
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (error) return <EmptyState title="Não foi possível carregar">{error.message}</EmptyState>;
  if (!posts?.length) return <EmptyState title={empty.title}>{empty.body}</EmptyState>;
  return (
    <div className="space-y-4">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}
