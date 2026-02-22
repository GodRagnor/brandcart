export default function CODBadge({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  return (
    <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
      COD Available
    </span>
  );
}
