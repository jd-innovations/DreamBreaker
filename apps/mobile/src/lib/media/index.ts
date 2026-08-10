// Public barrel for the ImagePipeline. Features import from '@/lib/media' only.
export { uploadImage, replaceImage, deletePreviousIfOwned } from './imagePipeline';
export { IMAGE_STANDARDS, getStandard } from './imageStandards';
export {
  IMAGE_CATEGORIES,
  NotImplementedError,
  ImageValidationError,
  ImageUploadError,
} from './types';
export type {
  ImageCategory,
  CategoryStandard,
  CropMode,
  OutputFormat,
  ThumbnailSpec,
  UploadRequest,
  UploadResult,
  UploadPhase,
} from './types';
