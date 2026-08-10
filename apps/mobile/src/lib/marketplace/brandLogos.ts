import type { ImageSourcePropType } from 'react-native';
import type { MarketplaceBrand } from './constants';

// Static require() map — Metro needs a literal require() call per asset, so
// this can't be built from a directory listing at runtime. Add one entry per
// brand as logo files are supplied (trimmed to their content bounds, no
// forced square canvas — see the "brand-logos" folder for source handling).
// Brands without an entry here simply render no logo; callers must treat
// this as optional.
export const BRAND_LOGOS: Partial<Record<MarketplaceBrand, ImageSourcePropType>> = {
  'Bread & Butter': require('../../../assets/images/brand-logos/bread-butter.png'),
};
