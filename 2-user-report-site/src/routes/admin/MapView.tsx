import { useNavigate } from 'react-router-dom';
import { Card, SEV_COLOR, useGet } from './hooks';

interface MapData {
  assets: {
    id: string;
    name: string;
    kind: string;
    x: number;
    y: number;
    w: number;
    h: number;
    open_count: number;
    total_count: number;
  }[];
  cameras: {
    id: string;
    name: string;
    kind: string;
    x: number;
    y: number;
    status: string;
    enabled: number;
    simulated: number;
  }[];
  incidents: {
    id: string;
    category: string;
    severity: number;
    source: string;
    simulated: number;
    x: number;
    y: number;
  }[];
}

/** Schematic floor plan (coordinates are percentages of the plan, set per machine). Heat = total incidents. */
export default function MapView() {
  const { data } = useGet<MapData>('/map');
  const nav = useNavigate();
  const max = Math.max(1, ...(data?.assets.map((a) => a.total_count) ?? [1]));
  return (
    <Card title="Factory map: machines, QR locations, cameras, microphones, open incidents">
      <p className="mb-2 text-sm text-slate-600">
        Colour intensity = incident count per machine (heatmap). Pins = open incidents (colour =
        severity). Plan is schematic, not to scale.
      </p>
      <svg
        viewBox="0 0 100 94"
        className="w-full rounded-xl border bg-slate-50"
        role="img"
        aria-label="Factory floor plan"
      >
        {data?.assets.map((a) => (
          <g key={a.id}>
            <rect
              x={a.x}
              y={a.y}
              width={a.w}
              height={a.h}
              rx="1"
              fill={`rgba(220,38,38,${0.08 + 0.6 * (a.total_count / max)})`}
              stroke="#334155"
              strokeWidth="0.3"
            />
            <text
              x={a.x + a.w / 2}
              y={a.y + a.h / 2}
              textAnchor="middle"
              fontSize="2.2"
              fontWeight="700"
              fill="#0f172a"
            >
              {a.name}
            </text>
            <text
              x={a.x + a.w / 2}
              y={a.y + a.h / 2 + 3}
              textAnchor="middle"
              fontSize="1.8"
              fill="#334155"
            >
              ▣ QR · {a.total_count} total{a.open_count ? ` · ${a.open_count} open` : ''}
            </text>
          </g>
        ))}
        {data?.cameras.map((c) => (
          <g key={c.id}>
            <circle
              cx={c.x}
              cy={c.y}
              r="1.6"
              fill={
                c.kind === 'microphone' ? '#7c3aed' : c.status === 'running' ? '#16a34a' : '#64748b'
              }
            />
            <text x={c.x + 2.2} y={c.y + 0.7} fontSize="1.7" fill="#0f172a">
              {c.kind === 'microphone' ? '🎙' : '📷'} {c.id}
              {c.simulated ? ' (sim)' : ''}
            </text>
          </g>
        ))}
        {data?.incidents.map((i) => (
          <circle
            key={i.id}
            cx={i.x + 3}
            cy={i.y + 3}
            r="1.8"
            className={`${(SEV_COLOR[i.severity] ?? '').replace('bg-', 'fill-')} cursor-pointer`}
            stroke="white"
            strokeWidth="0.4"
            onClick={() => nav(`/admin/incidents/${i.id}`)}
          >
            <title>{`${i.id} · ${i.category} · S${i.severity}${i.simulated ? ' · simulated/sample' : ''}`}</title>
          </circle>
        ))}
      </svg>
    </Card>
  );
}
