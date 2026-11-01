import { useEffect, useState } from 'react';
import { ApiError, api } from './api';

export interface AssetInfo {
  id: string;
  name: string;
  name_hi: string | null;
  kind?: string;
  zone?: string;
}

export interface Category {
  id: string;
  label: string;
  department: string;
  ai: 'trained' | 'partial' | 'experimental' | 'pending';
}

/** Machines for pickers, cached so the form still opens with no network. */
export function useAssets(): AssetInfo[] {
  const [rows, setRows] = useState<AssetInfo[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('sw.assets') ?? '[]') as AssetInfo[];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    api<AssetInfo[]>('/public/assets', { authed: false })
      .then((r) => {
        setRows(r);
        localStorage.setItem('sw.assets', JSON.stringify(r));
      })
      .catch(() => undefined);
  }, []);
  return rows;
}

export function useCategories(): Category[] {
  const [rows, setRows] = useState<Category[]>([]);
  useEffect(() => {
    api<Category[]>('/public/categories', { authed: false })
      .then(setRows)
      .catch(() => undefined);
  }, []);
  return rows;
}

export type QrState =
  | { state: 'loading' }
  | { state: 'ok'; asset: AssetInfo }
  | { state: 'error'; message: string; offline: boolean };

/** Resolve a scanned QR token to its machine (server-side, so the sticker carries no machine data). */
export function useQr(token: string | undefined): QrState {
  const [s, setS] = useState<QrState>({ state: 'loading' });
  useEffect(() => {
    if (!token) return;
    const key = `sw.qr.${token}`;
    api<AssetInfo>(`/public/qr/${encodeURIComponent(token)}`, { authed: false })
      .then((a) => {
        localStorage.setItem(key, JSON.stringify(a));
        setS({ state: 'ok', asset: a });
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError) return setS({ state: 'error', message: e.message, offline: false });
        const cached = localStorage.getItem(key); // offline: use the last-known machine name
        if (cached) return setS({ state: 'ok', asset: JSON.parse(cached) as AssetInfo });
        setS({ state: 'error', message: 'Cannot reach the server', offline: true });
      });
  }, [token]);
  return s;
}
