import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Giặt chung cư',
  description: 'Xem trạng thái máy giặt và hàng đợi trong tòa nhà.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
