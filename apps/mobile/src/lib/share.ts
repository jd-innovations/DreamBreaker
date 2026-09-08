import { Share } from 'react-native';
import { buildEntityShareContent, type ShareEntityInput, type EntityShareContent } from './shareContent';

export type { ShareEntityInput, EntityShareContent };
export { buildEntityShareContent };

export async function shareEntity(input: ShareEntityInput): Promise<void> {
  const { message, title } = buildEntityShareContent(input);
  await Share.share({ message, title });
}
