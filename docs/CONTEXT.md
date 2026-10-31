# CONTEXT — research briefing for the "Safer Work, Better Work" project

Companion to the master prompt. Put this file in the repo as `docs/CONTEXT.md` and treat it as the source of truth for background, research findings, decisions and caveats. When you cite a number in the app or docs, trace it to a source here or label it as an assumption.

Date of research: 1 Nov 2026. Everything below was gathered from public web sources unless marked **[assumption]** or **[general knowledge]**.

---

## 1. The event and the brief

- Event: a L'Oréal hackathon / case-study competition, track **Manufacturing and Plant**. We picked **Option 01 — Safer Work, Better Work**. (Options 02 "Getting Quality Right First Time" and 03 "Less Waste, Smarter Resource Use" exist; we are not doing them.)
- Eligibility as printed: pre-final and final-year students with a Bachelor's in relevant disciplines, "including" Mechanical, Chemical, Electrical, Food Tech, Metallurgy and Production. Our team is software/communications-heavy. The word "including" suggests the list is not exhaustive, but **confirm with the organisers** that our discipline is accepted, and consider a Mechanical/Chemical/Production teammate for the risk-analysis half.
- I could not find an official public page for this exact event. The only primary source is the 4-page PDF the user supplied. Do not invent organiser rules, dates, prizes, or judging weights.

**Option 01 text (paraphrased):**
- Context: manufacturing involves equipment, materials, movement of people and goods, and routine tasks. A plant wants to make everyday work safer while keeping operations practical and efficient.
- Challenge: identify a workplace risk and propose an improvement that helps prevent incidents and supports a strong safety culture.
- Consider: (1) how can employees spot and report risks easily; (2) could equipment design, training, visual controls, or digital tools help; (3) how will you ensure the solution works in daily practice; (4) how could the safety improvement also reduce energy use, material waste, or other environmental impacts.
- Deliverables: risk analysis, proposed improvement, implementation plan, and measures such as near-miss reporting, task-risk reduction, and employee feedback.

## 2. What L'Oréal already does (so we do not pitch the obvious)

L'Oréal's safety record and system are strong. Our pitch is "make your existing culture easier to use on the floor and tie it to your 2030 environmental targets", not "your plants are unsafe".

