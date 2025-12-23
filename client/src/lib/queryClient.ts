import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

export async function apiRequest<T>(
  methodOrPath: string,
  pathOrOptions?: string | RequestInit,
  body?: unknown
): Promise<T> {
  const method = pathOrOptions && typeof pathOrOptions === "string" ? methodOrPath : "GET";
  const path = pathOrOptions && typeof pathOrOptions === "string" ? pathOrOptions : methodOrPath;
  const extraOptions = (typeof pathOrOptions === "object" ? pathOrOptions : {}) as RequestInit;
  const options: RequestInit = {
    ...extraOptions,
    method,
    headers: {
      "Content-Type": "application/json",
      ...(extraOptions.headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : extraOptions.body,
  };

  const response = await fetch(path, options);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  try {
    return (await response.json()) as T;
  } catch {
    return undefined as T;
  }
}
