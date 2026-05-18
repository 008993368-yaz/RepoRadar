export function ErrorState({
  title = "Something went wrong",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 leading-6">{message}</p>
    </div>
  );
}
