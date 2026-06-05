export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000";

export function apiUrl(path) {
  const base = API_URL.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export async function parseApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  let data;

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();
    throw new Error(text.slice(0, 300) || "Server returned non-JSON response");
  }

  if (!response.ok) {
    throw new Error(data.detail || data.error || data.message || "Request failed");
  }

  return data;
}
