export const API_URL =
  normalizeApiBaseUrl(
    import.meta.env.VITE_API_BASE_URL ||
      import.meta.env.VITE_API_URL ||
      (import.meta.env.DEV ? "http://localhost:4000" : "https://aiolab.onrender.com")
  );

export function apiUrl(path) {
  const base = API_URL.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

function normalizeApiBaseUrl(value) {
  const fallback = "https://aiolab.onrender.com";
  const base = String(value || fallback).replace(/\/$/, "");

  if (!import.meta.env.DEV) {
    try {
      const url = new URL(base);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        return fallback;
      }
    } catch {
      return fallback;
    }
  }

  return base;
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
