/** Persistencia simple en cookies (misma máquina / navegador). */

const MAX_AGE = 60 * 60 * 24 * 365; // 1 año

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "path=/",
    `max-age=${MAX_AGE}`,
    "SameSite=Lax",
  ].join("; ");
}

export function readJsonCookie<T>(name: string): T | null {
  const raw = readCookie(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJsonCookie(name: string, value: unknown): void {
  writeCookie(name, JSON.stringify(value));
}
