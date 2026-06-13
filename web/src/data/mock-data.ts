export const HERO_IMG =
  "https://images.unsplash.com/photo-1618551763300-dc7eb8ce3560?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHwxfHxwaWNrbGViYWxsJTIwYWN0aW9uJTIwcG9ydHJhaXR8ZW58MHx8fHwxNzgxMjYzMzI0fDA&ixlib=rb-4.1.0&q=85";

export const COURT_IMG =
  "https://images.unsplash.com/photo-1737477004595-e9b659bb44ca?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHw0fHxwaWNrbGViYWxsJTIwYWN0aW9uJTIwcG9ydHJhaXR8ZW58MHx8fHwxNzgxMjYzMzI0fDA&ixlib=rb-4.1.0&q=85";

export const PROFILE_IMAGES = {
  m1: "https://images.pexels.com/photos/11000101/pexels-photo-11000101.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  m2: "https://images.unsplash.com/photo-1606335544053-c43609e6155d?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85",
  w1: "https://images.unsplash.com/photo-1723004714201-cf224222b897?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85",
  w2: "https://images.unsplash.com/photo-1544717297-fa95b6ee9643?w=800&q=80",
  m3: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&q=80",
  w3: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&q=80",
};

export interface Tournament {
  id: string; name: string; location: string; venue: string;
  date: string; dateISO: string; format: string; level: string;
  prize: string; entryFee: number; holdFee: number; spots: number;
  filled: number; status: string; img: string; director: string;
}

export const tournaments: Tournament[] = [
  { id: "t-001", name: "Sunset Slam Open", location: "Austin, TX", venue: "Zilker Park Courts", date: "Mar 14, 2026", dateISO: "2026-03-14", format: "Doubles · Round Robin + Single Elim", level: "3.5 – 4.5", prize: "$5,200", entryFee: 65, holdFee: 10, spots: 64, filled: 41, status: "Open", img: COURT_IMG, director: "Marco Velasquez" },
  { id: "t-002", name: "Pacific Coast Classic", location: "San Diego, CA", venue: "Mission Bay Sports Complex", date: "Apr 02, 2026", dateISO: "2026-04-02", format: "Mixed Doubles · Double Elim", level: "4.0 – 5.0", prize: "$12,000", entryFee: 95, holdFee: 15, spots: 48, filled: 36, status: "Filling Fast", img: "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=1200&q=80", director: "Jenna Kowalski" },
  { id: "t-003", name: "Mountain States Showdown", location: "Denver, CO", venue: "Cherry Creek Pavilion", date: "Apr 19, 2026", dateISO: "2026-04-19", format: "Singles · Single Elim", level: "3.0 – 4.0", prize: "$3,400", entryFee: 50, holdFee: 10, spots: 32, filled: 12, status: "Open", img: "https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=1200&q=80", director: "Reid Tanaka" },
  { id: "t-004", name: "Iron Paddle Championship", location: "Miami, FL", venue: "South Beach Athletic Club", date: "May 08, 2026", dateISO: "2026-05-08", format: "Doubles · Round Robin", level: "4.5+", prize: "$18,500", entryFee: 140, holdFee: 20, spots: 24, filled: 22, status: "Filling Fast", img: "https://images.unsplash.com/photo-1551958219-acbc608c6377?w=1200&q=80", director: "Aisha Brennan" },
  { id: "t-005", name: "Lone Star Junior Cup", location: "Dallas, TX", venue: "DFW Pickle Arena", date: "May 22, 2026", dateISO: "2026-05-22", format: "Juniors · Single Elim", level: "U18", prize: "$1,800", entryFee: 30, holdFee: 5, spots: 40, filled: 8, status: "Open", img: "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=1200&q=80", director: "Marco Velasquez" },
  { id: "t-006", name: "Northern Lights Invitational", location: "Minneapolis, MN", venue: "Twin Cities Indoor Pickle", date: "Jun 06, 2026", dateISO: "2026-06-06", format: "Doubles · Double Elim", level: "3.5 – 4.5", prize: "$6,750", entryFee: 75, holdFee: 10, spots: 56, filled: 18, status: "Open", img: "https://images.unsplash.com/photo-1623298317883-6b70254edf31?w=1200&q=80", director: "Jenna Kowalski" },
];

export const matchPartners = [
  { id: "p-101", name: "Cassidy Rojas", age: 28, dupr: 4.21, location: "Austin, TX", distance: "3 mi", style: "Aggressive baseliner", availability: "Weekends + Tue evenings", bio: "Former tennis collegiate. Hunting for a steady mixed doubles partner for the spring circuit.", img: PROFILE_IMAGES.w1, badges: ["Mixed Doubles", "DUPR 4.2", "Tournaments: 14"] },
  { id: "p-102", name: "Devon Mackay", age: 34, dupr: 4.55, location: "Round Rock, TX", distance: "12 mi", style: "Soft-game specialist", availability: "Weeknights", bio: "Lefty. Reliable third shot drop. Looking for a fast-handed partner for double elim brackets.", img: PROFILE_IMAGES.m1, badges: ["Doubles", "DUPR 4.5", "Lefty"] },
  { id: "p-103", name: "Priya Sharma", age: 31, dupr: 3.92, location: "Cedar Park, TX", distance: "9 mi", style: "Counter-puncher", availability: "Sat / Sun mornings", bio: "Calm under pressure, never miss a return of serve. Open to mixed and women's doubles.", img: PROFILE_IMAGES.w2, badges: ["Mixed", "Women's Doubles", "DUPR 3.9"] },
  { id: "p-104", name: "Jordan Whitlock", age: 26, dupr: 4.78, location: "Austin, TX", distance: "5 mi", style: "Bangers + transition", availability: "Flexible", bio: "Hard hitter looking to climb 5.0. Need a controlled partner who can dink all day.", img: PROFILE_IMAGES.m2, badges: ["Doubles", "DUPR 4.8", "Tournaments: 27"] },
  { id: "p-105", name: "Avery Lin", age: 29, dupr: 4.05, location: "San Marcos, TX", distance: "21 mi", style: "All-court", availability: "Weekends", bio: "Just moved from the Bay Area. Looking for a strong mixed partner for the Sunset Slam.", img: PROFILE_IMAGES.w3, badges: ["Mixed", "DUPR 4.0", "New to TX"] },
];

