export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000";

export function apiUrl(path) {
  const base = API_URL.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
