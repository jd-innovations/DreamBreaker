# Media Development Standard

These rules apply to all media upload and image handling work in DreamBreaker.

- Never upload directly to Supabase Storage.
- All uploads must go through `ImagePipeline`.
- Never hardcode buckets.
- Never compress images inside screens.
- Never generate filenames inside features.
- Never bypass `IMAGE_STANDARDS`.
- All new image categories must be registered before use.
