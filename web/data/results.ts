export type Place = "best" | 1 | 2 | 3
export type Status = "found" | "likely" | "none" | "removed" | "ours"

export type Entry = {
  team: string
  status: Status
  place?: Place
  project?: string
  desc?: string
  note?: string
  repos?: string[]
  demo?: string
  other?: { repo: string; task: string }[]
  ours?: boolean
}

export type ResultsTask = { id: string; name: string; kind: string; ours?: boolean; entries: Entry[] }

export const TASKS: ResultsTask[] = [
  { id: "defence", name: "Defence", kind: "Open task", entries: [
    { place: "best", team: "Mikformatycy", project: "SafeWall", status: "likely",
      desc: "Pocket privacy gateway for journalists and activists: the phone connects over a cable, with its own LTE link and Tor protection.",
      repos: ["Mikformatycy/SafeWall"], note: "The team's GitHub org has one repo per task it entered; SafeWall is the Defence one by elimination." },
    { team: "LayerOne", project: "LayerOne", status: "found",
      desc: "Hardware security for critical infrastructure: reads electrical signatures of devices and sends signed alerts over independent LoRa radio.",
      repos: ["RodrigoGaluppo/HackYeah2026-LayerOne"] },
    { team: "SOLVRO-NG", status: "removed",
      note: "Their Defence repo (bartzlot/HackYeah---2026) was public on 4 October and is no longer available. Their AI Control Layer entry is still public.",
      other: [{ repo: "bartzlot/HackYeah---AI-Control-Layer", task: "AI Control Layer" }] },
    { team: "Space Hamsters", status: "none" },
    { team: "SUBJECT.pdf", status: "none" },
  ]},
  { id: "sport", name: "Sport & Healthcare", kind: "Open task · 8,000 PLN · one winner", ours: true, entries: [
    { place: "best", team: "Kristin-Lina Todorova", project: "ViviOR", status: "found",
      desc: "Virtual operating room for surgical trainees: an open hernia repair in 17 scored steps, with guided, training and exam modes, in Unity plus a web platform.",
      repos: ["kristin-lina-todorova/ViviOR_HackYeah26"], demo: "https://viviorhackyeah26-website.vercel.app" },
    { team: "DoubleOreo", project: "Celia.ai", status: "found",
      desc: "HarmonyOS phone and watch app for people with Long QT syndrome: checks medicines before you take them, carries an emergency card in 13 languages, monitors heart rate.",
      repos: ["x2oreo/Celia.ai"], note: "Same project, entered in the Huawei task too, with a separate Sport & Healthcare deck." },
    { team: "Waldenburg Miners", status: "none" },
    { team: "FHS – Future Health Solution", status: "none" },
    { team: "XeniaHack Team", status: "none" },
    { ours: true, team: "JustMate", project: "Our entry · did not reach the final", status: "ours",
      desc: "A plan near you, a person who fits, and someone waiting when you get there.",
      repos: ["uteg-labs/just-mate"] },
  ]},
  { id: "smartcity", name: "Smart City", kind: "Open task", entries: [
    { place: "best", team: "GROUND ZERO", project: "Crisis coordination system", status: "found",
      desc: "Drones search their own sectors over Kraków with thermal and regular cameras, and their findings feed rescue decisions.",
      repos: ["DmitryZherebtsov/HackYeah-Defence-Drone-03-04-10-2026"], demo: "https://drone-app-pdzf.onrender.com",
      note: "The repo name says Defence; the project documentation is titled GROUND ZERO." },
    { team: "WSP", project: "Will to Wheel", status: "found",
      desc: "Accessibility passport for places in Kraków: real measurements and the source of every fact, so a wheelchair user can check a place before leaving home.",
      repos: ["Moscuuu/will-to-wheel"], demo: "https://will-to-wheel.vercel.app",
      note: "The deck names the team “Zespół WSP”. WSP was also a finalist in Cracow without barriers." },
    { team: "Portugalskie Armatki Śnieżne", project: "pomożeMy", status: "found",
      desc: "Residents report local issues and propose initiatives; AI works out which public institution is responsible for each report.",
      repos: ["portugalskie-armatki-sniezne/eHackYeah2026"] },
    { team: "Metrykor", status: "none" },
    { team: "Null Pointers", status: "none" },
  ]},
  { id: "ai", name: "Artificial Intelligence", kind: "Open task", entries: [
    { place: "best", team: "Absolute Edge", status: "none",
      note: "A GitHub org named Absolute-Edge exists, but no public repo was found in it." },
    { team: "Paired Interns", project: "Rysio", status: "found",
      desc: "Daily speech-therapy exercises for children aged 4–8: AI scores pronunciation sound by sound, and a camera counts mouth exercises.",
      repos: ["killerk3emstar/rysio"], note: "The same owner's AI Control Layer deck is signed “Team Paired Interns”." },
    { team: "Rybiki Cukrowe", status: "none" },
    { team: "J", status: "none", note: "A one-letter team name can't be searched for." },
    { team: "Boróweczki", status: "none" },
  ]},
  { id: "impacther", name: "ImpactHer: Technology for real change", kind: "Open task", entries: [
    { place: "best", team: "RAPYGG", status: "none",
      note: "A GitHub org named RapyGG exists, but no public repo was found in it." },
    { team: "Śpiące Wydry", project: "Czeladniczka · PiszuPiszu", status: "found",
      desc: "Two repos from the weekend: Czeladniczka, where apprentices find craft masters, and PiszuPiszu, paper-letter pen pals between seniors and young people.",
      repos: ["Spiace-Wydry/Czeladniczka", "Spiace-Wydry/pen-pal"], demo: "https://czeladniczka.vercel.app" },
    { team: "J", status: "none" },
    { team: "Team Normandy", project: "TechBestie", status: "found",
      desc: "Mobile web app that helps girls explore technology studies through student stories.",
      repos: ["StraykerPL/normandy"], demo: "https://straykerpl.github.io/normandy/" },
    { team: "Mikformatycy", project: "Sejf", status: "found",
      desc: "Evidence vault for people experiencing abuse: evidence the perpetrator can't find, delete or dispute.",
      repos: ["Mikformatycy/sejf-place"] },
  ]},
  { id: "hubmi", name: "HubMI.pl", kind: "Partner task · Małopolska Innovative", entries: [
    { place: 1, team: "Zaplątani", status: "none" },
    { place: 2, team: "przewariaty", status: "none", note: "A GitHub org named przewariaty was created on 3 October, but no public repo was found in it." },
    { place: 3, team: "AGHolic", status: "none" },
    { team: "DropTheBase;", project: "Małopolski Hub Innowacji", status: "found",
      desc: "Matches residents' needs with social innovations: idea builder, usability tester, a go-between for municipalities and a coordinator panel.",
      repos: ["Drop-the-Base/malopolski-hub-2026"] },
    { team: "SideQuest", status: "none",
      note: "SiteQuestTeam's app looked like a match, but its own context file says it was built for the Smart City task, so it isn't this HubMI entry." },
  ]},
  { id: "huawei", name: "Imagine what's next", kind: "Partner task · Huawei", entries: [
    { place: 1, team: "Pride of the UK v2", status: "none" },
    { place: 2, team: "Carrotly", project: "SafeMesh", status: "found",
      desc: "Native HarmonyOS prototype for signed offline alerts passed along a store-and-forward mesh.",
      repos: ["carrotly-technologies-2026/SafeMesh", "carrotly-technologies-2026/huawei-hackyeah-2026"] },
    { place: 3, team: "Dangling Pointers", status: "none" },
    { team: "Double Oreo", project: "Celia.ai", status: "found",
      desc: "Heart-safety companion for people with Long QT syndrome, built natively for HarmonyOS phone and watch.",
      repos: ["x2oreo/Celia.ai"] },
    { team: "Foliarze in harmony", status: "none" },
  ]},
  { id: "superteam", name: "Finance Without Intermediaries", kind: "Partner task · Superteam Poland", entries: [
    { place: 1, team: "pszumanski", project: "ProofBond", status: "found",
      desc: "Prove a bug in a financial Rust component, deliver the finding privately and collect the funded reward without anyone approving the payout. Built on Solana.",
      repos: ["pszumanski/proofbond"] },
    { place: 2, team: "FairOdds", project: "FairOdds", status: "found",
      desc: "A bookmaker without the bookmaker: pooled bets on real matches, held and settled on Solana, with results delivered by an oracle.",
      repos: ["corki1337/FairOdds"] },
    { place: 3, team: "ad::team", status: "none" },
    { team: "SMK", status: "none" },
    { team: "Attention-Link", project: "Finance Without Intermediaries entry", status: "found",
      desc: "The team also entered Defence, streaming drone video to VR goggles.",
      repos: ["Attention-link/HackYeah_Finance_Without_Intermediaries_2026"], other: [{ repo: "Attention-link/HACKYEAH2026-defence", task: "Defence" }] },
  ]},
  { id: "krakow", name: "Cracow without barriers", kind: "Partner task · City of Kraków", entries: [
    { place: "best", team: "Jakobiany", project: "Swoją Drogą", status: "found",
      desc: "Helps people with limited mobility find places and plan trips around Kraków to fit their needs, such as no stairs or places to rest, from OpenStreetMap, transit and disabled-parking data.",
      repos: ["AdamStajek/Jakobiany-HackYeah"] },
    { team: "HackerSii", project: "Accessly", status: "found",
      desc: "A guide to Kraków that answers “will this place work for me?”, with community-pinned barriers such as broken lifts and high kerbs.",
      repos: ["HakerSII/Accessly", "HakerSII/Accessly-docs"] },
    { team: "WSP", project: "Will to Wheel", status: "found",
      desc: "Evidence-based accessibility passport for places in Kraków.",
      repos: ["Moscuuu/will-to-wheel"], demo: "https://will-to-wheel.vercel.app" },
    { team: "PL{Byte_Bandits}", project: "Dostępnik", status: "found",
      desc: "Checks whether a place in Kraków fits your needs as a wheelchair user or a parent with a pram: entrance, threshold, door width, lift, toilet, changing table, surface and parking, each with its source, date and reliability. Web app plus an Android and iOS app.",
      repos: ["Mateuszl28/Krak-w-bez-barier"], demo: "https://krak-w-bez-barier.vercel.app",
      note: "Repo shared by the team on Discord." },
    { team: "BBX", project: "NoBarriers", status: "likely",
      desc: "Route planning and place ratings for wheelchair users, parents with strollers and seniors; every fact shows its source, date and reliability.",
      repos: ["mjble/bbx-hackyeah-2026"] },
  ]},
  { id: "goldman", name: "AI Control Layer", kind: "Partner task · Goldman Sachs", entries: [
    { place: 1, team: "Solvro Londyn", status: "none",
      note: "No public repo found for their AI Control Layer entry. Their ImpactHer app, the Lunaria menstruation tracker, is public.",
      other: [{ repo: "Solvro/mobile-lunaria", task: "ImpactHer" }] },
    { place: 2, team: "Team MTG", status: "none" },
    { place: 3, team: "SEVA", status: "none" },
    { team: "Visdomers", project: "Clearance", status: "likely",
      desc: "AI control layer that enforces policy between agents, models and tools, built with VirtusLab's Visdom platform.",
      repos: ["damianlech/HackYeah26"] },
    { team: "Under Controllers", project: "Control", status: "found",
      desc: "Security gateway for AI agents: every model request and tool call is checked against a signed task warrant, a budget ledger and access rules.",
      repos: ["00200200/HackYeah2026"] },
    { team: "LeMIKO", status: "none",
      note: "No public repo found for their AI Control Layer entry. HerGPT, their women's health assistant for ImpactHer, is public.",
      other: [{ repo: "PW127/HerGPT-hackyeah", task: "ImpactHer" }] },
  ]},
]
