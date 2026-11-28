import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Giặt chung cư',
    short_name: 'Giặt chung cư',
    description: 'Hàng đợi máy giặt và thông báo khi đến lượt kiểm tra máy.',
    lang: 'vi',
    start_url: '/buildings',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f8f7',
    theme_color: '#106b54',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
