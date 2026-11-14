import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'hub-panel': {
    url: publicAssetUrl('ui/hub.uikitml'),
    type: AssetType.UIKitML,
    name: 'Loci Hub',
  },
});
