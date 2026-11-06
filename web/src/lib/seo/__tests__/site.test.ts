import { describe, it, expect } from 'vitest';
import { jsonLdHtml, pageMetadata } from '../site';

describe('jsonLdHtml', () => {
  it('cannot be closed early by a user-authored name', () => {
    const html = jsonLdHtml({ name: 'Slam</script><script>alert(1)</script>' }).__html;
    expect(html).not.toContain('<');
    expect(JSON.parse(html).name).toBe('Slam</script><script>alert(1)</script>');
  });
});

describe('pageMetadata', () => {
  it('gives the page its own canonical and a share card with the same words', () => {
    const meta = pageMetadata({ title: 'T', description: 'D', path: '/tournaments' });
    expect(meta.alternates?.canonical).toBe('https://pickleballapp.app/tournaments');
    expect(meta.openGraph?.url).toBe('https://pickleballapp.app/tournaments');
    expect(meta.openGraph?.title).toBe('T');
    expect(meta.openGraph?.description).toBe('D');
  });
});
