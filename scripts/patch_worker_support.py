"""Support code for the worker portal: manual tracking entries and the emergency-info endpoint."""

import pathlib

R = pathlib.Path(__file__).resolve().parents[1]


def sub(path: pathlib.Path, old: str, new: str) -> None:
    s = path.read_text(encoding="utf-8")
    assert old in s, (path.name, old[:60])
    path.write_text(s.replace(old, new, 1), encoding="utf-8", newline="\n")


sub(
    R / "packages/common/src/lib/submit.ts",
    "      const sent = all.filter((x) => x.state === 'sent' && x.serverId && x.trackingCode);\n      if (!sent.length) return setItems([]);\n      try {\n        const res = await api<Tracked[]>('/public/track', {\n          json: sent.map((s) => ({ id: s.serverId, code: s.trackingCode })),",
    "      const sent = all.filter((x) => x.state === 'sent' && x.serverId && x.trackingCode);\n      const pairs = [...sent.map((s) => ({ id: s.serverId as string, code: s.trackingCode as string })), ...manualTracks()];\n      const uniq = [...new Map(pairs.map((p) => [p.id, p])).values()];\n      if (!uniq.length) return setItems([]);\n      try {\n        const res = await api<Tracked[]>('/public/track', {\n          json: uniq,",
)
sub(
    R / "packages/common/src/lib/submit.ts",
    "export interface Tracked {",
    "const MANUAL = 'sw.manual';\nfunction manualTracks(): { id: string; code: string }[] {\n  try {\n    return JSON.parse(localStorage.getItem(MANUAL) ?? '[]') as { id: string; code: string }[];\n  } catch {\n    return [];\n  }\n}\n/** A report found by reference number + access code is remembered on this device. */\nexport function saveManualTrack(id: string, code: string): void {\n  const rest = manualTracks().filter((p) => p.id !== id);\n  localStorage.setItem(MANUAL, JSON.stringify([{ id, code }, ...rest].slice(0, 20)));\n}\n\nexport interface Tracked {",
)
sub(R / "backend/app/config.py", '    PUBLIC_URL = os.getenv("PUBLIC_URL"', '    SITE_EMERGENCY_CONTACT = os.getenv("SITE_EMERGENCY_CONTACT", "")  # shown on the worker help page; a call link only if set\n    ASSEMBLY_POINT = os.getenv("ASSEMBLY_POINT", "")\n    PUBLIC_URL = os.getenv("PUBLIC_URL"')
sub(
    R / "backend/app/routers/public.py",
    '@router.get("/facts")',
    '''@router.get("/help")
def help_info() -> dict:
    """Emergency page details. Nothing here places a call; the contact is only displayed if the plant set one."""
    from ..config import settings

    return {"site": "Demo Plant — Line 3", "contact": settings.SITE_EMERGENCY_CONTACT, "assembly_point": settings.ASSEMBLY_POINT}


@router.get("/facts")''',
)
print("patched")
