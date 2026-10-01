import { describe, expect, it } from 'vitest';
import { makeTeamShortener, shortName, teamFull, teamLines } from '../teamNames';

describe('shortName', () => {
  it('uses the first initial and the last word', () => {
    expect(shortName('Anna Leigh Waters')).toBe('A. Waters');
    expect(shortName('anna bright')).toBe('A. bright');
  });
  it('keeps a suffix with the surname', () => {
    expect(shortName('John Smith Jr.')).toBe('J. Smith Jr.');
    expect(shortName('Ken Griffey III')).toBe('K. Griffey III');
  });
  it('leaves single names alone', () => {
    expect(shortName('Cher')).toBe('Cher');
    expect(shortName('  Cher ')).toBe('Cher');
  });
});

describe('teamLines / teamFull', () => {
  it('gives full names, with a fallback for a blank one', () => {
    const t = [{ name: 'Anna Leigh Waters' }, { name: ' ' }];
    expect(teamLines(t)).toEqual(['Anna Leigh Waters', 'Player']);
    expect(teamFull(t)).toBe('Anna Leigh Waters / Player');
  });
});

describe('makeTeamShortener', () => {
  const awAb = [{ name: 'Anna Leigh Waters' }, { name: 'Anna Bright' }];

  it('shortens both players', () => {
    expect(makeTeamShortener([awAb])(awAb)).toBe('A. Waters / A. Bright');
  });
  it('never shortens guests', () => {
    const t = [{ name: 'Anna Bright' }, { name: 'Coach Dee', guest: true }];
    expect(makeTeamShortener([t])(t)).toBe('A. Bright / Coach Dee');
  });
  it('keeps full names when two players in the field would collide', () => {
    const t1 = [{ name: 'John Smith' }, { name: 'Anna Bright' }];
    const t2 = [{ name: 'Jane Smith' }, { name: 'Ben Johns' }];
    const short = makeTeamShortener([t1, t2]);
    expect(short(t1)).toBe('John Smith / A. Bright');
    expect(short(t2)).toBe('Jane Smith / B. Johns');
  });
  it('does not treat the same player twice as a collision', () => {
    const t = [{ name: 'John Smith' }];
    expect(makeTeamShortener([t, t])(t)).toBe('J. Smith');
  });
  it('handles singles', () => {
    const t = [{ name: 'Ben Johns' }];
    expect(makeTeamShortener([t])(t)).toBe('B. Johns');
  });
});
