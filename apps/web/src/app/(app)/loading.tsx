/**
 * Generic loading skeleton for every (app) route — shown by Next while a
 * server component's data fetch is in flight. Deliberately content-agnostic
 * (a header bar + card placeholders) since it has to fit dashboard,
 * internships, tracker, profile, etc. equally well.
 */
export default function Loading() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="skeleton h-7 w-40" />
          <div className="skeleton mt-2 h-4 w-64" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-2xl bg-surface p-5 shadow-card">
            <div className="flex items-center gap-3">
              <div className="skeleton h-10 w-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton mt-2 h-3 w-1/2" />
              </div>
            </div>
            <div className="skeleton mt-4 h-3 w-full" />
            <div className="skeleton mt-2 h-3 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
