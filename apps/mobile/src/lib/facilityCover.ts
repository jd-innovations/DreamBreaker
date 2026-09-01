// The image a facility shows when it has no photo of its own.
//
// Kept out of eventCover.ts: that module is specifically the play-event cover,
// and a facility briefly borrowed it before this artwork existed. They are
// separate images with separate reasons to change, so they get separate
// modules rather than one aliased constant.
//
// Bundled rather than uploaded per facility: there is no facility photo bucket
// at all, and shipping one 85 KB asset beats storing thousands of identical
// copies — the same reasoning as DEFAULT_EVENT_COVER.
export const DEFAULT_FACILITY_COVER = require('../../assets/images/default-facility-cover.jpg');
