const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api";

type ServerFetchOptions = {
  revalidate?: number;   // seconds
  tags?: string[];       // cache invalidation tags
};

export async function serverFetch<T>(
  path: string,
  options?: ServerFetchOptions
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    next: {
      revalidate: options?.revalidate ?? 0,
      tags: options?.tags,
    },
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }

  return res.json();
}
