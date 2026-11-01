# Roadmap: low-network and mesh reporting (vision only, not built)

**Status: not implemented, and deliberately so.**

The real feature for poor connectivity is the **offline queue** that is already built (IndexedDB queue, "waiting to send" status, automatic retry when the app is open or the browser is back online; see `2-user-report-site/src/lib/queue.ts`).

A phone-to-phone Bluetooth **mesh** (relaying a report from a phone without signal via nearby phones) is a future idea. General knowledge, to **verify before promising anything**:
- A browser-based PWA cannot run a background mesh: Web Bluetooth is limited, needs user gestures and pairing, and is not supported in iOS Safari.
- A real mesh needs native apps (for example Android's Nearby Connections, or a mesh SDK) or dedicated devices such as LoRa gateways/beacons, plus device management and a security review.
- Plants often have dead zones (metal shelving, cold rooms). Cheaper first steps: add Wi-Fi access points, use a shared kiosk phone at the line, or add the Background Sync API for Android Chrome.

Suggested order if the pilot shows connectivity is a real barrier: (1) measure how many reports wait more than 5 minutes, (2) improve Wi-Fi coverage and add Background Sync, (3) only then evaluate native mesh or LoRa.
