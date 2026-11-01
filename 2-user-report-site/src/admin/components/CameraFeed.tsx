import { CameraOff, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import { absUrl } from '@common/lib/api';
import { cx } from '@common/ui/primitives';

export interface Cam {
  id: string;
  name: string;
  kind: string;
  site: string;
  building: string;
  floor: string;
  zone: string;
  asset_id: string | null;
  asset_name: string | null;
  department: string | null;
  enabled: number;
  status: string;
  fps: number | null;
  last_seen: string | null;
  simulated: number;
  feed_mode: 'live' | 'file';
  online: boolean;
  preview_url: string;
  stream_url: string;
  detectors: string[];
  incidents_total: number;
  active_alerts: number;
  last_detection: {
    id: string;
    ai_class: string | null;
    ai_confidence: number | null;
    status: string;
    severity: number;
    created_at: string;
    simulated: number;
  } | null;
}

/** What the viewer is looking at, stated honestly: a live feed, a sample video, a simulated device, or nothing. */
export function feedKind(c: Cam): 'live' | 'sample' | 'simulated' | 'offline' {
  if (c.online) return c.feed_mode === 'file' ? 'sample' : 'live';
  return c.simulated ? 'simulated' : 'offline';
}

export function FeedBadge({ cam }: { cam: Cam }) {
  const k = feedKind(cam);
  const map = {
    live: { t: 'LIVE', c: 'bg-ok/90 text-white', dot: true },
    sample: { t: 'SAMPLE VIDEO · SIMULATED FEED', c: 'bg-warn/90 text-white', dot: false },
    simulated: { t: 'SIMULATED SOURCE', c: 'bg-night-3 text-night-muted', dot: false },
    offline: { t: 'OFFLINE', c: 'bg-night-3 text-night-muted', dot: false },
  }[k];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide',
        map.c,
      )}
    >
      {map.dot && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
      {map.t}
    </span>
  );
}

/** Motion-JPEG stream when frames arrive; a clear placeholder when they do not. Never a fake picture. */
export function CameraFeed({
  cam,
  snapshot = false,
  className,
}: {
  cam: Cam;
  snapshot?: boolean;
  className?: string;
}) {
  const [n, setN] = useState(0);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [cam.id, cam.online]);
  useEffect(() => {
    if (!snapshot || !cam.online) return;
    const t = setInterval(() => setN((x) => x + 1), 2500);
    return () => clearInterval(t);
  }, [snapshot, cam.online]);

  if (!cam.online || broken) {
    const k = feedKind(cam);
    if (snapshot) {
      return (
        <div
          className={cx(
            'flex h-full w-full flex-col items-center justify-center gap-1 bg-night-2 text-night-muted',
            className,
          )}
        >
          {k === 'simulated' ? <Radio size={18} /> : <CameraOff size={18} />}
          <span className="text-[10px] font-semibold">
            {k === 'simulated' ? 'Simulated source' : 'No signal'}
          </span>
        </div>
      );
    }
    return (
      <div
        className={cx(
          'flex h-full w-full flex-col items-center justify-center gap-2 bg-night-2 p-3 text-center',
          className,
        )}
      >
        {k === 'simulated' ? (
          <Radio size={26} className="text-night-muted" />
        ) : (
          <CameraOff size={26} className="text-night-muted" />
        )}
        <p className="text-xs font-semibold text-night-text">
          {k === 'simulated'
            ? 'Simulated source'
            : broken
              ? 'Stream interrupted'
              : 'No video received'}
        </p>
        <p className="max-w-[16rem] text-[11px] leading-snug text-night-muted">
          {k === 'simulated'
            ? 'No physical device is attached. Events can be simulated from this screen.'
            : 'Start the CV worker for this camera (see the README) to stream real frames.'}
        </p>
      </div>
    );
  }
  const src = snapshot ? `${absUrl(cam.preview_url)}&n=${n}` : absUrl(cam.stream_url);
  return (
    <img
      src={src}
      alt={`${cam.name} video`}
      onError={() => setBroken(true)}
      className={cx('h-full w-full bg-black object-contain', className)}
    />
  );
}

export type DetState = 'potential' | 'confirmed' | 'false_positive' | 'resolved';
export function detState(i: { status: string; requires_verification?: number }): DetState {
  if (i.status === 'false_positive') return 'false_positive';
  if (['resolved', 'closed'].includes(i.status)) return 'resolved';
  if (['reported', 'analysed', 'alerted'].includes(i.status) && i.requires_verification)
    return 'potential';
  return 'confirmed';
}
export const DET_STYLE: Record<DetState, { label: string; cls: string }> = {
  potential: { label: 'Potential', cls: 'bg-warn/20 text-[#f3b45a] border-warn/50' },
  confirmed: { label: 'Confirmed', cls: 'bg-crit/25 text-[#ff8a8a] border-crit/60' },
  false_positive: { label: 'False positive', cls: 'bg-night-3 text-night-muted border-night-line' },
  resolved: { label: 'Resolved', cls: 'bg-ok/20 text-[#6fd39a] border-ok/50' },
};
