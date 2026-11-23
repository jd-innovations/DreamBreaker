import { describe, it, expect } from 'vitest';
import { jsonLdHtml, mobileAppStructuredData, pageMetadata } from '../site';

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

describe('mobileAppStructuredData', () => {
  const app = mobileAppStructuredData('6812278259', 'https://pickleballapp.app/#organization');

  it('points at the App Store listing and links back to the organization', () => {
    expect(app['@type']).toBe('MobileApplication');
    expect(app.installUrl).toBe('https://apps.apple.com/app/id6812278259');
    expect(app.operatingSystem).toBe('iOS');
    expect(app.publisher).toEqual({ '@id': 'https://pickleballapp.app/#organization' });
  });

  it('is free and never claims a rating', () => {
    expect(app.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
    expect(app).not.toHaveProperty('aggregateRating');
  });
});
