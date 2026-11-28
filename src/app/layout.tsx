import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Giặt chung cư',
  icons: { icon: '/icon.svg', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Giặt chung cư', statusBarStyle: 'default' },
  description: 'Xem trạng thái máy giặt và hàng đợi trong tòa nhà.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
