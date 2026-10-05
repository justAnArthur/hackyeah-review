# Reviewing Huawei — Imagine What's Next (partner task, 25,000 PLN, English only)

## What the partner asked for
An innovative system feature or app for an OpenHarmony-based mobile device, leading with Intelligent Experiences, Spatial Experiences or Human-Centric Technology. ArkTS/ArkUI or C/C++ (cross-platform allowed if there is an OHOS target), HarmonyOS/OpenHarmony/Oniro, API 20+ as declared minimum. Must run on an emulator or device with reproducible setup. Deliverables: public repo, setup/build/launch instructions, working .hap, short recorded demo, architecture description, AI_WORKFLOW.md, AI integration docs if AI features exist. English only.

## How to read each criterion here
- **Originality (20)**: a device-experience idea. A port of an existing app can be original too, if it solves something non-obvious along the way (details document). Fold the OpenHarmony capabilities (distributed devices, service cards, HMS alternatives) into the idea.
- **Demonstrated usefulness (20)**: a person would want this on the phone; the use case survives contact with reality.
- **Technical execution (20)**: real ArkTS/ArkUI structure, correct lifecycle, sensible state management; build files coherent; no secrets committed to the repo (basic hygiene).
- **Platform capabilities (20)**: uses at least one OHOS capability beyond a generic webview. A Flutter app that happens to build scores low here.
- **Demo quality (10)**: an actual emulator/device recording showing the feature working.
- **Reproducibility & transparency (10)**: instructions that a stranger could follow to build and run.

## Evidence checklist
- `build-profile.json5` declares minimum API 20+; permissions in `module.json5` match the features.
- A `.hap` artifact or a build that produces one.
- The recorded demo exists and shows a device or emulator, not an animated mockup.
- AI_WORKFLOW.md present; AI features documented.
- README build steps in English.

## Verification steps
1. Open the file tree: is this an ArkTS project (ets files, module structure) or a web bundle?
2. Read build-profile.json5 and module.json5 — API level and permissions.
3. Match demo claims to screens in the code.

## Weak-entry patterns
- Web app in a webview with a HarmonyOS skin.
- Broken build, missing steps, "works on my machine" README.
- Committed signing keys or tokens (a hygiene weakness).
