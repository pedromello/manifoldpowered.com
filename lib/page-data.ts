export async function fetchPageData<T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  const response = await fetch(url, init);

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Page data request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}