export const upcomingForPlayer = [
  { id: "t-001", name: "Sunset Slam Open", date: "Mar 14", status: "Registered", partner: "Cassidy Rojas" },
  { id: "t-002", name: "Pacific Coast Classic", date: "Apr 02", status: "Spot Held", partner: "—" },
];

export const recentMatches = [
  { id: "m-1", opponent: "Hawkins / Choi", score: "11-7, 11-9", result: "W", event: "Capital City Open", date: "Feb 02" },
  { id: "m-2", opponent: "Patel / Olsen", score: "9-11, 11-6, 11-8", result: "W", event: "Capital City Open", date: "Feb 02" },
  { id: "m-3", opponent: "Reyes / Diaz", score: "8-11, 7-11", result: "L", event: "Hill Country Clash", date: "Jan 18" },
  { id: "m-4", opponent: "Singh / Park", score: "11-4, 11-7", result: "W", event: "Hill Country Clash", date: "Jan 18" },
];

export const playerStats = {
  name: "Alex Morgan", handle: "@alex.dinks", dupr: 4.18, duprDelta: 0.12,
  ranking: 412, rankingDelta: -23, wins: 38, losses: 14, tournaments: 11,
  prizeWon: 1240, location: "Austin, TX", hand: "Right", paddle: "Selkirk Power Air",
  bio: "Competitive 4.2 doubles player. Soft game enthusiast, weekend warrior, Sunday brunch optional.",
  img: PROFILE_IMAGES.m3,
};

export const directorStats = {
  tournamentsHosted: 14, activeTournaments: 3, totalPlayers: 612, revenue: 28450, upcomingHolds: 47,
};

export const adminStats = {
  totalUsers: 8492, activePlayers: 5210, directors: 84, liveTournaments: 12,
  monthlyRevenue: 142800, holdFeesPending: 4380,
};

export const directorTournaments = [
  { id: "t-001", name: "Sunset Slam Open", registered: 41, capacity: 64, status: "Open", revenue: 2665, date: "Mar 14" },
  { id: "t-005", name: "Lone Star Junior Cup", registered: 8, capacity: 40, status: "Open", revenue: 240, date: "May 22" },
  { id: "t-007", name: "Hill Country Spring", registered: 28, capacity: 32, status: "Almost Full", revenue: 1820, date: "Mar 28" },
];

export const adminUsers = [
  { id: "u-1", name: "Marco Velasquez", role: "Director", status: "Active", joined: "Jan 2024", tournaments: 8 },
  { id: "u-2", name: "Cassidy Rojas", role: "Player", status: "Active", joined: "Mar 2024", tournaments: 14 },
  { id: "u-3", name: "Jenna Kowalski", role: "Director", status: "Active", joined: "Feb 2024", tournaments: 5 },
  { id: "u-4", name: "Devon Mackay", role: "Player", status: "Active", joined: "Apr 2024", tournaments: 22 },
  { id: "u-5", name: "Reid Tanaka", role: "Director", status: "Pending", joined: "Feb 2026", tournaments: 1 },
  { id: "u-6", name: "Priya Sharma", role: "Player", status: "Active", joined: "Jun 2024", tournaments: 9 },
];

export const bracketMatches = {
  qf: [
    { id: "qf1", p1: "Morgan / Rojas", p2: "Hawkins / Choi", s1: 11, s2: 7, winner: 1 },
    { id: "qf2", p1: "Patel / Olsen", p2: "Reyes / Diaz", s1: 9, s2: 11, winner: 2 },
    { id: "qf3", p1: "Mackay / Lin", p2: "Whitlock / Tran", s1: 11, s2: 8, winner: 1 },
    { id: "qf4", p1: "Singh / Park", p2: "Brennan / Cho", s1: 6, s2: 11, winner: 2 },
  ],
  sf: [
    { id: "sf1", p1: "Morgan / Rojas", p2: "Reyes / Diaz", s1: 11, s2: 9, winner: 1 },
    { id: "sf2", p1: "Mackay / Lin", p2: "Brennan / Cho", s1: 8, s2: 11, winner: 2 },
  ],
  f: [{ id: "f1", p1: "Morgan / Rojas", p2: "Brennan / Cho", s1: "—", s2: "—", winner: 0 }],
};

export const scheduleBlocks = [
  { time: "8:00 AM",  court: "Court 1",      match: "Morgan/Rojas vs Hawkins/Choi",  round: "QF" },
  { time: "8:00 AM",  court: "Court 2",      match: "Patel/Olsen vs Reyes/Diaz",     round: "QF" },
  { time: "9:30 AM",  court: "Court 1",      match: "Mackay/Lin vs Whitlock/Tran",   round: "QF" },
  { time: "9:30 AM",  court: "Court 2",      match: "Singh/Park vs Brennan/Cho",     round: "QF" },
  { time: "11:00 AM", court: "Center Court", match: "Semifinal 1",                   round: "SF" },
  { time: "12:30 PM", court: "Center Court", match: "Semifinal 2",                   round: "SF" },
  { time: "2:00 PM",  court: "Center Court", match: "Championship Final",            round: "F"  },
];

export const matchPartnersForProfile = matchPartners.slice(0, 4);
