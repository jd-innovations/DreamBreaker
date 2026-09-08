export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MapPinLike = {
  id: string;
  category: 'community' | 'tournament' | 'court';
  latitude: number;
  longitude: number;
  eventType?: 'open_play' | 'round_robin' | 'mini_tournament' | 'mixer' | 'ladder' | 'kings_court' | 'clinic';
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
};
