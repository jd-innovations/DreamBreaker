import { describe, expect, it } from 'vitest';
import { looksLikeFullName, makeTeamShortener, shortName, teamFull, teamLines } from '../teamNames';

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
  it('shortens a guest only when the name looks like a first and last name', () => {
    const t = [{ name: 'Andrei Daescu', guest: true }, { name: 'Mike T', guest: true }];
    expect(makeTeamShortener([t])(t)).toBe('A. Daescu / Mike T');
    const u = [{ name: 'coach dee', guest: true }];
    expect(makeTeamShortener([u])(u)).toBe('coach dee');
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

describe('looksLikeFullName', () => {
  it('accepts capitalised first and last names', () => {
    expect(looksLikeFullName('Andrei Daescu')).toBe(true);
    expect(looksLikeFullName('Anna Leigh Waters')).toBe(true);
    expect(looksLikeFullName('John Smith Jr.')).toBe(true);
    expect(looksLikeFullName('Émile Zola')).toBe(true);
  });
  it('rejects initials, lower case and single words', () => {
    expect(looksLikeFullName('Mike T')).toBe(false);
    expect(looksLikeFullName('Mike T.')).toBe(false);
    expect(looksLikeFullName('coach dee')).toBe(false);
    expect(looksLikeFullName('Cher')).toBe(false);
  });
});
