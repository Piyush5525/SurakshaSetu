import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db, ensureAnonymous } from './firebase';

export interface LocationInfo {
  id: string;
  name: string;
  nameHi: string;
}

/** Location name for the QR link. Cached locally so the form still opens with no network. */
export function useLocationInfo(id: string | undefined): LocationInfo | null {
  const [info, setInfo] = useState<LocationInfo | null>(() => {
    if (!id) return null;
    const cached = localStorage.getItem(`sw.loc.${id}`);
    return cached ? (JSON.parse(cached) as LocationInfo) : { id, name: id, nameHi: id };
  });
  useEffect(() => {
    if (!id) return;
    let alive = true;
    ensureAnonymous()
      .then(() => getDoc(doc(db, 'locations', id)))
      .then((snap) => {
        if (!alive || !snap.exists()) return;
        const d = snap.data();
        const next = { id, name: String(d.name), nameHi: String(d.nameHi ?? d.name) };
        localStorage.setItem(`sw.loc.${id}`, JSON.stringify(next));
        setInfo(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id]);
  return info;
}

/** All machines/locations, for pickers. */
export function useLocations(): LocationInfo[] {
  const [rows, setRows] = useState<LocationInfo[]>([]);
  useEffect(() => {
    ensureAnonymous()
      .then(() => getDocs(collection(db, 'locations')))
      .then((s) =>
        setRows(
          s.docs.map((d) => ({
            id: d.id,
            name: String(d.data().name),
            nameHi: String(d.data().nameHi ?? d.data().name),
          })),
        ),
      )
      .catch(() => undefined);
  }, []);
  return rows;
}
