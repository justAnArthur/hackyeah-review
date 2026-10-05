// The HY-mentor role on the official HackYeah Discord, cross-checked against
// hackyeah.pl/mentors. LinkedIn profiles were found through public search on
// 5 October 2026; `match` says how sure the identification is.
export type MentorMatch = "ok" | "prob" | "none"

export type Mentor = {
  name: string
  handle: string
  role: string
  li?: string
  match: MentorMatch
  img?: string
}

export const MENTORS: Mentor[] = [
  { name: "Mike Grochowski", handle: "mike_grochowski", role: "Event Organizer at PROIDEA (runs HackYeah)", li: "https://pl.linkedin.com/in/mikegrochowski", match: "ok", img: "https://cdn.discordapp.com/avatars/573268498512609303/ad1172ebe732e84f690727bc839ad0d1.webp?size=128" },
  { name: "Bartłomiej Węglarz", handle: "mentor_bartlomiej_weglarz_umk", role: "Smart City & Data Analytics Manager · Kraków City Hall", li: "https://pl.linkedin.com/in/bartlomiej-weglarz", match: "ok", img: "https://cdn.discordapp.com/avatars/1419757214037577778/a11892149aa5c3e572b23d20d3a7fdc5.webp?size=128" },
  { name: "Adam Lange", handle: "adamlange", role: "Cybersecurity specialist · Warsaw · judged a past HackYeah track", li: "https://pl.linkedin.com/in/adamlangepl", match: "ok", img: "https://cdn.discordapp.com/avatars/669929058267824128/a22ebdd268d424a4a1ceb4820a02e1d1.webp?size=128" },
  { name: "Anna Jassak", handle: "annajsk_33915", role: "Mentor / PO / PM at HRAuctions · Kraków", li: "https://pl.linkedin.com/in/anna-jassak", match: "ok", img: "https://cdn.discordapp.com/avatars/1346225591334211585/01f9357bdfbe2b0fd682123c0b36c0a0.webp?size=128" },
  { name: "Bartosz Gawroński", handle: "bartosz.gawronski", role: "Co-founder @ Whisper · Tech Lead @ Wakacje.pl", li: "https://pl.linkedin.com/in/bartosz-gawro%C5%84ski-956537146", match: "ok", img: "https://cdn.discordapp.com/avatars/552172789445165058/075d2fe631abdf652b99da8795d94aab.webp?size=128" },
  { name: "Damian Strycharczuk", handle: "leny96", role: "DevSecOps Engineer · own IT firm, Chełm", match: "none", img: "https://cdn.discordapp.com/avatars/308671249716871169/deab4efbd64523a9d6faf58320e7bbae.webp?size=128" },
  { name: "Dmytro Kolida", handle: "dymirt", role: "Solutions & Integration Eng · HackYeah 2026 mentor + judge (Defence)", li: "https://www.linkedin.com/in/dmytro-kolida", match: "ok", img: "https://cdn.discordapp.com/avatars/1128301076945318008/ffc54f93587bddb0a4c2c6f3126b6ace.webp?size=128" },
  { name: "Dominik Kędziak", handle: "dominikkedziak", role: "GCP Data Engineer at Xebia · Kraków", li: "https://pl.linkedin.com/in/dominik-kedziak", match: "ok" },
  { name: "Emilian Suchecki", handle: "teager300", role: "CTO at SiDLY Healthcare · lecturer at Akademia WIT", li: "https://pl.linkedin.com/in/emilian-suchecki", match: "ok", img: "https://cdn.discordapp.com/avatars/581215057778704422/4df38affab61acc8e66e5ccc0057eab2.webp?size=128" },
  { name: "Jordan Jażbor", handle: "panadulek", role: "C++ Software Engineer at Autodesk · Katowice", li: "https://pl.linkedin.com/in/jordan-ja%C5%BCbor-b52165221", match: "ok", img: "https://cdn.discordapp.com/avatars/246379857850793984/2785a9be9d34af9c4860c8296ee3b1cc.webp?size=128" },
  { name: "Jordan Mruczyński", handle: "jordanmm", role: "Guidewire/AI Developer · BeeSafe founder", li: "https://pl.linkedin.com/in/jordanmruc", match: "ok", img: "https://cdn.discordapp.com/avatars/350374309161598977/0d8413835f3669453837a7f7d02cbeed.webp?size=128" },
  { name: "Kamil Cisewski", handle: "shin8338", role: "The only profile of this name on Polish LinkedIn", li: "https://pl.linkedin.com/in/kamil-cisewski", match: "ok" },
  { name: "Leander Seidl", handle: "lcseidl", role: "Fractional CMO & Marketing Consultant · seidl.soy", li: "https://www.linkedin.com/in/lcseidl/", match: "ok", img: "https://cdn.discordapp.com/avatars/574529663678939147/fcbb6c2b48e988f437e8e2fce5e9b99a.webp?size=128" },
  { name: "M. Kucharskov", handle: "kucharskov", role: "Michał Kucharski · purple-teamer at Unshade", li: "https://pl.linkedin.com/in/kucharskov", match: "ok", img: "https://cdn.discordapp.com/avatars/271314313984212992/4554ca576895de3abbab6c2816c7673a.webp?size=128" },
  { name: "Marcin Golonka", handle: "mer7320", role: "CEO at Halfbit Studio", li: "https://pl.linkedin.com/in/golonkam", match: "ok", img: "https://cdn.discordapp.com/avatars/667708574692147200/d3ac1d559490e4cb540172bd0a27191c.webp?size=128" },
  { name: "Marcin Orocz", handle: "marcinorocz", role: "Owner at orocz.com · Tychy", li: "https://pl.linkedin.com/in/marcinorocz", match: "ok", img: "https://cdn.discordapp.com/avatars/874255033368215572/d8fd6e631abc52ea223f89041d9cd7d6.webp?size=128" },
  { name: "Martyna Prandzioch", handle: "martynaprandzioch", role: "Ruda Śląska", li: "https://pl.linkedin.com/in/martyna-prandzioch", match: "prob", img: "https://cdn.discordapp.com/avatars/1526547783341969408/d56ead6204d228a81632b7993efc7154.webp?size=128" },
  { name: "Michał Błaszczak", handle: "miblak", role: "CEO & Founder at OWNROOT · GRC & cybersecurity", li: "https://www.linkedin.com/in/michal-blaszczak", match: "ok", img: "https://cdn.discordapp.com/avatars/854806814573985853/fe5ef421c1140e0f8df4577065e656e5.webp?size=128" },
  { name: "Michał Szleger", handle: "elarionth.", role: "Senior IT Consultant (SME) at Capgemini", li: "https://pl.linkedin.com/in/michalszleger", match: "ok", img: "https://cdn.discordapp.com/avatars/1353315239969558569/69eb960a830d4578dafb8dfdc9282575.webp?size=128" },
  { name: "Patrik Soból", handle: "paprikens", role: "Social innovation at ROPS Kraków · UJ", li: "https://pl.linkedin.com/in/patrik-sob%C3%B3l-9b44b0281", match: "prob", img: "https://cdn.discordapp.com/avatars/268771585391853569/8ac81b8f56033bd63ae65fd596e1752a.webp?size=128" },
  { name: "Sylwester Walczak", handle: "swalczak.eth", role: "Axpo Polska · Saïd Business School, Oxford", li: "https://pl.linkedin.com/in/sylwester-walczak-269b33100", match: "prob", img: "https://cdn.discordapp.com/avatars/880156220047097916/5930b53a7877c27d6c2fa3097f411bc6.webp?size=128" },
  { name: "Sylwia Szubart", handle: "sylwiaszubart", role: "Warsaw", li: "https://pl.linkedin.com/in/sylwia-szubart", match: "ok", img: "https://cdn.discordapp.com/avatars/1526239372834377859/6c5996770c985bcd6e5b68131ff2ba04.webp?size=128" },
  { name: "Szymon Redzik", handle: "vyqe", role: "IT Project Manager · Event Operations (hackathons)", li: "https://pl.linkedin.com/in/redzikszymon", match: "ok", img: "https://cdn.discordapp.com/avatars/472290226707103774/6d20dcb2580f6b0b303d0cbbcb194861.webp?size=128" },
  { name: "Weronika Jaskuła", handle: "w.jaskula", role: "AI Data Quality Specialist at Revolut", match: "none", img: "https://cdn.discordapp.com/avatars/1195382490509103104/8cc055d0490def15ad1e61b632c1cff6.webp?size=128" },
]
