# Third-party model weights (credits and licences)

Weights are **not committed** (`*.pt` is git-ignored). Download them from the repositories below; the evaluation harness
`python tools/evaluate_models.py` loads each one and prints its real class names.

| Folder             | Repository (weights file)                                                                                 | Licence on file                                    | Use here                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| `forklift`         | sounak-sarkar-gwc/Forklift-pedestrian-proximity (`models/warehouse_yolo11_v2/weights/best.pt`)              | none in repo (used with the project owner's approval) | Model 7, forklift-pedestrian proximity           |
| `leak`             | MSunusi/pipeline-leak-detection (`pipeline leak detection.pt`)                                              | none in repo (approved); dataset CC BY 4.0         | Model 5, visible leak                            |
| `liquid`           | IsiPaz/LiquidMonitorAI (`weights/lmai-11n-seg.pt`)                                                          | MIT                                                | **Evaluated and rejected**: false `liquid` on a dry floor; not used by any detector |
| `package`          | AdityaNeutron147/package-defect-detector (`models/package_defect_v2.pt`)                                    | none in repo (approved)                            | Model 8, package damage                          |
| `sdg_v2_HN_yolo1`  | bbKurt11/SDG_CardboardBox_detect (`07_Models/production_v2_HN/yolo1/weights/best.pt`)                        | MIT                                                | Models 6 and 8, box detector (stage 1)           |
| `sdg_hybrid_v2_yolo2` | bbKurt11/SDG_CardboardBox_detect (`07_Models/production_v1_hybrid_v2/yolo2/weights/best.pt`)              | MIT                                                | Model 8, defect classifier (stage 2)             |
| `waste`            | siyad23/waste-sorting-model (`weights/best.pt`)                                                             | AGPL-3.0                                           | Model 9, waste classes; **cite the paper**       |

Waste model citation: Siyad, R. K., Islam, M. M., Nasseef, A. O., Ahmed, K. S., Hasan, M. S. (2026). AI-driven waste management system using deep learning model for detection and novel dual-axis actuator-based waste categorization. _Results in Engineering_. https://doi.org/10.1016/j.rineng.2026.111286

Not usable as model sources (no weights in the repository): nisha572/ai-construction-safety-detection, reyansh7/InventoryVerification, shrirag10/VIGIL, esvinth/Waste-Segregation.
