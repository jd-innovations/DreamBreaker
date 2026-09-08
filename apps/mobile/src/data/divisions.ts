export type DivisionData = {
  id: string;
  tournamentId: string;
  name: string;
  level: string;
  levelNavy: boolean;
  type: string;
  dates: string;
  capacity: number;
  registered: number;
  status: 'open' | 'waitlist' | 'full';
  // Extended fields for created divisions
  gender?: string;
  eventType?: string;
  skillMin?: number;
  skillMax?: number;
  entryFeeCents?: number;
  depositAmountCents?: number;
  createdAt?: string;
};

export type CreateDivisionInput = {
  tournamentId: string;
  name: string;
  eventType: string;
  gender: string;
  skillMin: number;
  skillMax: number;
  capacity: number;
  entryFeeCents: number;
  depositAmountCents: number;
};

let _created: DivisionData[] = [];
let _counter = 0;

export function addDivision(input: CreateDivisionInput): DivisionData {
  _counter++;
  const d: DivisionData = {
    id:                 `div-created-${_counter}`,
    tournamentId:       input.tournamentId,
    name:               input.name,
    level:              `${input.skillMin}-${input.skillMax}`,
    levelNavy:          true,
    type:               input.eventType.toLowerCase().replace(' ', '-'),
    dates:              '',
    capacity:           input.capacity,
    registered:         0,
    status:             'open',
    gender:             input.gender,
    eventType:          input.eventType,
    skillMin:           input.skillMin,
    skillMax:           input.skillMax,
    entryFeeCents:      input.entryFeeCents,
    depositAmountCents: input.depositAmountCents,
    createdAt:          new Date().toISOString(),
  };
  _created.push(d);
  return d;
}

export const DIVISIONS: DivisionData[] = [
  {
    id:           '1',
    tournamentId: 't1',
    name:         'Mixed Doubles',
    level:        '4.0',
    levelNavy:    true,
    type:         'doubles',
    dates:        'Sat, Jul 12 – Sun, Jul 13',
    capacity:     64,
    registered:   48,
    status:       'open',
  },
  {
    id:           '2',
    tournamentId: 't1',
    name:         'Mixed Doubles',
    level:        '4.5',
    levelNavy:    false,
    type:         'doubles',
    dates:        'Sat, Jul 12 – Sun, Jul 13',
    capacity:     32,
    registered:   32,
    status:       'waitlist',
  },
  {
    id:           '3',
    tournamentId: 't1',
    name:         "Men's Doubles",
    level:        '4.0',
    levelNavy:    true,
    type:         'doubles',
    dates:        'Fri, Jul 12 – Sun, Jul 13',
    capacity:     64,
    registered:   26,
    status:       'open',
  },
  {
    id:           '4',
    tournamentId: 't1',
    name:         "Women's Doubles",
    level:        '3.5',
    levelNavy:    false,
    type:         'doubles',
    dates:        'Sat, Jul 12 – Sun, Jul 13',
    capacity:     64,
    registered:   18,
    status:       'open',
  },
];

export function getDivisionsForTournament(tournamentId: string): DivisionData[] {
  return [
    ...DIVISIONS.filter(d => d.tournamentId === tournamentId),
    ..._created.filter(d => d.tournamentId === tournamentId),
  ];
}
