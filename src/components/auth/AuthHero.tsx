import { CheckCircleIcon } from '@/components/Icons';
import AuthIllustration from '@/components/auth/AuthIllustration';
import BrandLogo from '@/components/auth/BrandLogo';

const BENEFITS = [
  {
    title: 'Xếp hàng minh bạch',
    detail: 'Theo dõi thứ tự chờ rõ ràng theo từng tòa nhà, không lo chen ngang.',
  },
  {
    title: 'Theo dõi trạng thái máy giặt',
    detail: 'Biết ngay máy nào đang rảnh, đang chạy hoặc sắp hoàn tất.',
  },
  {
    title: 'Chủ động quản lý lượt giặt',
    detail: 'Giữ lượt 8 phút, nhận bàn giao đồ và đổi lượt linh hoạt cùng cư dân.',
  },
];

export default function AuthHero() {
  return (
    <div className="auth-hero">
      <div className="auth-hero-top">
        <BrandLogo subtitle="Quản lý giặt chung cư" />
        <h1 className="auth-hero-title">Giặt đồ dễ dàng. Sống thảnh thơi.</h1>
        <p className="auth-hero-lead">
          Đăng ký lượt, theo dõi máy giặt và chủ động sắp xếp thời gian của bạn.
        </p>
      </div>

      <AuthIllustration />

      <ul className="auth-benefits">
        {BENEFITS.map((item) => (
          <li key={item.title} className="auth-benefit-item">
            <span className="auth-benefit-icon" aria-hidden="true">
              <CheckCircleIcon size={18} />
            </span>
            <div>
              <strong className="auth-benefit-title">{item.title}</strong>
              <p className="auth-benefit-detail">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