- Global lost-time accident rate: **0.76 per million hours worked** (L'Oréal / RoSPA case study PDF, SHP Online).
- Leading and trailing safety metrics are reported to the executive committee; employees are measured on training, housekeeping, PPE compliance, **reporting near misses, injuries and hazardous conditions**, proper lifting and tool use (ISHN, older article — treat as indicative).
- Culture model: L'Oréal describes a safety-culture maturity curve aiming at an **"interdependent"** culture, where employees actively protect each other; sites progress at different speeds (SHP Online series).
- After a potentially severe incident or near miss, a **Safety Accident Communication (SAC)** is distributed to share lessons across sites.
- Risk and culture audits: every three years at manufacturing plants, four-yearly elsewhere.
- Group-wide reporting tool consolidates EHS data (accidents, environmental, quality metrics); safety data are reported monthly (2024/2025 Universal Registration Documents).
- L'Oréal job postings for plant safety roles mention redesigning machines to eliminate hazards, documenting accidents **and near misses**, and running a **Behaviour-Based Safety** programme. Our design should fit those existing practices.
- Environmental targets ("L'Oréal for the Future", 2030): 100% recycled/reused industrial water (waterloop factories), 100% of site waste recycled or reused, 100% renewable energy at operated sites, ~50% lower GHG emissions per finished product vs 2016 baseline. **2023 results**: 91% renewable energy, **14%** of factories waterloop, **61%** of site waste recycled/reused (L'Oréal 2023 annual report). Water and waste are the largest gaps, and relevant to our eco-tags.
- Indian context: L'Oréal India has factories at Chakan (Maharashtra) and Baddi (Himachal Pradesh) (Tribune India, press release).

## 3. Research findings that drive the design

### 3.1 Why near-miss reporting fails
- Workers fear blame and punishment, or don't want paperwork (Novara; Human Focus; HSE Blog).
- "Supervisors are your safety culture" — workers report to their supervisor, not to corporate values (Novara).
- **Reports that go nowhere** kill reporting; closing the loop visibly keeps it alive (Oxmaint FAQ). → our `/board` "You said, we did".
- Practical fixes: anonymous option, simple mobile reporting, multilingual, drop-downs over free text, photo/video attachments (NAEM), **QR code with no login and no app download** (VelocityEHS), voice memo for lower-literacy or second-language workers (CCS best-practice entry).
- Low-cost is possible: a Japanese recycler's manager built a near-miss app with a no-code tool in three hours and reports doubled (Asteria press release).

### 3.2 Leading vs lagging indicators
- Heinrich-style pyramid: many near misses sit under few serious injuries. **Few near misses relative to injuries suggests under-reporting**; rising near-miss reports early on is a *good* sign (Dakota Software KB; AIST "Safety First").
- A low injury rate can hide under-reporting. Track leading indicators (near-miss reporting rate, actions closed, training currency) alongside TRIR/LTIR (open-exam-prep summary, July 2026).
- Caution: Heinrich's ratios are a model, not a law. Do not claim a precise reduction in serious injuries from raising near-miss counts.

### 3.3 Hazards typical of plants like these
- Machine guarding/pinch points, unexpected start-up while clearing jams, chemical splash, slips/trips, forklift collisions, manual handling/ergonomics (several general safety sources). One EU-OSHA case study of a paints/dyes plant found almost half of accidents were caused by ergonomic hazards.
- Pinch points on conveyors, rollers, mixers and **packaging lines**, and unexpected energisation during jam clearing, are explicitly listed hazards (Coaction/SafetyNow stats-and-facts sheet).
- **Hero-risk choice** (jam clearing and changeovers on filling/packaging lines) is **[assumption]** based on this general industry evidence. It is not from L'Oréal data. State that in the docs.

### 3.4 Safety fixes that also save energy / material (brief point 4)
- Compressed-air leaks: typically **20–30%** of compressed air in industrial facilities (National Bar / Industrial Air Centers summaries); some poorly maintained systems up to 50%. Fixing leaks also removes pressure-related hazards. Smart monitoring has been reported to cut compressed-air energy spend by 10–20% (Fluid Power Journal, vendor-sourced).
- Lockout/tagout (LOTO) must isolate **all** energy sources, including pneumatic and hydraulic — links safety to energy management.
- Machines running with nobody present are an idle-energy signal that the same camera zones can detect **[design idea, not a cited result]**.
- Any kWh/material saving shown in the app must come from a configurable `assumptions` file, clearly marked "estimate", never presented as measured.

## 4. Computer-vision research (the AI camera layer)

### 4.1 Decision
Use **pretrained YOLOv8 weights directly, no training** for the hackathon, with `supervision` for zones/tracking. Fine-tune only as an escape hatch if a rule misfires on the demo footage (about 100 images from the demo video, a free Colab GPU).

### 4.2 Verified vs unverified
- **Verified in a sandbox on 1 Nov 2026:** `pip install ultralytics`, then stock `yolov8n.pt` (COCO, classes include `person`, `car`, `truck`) and `yolov8n-pose.pt` both download from the Ultralytics GitHub releases and load.
- **Not verified:** the Hugging Face models below could not be reached from that sandbox (HTTP 403). They should download on a normal machine, but confirm they load on the installed Ultralytics version and **print `model.names` to confirm class names** before building rules around them.

### 4.3 Models and repos
| Need | Choice | Notes |
|---|---|---|
| People | stock `yolov8n.pt` | COCO `person`. |
| Hands | stock `yolov8n-pose.pt` | COCO keypoints include wrists; use "wrist inside polygon" instead of a hand detector **[general knowledge]**. |
| Forklift | HF `keremberke/yolov8n-forklift-detection` | Classes `['forklift','person']`, reported mAP@0.5 ≈ 0.81. Built on an old Ultralytics release (8.0.14), may need `ultralyticsplus` or fail to load. Fallback: COCO `truck` as stand-in, documented. Licence not confirmed — check the model card. |
| PPE (optional) | HF `Nexus3/yolov8n-ppe-detection-6classes`; also `avarshvir/PPE_Object_Detection_System` (reported mAP@50 0.911 on its own test split) | Hobby-grade; domain shift is likely. |
| Zones/tracking | `roboflow/supervision` (MIT) | `PolygonZone`, `LineZone`, ByteTrack, `PixelateAnnotator` for privacy. LineZone needs tracker IDs. |

### 4.4 Datasets (for reference or optional fine-tuning)
- **SH17** (Ahmad & Rahimi, *Journal of Safety Science and Resilience*, 2025; arXiv 2407.04590): 8,099 images, 75,994 instances, 17 classes (person, head, face, glasses, ear, earmuffs, hands, gloves, foot, shoes, safety-vest, tools, helmet, medical-suit, safety-suit, etc.), built for manufacturing. Best reported model (YOLOv9-e) just above 70.9%. **Licence CC BY-NC-SA 4.0 — non-commercial.** Images were scraped from Pexels; the authors state it is for educational/research use.
- CHV (Wang et al.): 1,330 images, person/vest/four helmet colours; YOLOv5x best mAP 86.55%, YOLOv5s 52 FPS. Construction-focused.
- Most public PPE datasets are from **construction**, not cosmetics lines. Expect a performance drop on our footage.

### 4.5 Papers worth citing in the docs
1. SH17 dataset paper (above).
2. *Robustness evaluation of YOLOv8, YOLOv11 and YOLOv12 for PPE detection* (Telematika, 2025): under brightness/saturation changes YOLOv8 was the most stable overall; YOLOv12 was better on some small objects but worse overall. Newer ≠ automatically better.
3. *Nano YOLO benchmark for PPE compliance in IoT environments* (MDPI Sensors 25(19):6140, 2025): YOLOv8n/v10n/v12n compared on accuracy and deployment efficiency.
4. *YOLOv8-based near-miss detection in smart warehouses* (EECSS 2026, ICAIIS 122): forklift–pedestrian near-miss from ordinary surveillance cameras. Key ideas to copy: measure proximity between **box edges, not centroids** (centroid distance overestimates when sizes differ), calibrate the threshold from data, filter out the forklift driver. Its "perfect" score is on a small test sequence — do not quote it as real-world accuracy.
5. Trajectory-prediction collision warning with fuzzy risk grading (SynapseSocial listing) — a future-work idea.
6. *Privacy-Preserving Computer Vision for Industry: Three Case Studies in Human-Centric Manufacturing* (arXiv 2512.09463, AAAI26 HCM workshop): naive person-blurring loses useful detail and one missed person leaks privacy; partners treated privacy as a **prerequisite** for putting cameras back; safety-critical AGV tasks prioritised **recall**; edge processing at 10–15 fps was a key constraint.

### 4.6 Honest limitations to carry into the docs
- Published accuracy is on the authors' own datasets, not ours.
- Lighting, camera angle, occlusion and small objects (gloves, glasses) hurt PPE detection. Prefer large, high-value rules (forklift gap, hand-in-zone) over PPE for the demo.
- False alarms destroy trust, so alert only on sustained violations and favour precision; human confirmation on every auto-detected event.
- Vendor marketing numbers (e.g. "94% fewer near-misses", "72% fewer incidents") were found and **deliberately not used**.

### 4.7 Licensing note
- Ultralytics YOLO (v5/v8/11) is **AGPL-3.0** with a paid enterprise licence for closed-source commercial use. Fine for a hackathon demo; a production rollout should use a permissively licensed detector (RF-DETR Apache-2.0, YOLOX Apache-2.0, LibreYOLO MIT) or an Ultralytics enterprise licence. Mention this in `docs/limitations.md`.

## 5. Design decisions already made (with the user)

1. Option 01, hero risk = jam clearing/changeovers on packaging lines; secondary risk = forklift–pedestrian conflict.
2. Core product = QR-sticker + voice/photo near-miss reporting (worker PWA), admin dashboard, public "You said, we did" board.
3. AI camera layer = pretrained YOLOv8 + supervision zones, two MVP rules, privacy-by-design, human confirmation.
4. Later: emergency escalation router (**simulated** dispatch; India's national emergency number is **112** **[general knowledge]**), offline queue.
5. Low-network Bluetooth mesh = **vision slide only**. Browser apps cannot do a phone-to-phone mesh (Web Bluetooth limits, no iOS Safari support) **[general knowledge, verify before promising]**; the real feature is an offline queue with background sync. A true mesh needs native apps (e.g. Android Nearby Connections) or LoRa hardware.
6. Stack: React + Vite + TypeScript PWA, Firebase (Firestore, Storage, Auth, Cloud Functions), Python vision service. Develop and demo on the Firebase Emulator Suite (offline, no billing).
7. Time split target: roughly 60% build / 40% written deliverables.

## 6. Things Claude Code must not do or claim

- Do not claim integration with real police, ambulance or emergency systems. Dispatch is simulated.
- Do not claim measured savings or measured model accuracy we haven't measured.
- Do not rank, score or identify individual workers; do not store faces.
- Do not use L'Oréal branding; use a fictional plant ("Demo Plant — Line 3").
- Do not present Heinrich ratios as exact.
- Do not download datasets/models without stating the licence.

## 7. Open questions (unanswered as of writing)

- Submission deadline and team size.
- Whether the organisers accept our discipline (see section 1).
- Demo footage: do we have a forklift-aisle video and a filling/packaging-line video, or must we source placeholders?
- Which languages beyond English/Hindi.
- Judging criteria weights and format (live demo, deck, or document) — not found publicly.

## 8. Source list

L'Oréal and safety culture
- ISHN, "Cosmetics maker reaches for the stars": https://www.ishn.com/articles/83798-cosmetics-maker-reaches-for-the-stars
- L'Oréal: A world-class health and safety system (SHP/RoSPA PDF): https://stg.shponline.co.uk/wp-content/uploads/2023/07/Loreal-A-World-Class-System-digital.pdf
- SHP Online, "L'Oréal case study: Excellence is not enough": https://www.shponline.co.uk/culture-and-behaviours/loreal-case-study-excellence-is-not-enough/
- L'Oréal 2024 Universal Registration Document (safety reporting): https://www.loreal-finance.com/eng/2024-universal-registration-document/en/article/267/
- L'Oréal 2023 annual report, social & environmental performance: https://www.loreal-finance.com/en/annual-report-2023/social-environmental-performance/
- L'Oréal India sites (Tribune India): https://www.tribuneindia.com/news/business/loreal-crowns-indias-next-gen-beauty-tech-innovators-intensifying-startup-focus-and-investment-in-beauty-innovation

Near-miss reporting and indicators
- Novara, near-miss underreporting: https://novara.com/?p=37312
- Oxmaint near-miss guide: https://oxmaint.com/industries/food-manufacturing/food-plant-near-miss-reporting-tracking-cmms-guide-2026
- NAEM, engaging frontline workers: https://www.naem.org/connect/blog/read/green-tie/2025/02/27/here-s-how-to-engage-frontline-workers-in-near-miss-reporting
- VelocityEHS QR codes: https://www.ehs.com/blogs/qr-codes-for-incident-management-expanding-safety-reporting-for-all/
- CCS voice-memo app: https://ccsbestpractice.org.uk/entries/have-your-say-app-voice-memo-language-translator/
- Asteria / Toyotsu Recycle: https://en.asteria.com/news/2022102510815/
- Dakota Software near-miss summary: https://support.dakotasoft.com/portal/en/kb/articles/near-miss-summary-22-5-2026
- AIST Safety First (leading indicators): https://www.aist.org/AIST/aist/AIST/Publications/safety%20first/Safety_First_Oct_15.pdf

Hazards and energy
- Processing plant hazards (pinch points): https://coactionspecialty.safetynow.com/processing-plant-hazards-from-pinch-points-to-chemical-burns-stats-and-facts/?print=pdf
- EU-OSHA ergonomic case study: https://osha.europa.eu/en/publications/reducing-accident-rate-due-ergonomic-hazards-chemical-industry
- Compressed air/steam leak surveys: https://nationalbar.org/?p=208
- Industrial Air Centers Feb 2026 insights: https://www.iacserv.com/blog/adaptive-air-insights-february-2026/
- Fluid Power Journal on smart pneumatics: https://issuu.com/idpcreative/docs/fpjmar22_32pg_hyperlinked/s/14967106

Computer vision
- roboflow/supervision docs: https://supervision.roboflow.com/llms.txt
- SH17 repo: https://github.com/ahmadmughees/SH17dataset ; paper https://arxiv.org/abs/2407.04590
- CHV PPE repo: https://github.com/ZijianWang-ZW/PPE_detection
- Forklift model: https://huggingface.co/keremberke/yolov8n-forklift-detection
- PPE model: https://huggingface.co/Nexus3/yolov8n-ppe-detection-6classes
- YOLOv8/11/12 PPE robustness: https://ejournal.amikompurwokerto.ac.id/index.php/telematika/article/download/3362/pdf_134
- Nano YOLO PPE benchmark: https://www.mdpi.com/1424-8220/25/19/6140
- YOLOv8 near-miss detection in warehouses: https://www.avestia.com/EECSS2026_Proceedings/files/paper/ICAIIS/ICAIIS_122.pdf
- Privacy-preserving CV for industry: https://arxiv.org/abs/2512.09463v1
- Ultralytics alternatives and licences: https://lightly.ai/blog/best-ultralytics-alternatives-in-2026
- Roboflow on Ultralytics licensing: https://roboflow.com/ultralytics
