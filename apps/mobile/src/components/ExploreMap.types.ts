import type React from 'react';

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MapPinLike = {
  id: string;
  category: 'community' | 'tournament' | 'court' | 'listing';
  latitude: number;
  longitude: number;
  eventType?: 'open_play' | 'round_robin' | 'mini_tournament' | 'mixer' | 'ladder' | 'kings_court' | 'clinic';
  /**
   * Overrides the category-derived pin tint. Marketplace uses it to encode a
   * price band, which the category union has no way to express.
   *
   * Still just `pinColor` on a childless <Marker> — the only marker shape
   * proven safe under Fabric (react-native-maps#5378). Nothing here opens the
   * door to custom marker content.
   */
  color?: string;
};

export type ExploreMapProps = {
  pins: MapPinLike[];
  selectedId: string | null;
  onSelectPin: (id: string) => void;
  /**
   * Camera *target*, not a controlled value. Used as the initial camera, and
   * animated to whenever a new object identity is passed. The user's own pans
   * and zooms are owned by the map — pass a new region only when you actually
   * want to move the camera, or you'll fight the gesture.
   */
  region: Region;
  onRegionChangeComplete?: (nextRegion: Region) => void;
  onLocate: () => void;
  /** Tapping the map itself, e.g. to dismiss a selection. Optional. */
  onMapPress?: () => void;
  /**
   * Rendered above the map, inside the same container. Used for a legend or
   * controls that must sit over the map without being map children.
   */
  overlay?: React.ReactNode;
};
