import { useEffect, useState } from 'react';
import { absUrl, api } from '@common/lib/api';
import { Card, useGet } from './hooks';

interface Cam {
  id: string;
  name: string;
  kind: string;
  zone: string;
  online: boolean;
  enabled: number;
  status: string;
  fps: number | null;
  simulated: number;
  detectors: string[];
  preview_url: string;
  last_seen: string | null;
}
interface Ev {
  id: number;
  ts: string;
  camera_id: string;
  model: string;
  cls: string;
  confidence: number;
  outcome: string;
}

function Preview({ cam }: { cam: Cam }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!cam.online) return;
    const t = setInterval(() => setN((x) => x + 1), 1500);
    return () => clearInterval(t);
  }, [cam.online]);
  if (!cam.online) {
    return (
      <div className="flex aspect-video items-center justify-center rounded bg-slate-800 text-sm font-bold text-slate-300">
        {cam.simulated ? 'Simulated source (no device)' : 'Offline: start the CV worker'}
      </div>
    );
  }
  return (
    <img
      alt={cam.name}
      className="aspect-video w-full rounded bg-black object-contain"
      src={`${absUrl(cam.preview_url)}&n=${n}`}
    />
  );
}

export default function Live() {
  const cams = useGet<Cam[]>('/cameras');
  const evs = useGet<Ev[]>('/ai-events?limit=25');
  const [msg, setMsg] = useState('');
  const sim = async (kind: string) => {
    try {
      await api('/demo/simulate', { json: { kind } });
      setMsg(`Simulated ${kind} event created (clearly labelled SIMULATED).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    }
  };
  return (
    <div className="grid gap-4">
      <p className="rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-900">
        Authorised use only. Camera and audio monitoring needs a privacy notice on site and worker
        consultation. No face or emotion recognition is performed. Snapshots pixelate people;
        evidence is deleted after the retention period.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cams.data?.map((c) => (
          <Card key={c.id}>
            <Preview cam={c} />
            <div className="mt-2 flex items-center justify-between">
              <div>
                <p className="font-extrabold">{c.name}</p>
                <p className="text-xs text-slate-500">
                  {c.id} · {c.zone} · {c.kind}
                </p>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-xs font-bold ${c.online ? 'bg-green-600 text-white' : 'bg-slate-300'}`}
              >
                {c.online
                  ? `LIVE ${c.fps ? Math.round(c.fps) + ' fps' : ''}`
                  : c.simulated
                    ? 'SIMULATED'
                    : 'OFFLINE'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Detectors: {c.detectors.join(', ') || 'none'}
            </p>
            <button
              className="mt-2 rounded border px-2 py-1 text-xs font-bold"
              onClick={() =>
                void api(`/cameras/${c.id}`, {
                  method: 'PATCH',
                  json: { enabled: !c.enabled },
                }).then(cams.reload)
              }
            >
              {c.enabled ? 'Disable camera' : 'Enable camera'}
            </button>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Recent AI events (raw, before incident creation)">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th>Time</th>
                <th>Source</th>
                <th>Class</th>
                <th>Conf</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {evs.data?.map((e) => (
                <tr key={e.id} className="border-t">
                  <td>{new Date(e.ts).toLocaleTimeString()}</td>
                  <td>{e.camera_id}</td>
                  <td>{e.cls}</td>
                  <td>{Math.round(e.confidence * 100)}%</td>
                  <td>{e.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {evs.data?.length === 0 && (
            <p className="text-sm text-slate-500">
              No AI events yet. Start the CV worker or use the simulator.
            </p>
          )}
        </Card>
        <Card title="Audio monitoring and demo simulator">
          <p className="mb-2 text-sm text-slate-600">
            No real audio model is connected, so audio events are <b>simulated</b> and labelled.
            Loudness alone never raises an incident in a real deployment.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              'audio_alarm',
              'audio_scream',
              'audio_glass',
              'audio_impact',
              'fire',
              'fall',
              'violence',
              'spill',
              'ppe',
              'forklift',
              'hand',
            ].map((k) => (
              <button
                key={k}
                className="rounded border border-dashed border-purple-500 px-2 py-1 text-xs font-bold text-purple-800"
                onClick={() => void sim(k)}
              >
                Simulate {k.replace('_', ' ')}
              </button>
            ))}
          </div>
          {msg && <p className="mt-2 text-sm font-bold">{msg}</p>}
        </Card>
      </div>
    </div>
  );
}
