import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function OpportunityCardSkeleton() {
  return (
    <Card aria-hidden>
      <CardHeader>
        <Skeleton className="h-5 w-20" />
        <Skeleton className="mt-1 h-5 w-full" />
        <Skeleton className="h-5 w-3/5" />
        <Skeleton className="mt-1 h-4 w-2/3" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-4 w-40" />
      </CardContent>
      <CardFooter>
        <Skeleton className="h-5 w-28" />
      </CardFooter>
    </Card>
  );
}
