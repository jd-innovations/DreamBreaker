// The image a coach offer shows when it has no photo of its own.
//
// Until now the fallback was an Ionicons `school-outline` glyph on a flat
// background. That reads as a missing image rather than a chosen one, and it
// is the common case rather than the edge case: no coach offer in the database
// has an uploaded image, so this is what the marketplace looks like today.
//
// Cropped to 2:1 at build time rather than shipped portrait and left to
// resizeMode="cover" — both hero slots are wide (full width x 180 and x 160),
// and the paddles are what the crop has to keep.
export const DEFAULT_LESSON_COVER = require('../../../assets/images/default-lesson-cover.jpg');
