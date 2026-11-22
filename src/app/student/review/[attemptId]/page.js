import { Suspense } from "react";
import ReviewClient from "./review-client";

function ReviewLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-600">
      Memuat review…
    </main>
  );
}

async function ReviewRouteContent({ params }) {
  const routeParams = await params;
  return <ReviewClient attemptId={routeParams?.attemptId} />;
}

export default function StudentReviewPage({ params }) {
  return (
    <Suspense fallback={<ReviewLoading />}>
      <ReviewRouteContent params={params} />
    </Suspense>
  );
}
