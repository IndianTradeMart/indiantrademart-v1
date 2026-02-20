const isBrowser = typeof window !== "undefined";

const isLocalHost = (hostname = "") => {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host.endsWith(".localhost")) return true;
  return /^127(?:\.\d{1,3}){3}$/.test(host);
};

export const getApiBase = () => {
  const raw = (import.meta.env.VITE_API_URL || "").trim();
  if (!raw) return "";

  const hostname = isBrowser ? window.location.hostname : "";
  const localRuntime = isLocalHost(hostname);
  const rawLower = raw.toLowerCase();
  const pointsToLocal =
    rawLower.includes("localhost") || rawLower.includes("127.0.0.1");

  if (import.meta.env.DEV && pointsToLocal) {
    // In dev, prefer same-origin `/api` so Vite proxy handles the backend.
    return "";
  }

  if (!localRuntime && pointsToLocal) {
    // Avoid broken localhost base in production
    return "";
  }

  return raw.replace(/\/+$/, "");
};

export const apiUrl = (path = "") => {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
};
