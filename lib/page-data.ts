export class PageDataRequestError extends Error {
  constructor(public status: number) {
    super(`Page data request failed with status ${status}`);
    this.name = "PageDataRequestError";
  }
}

export async function fetchPageData<T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  const response = await fetch(url, init);

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new PageDataRequestError(response.status);
  }

  return response.json() as Promise<T>;
}
