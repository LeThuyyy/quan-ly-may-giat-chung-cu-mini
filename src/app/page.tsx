const scope = [
  { number: '01', title: 'Xem máy', detail: 'Biết máy nào đang giặt và giờ xong dự kiến.' },
  { number: '02', title: 'Vào hàng', detail: 'Chọn sẵn sàng khi có thể lên máy trong 8 phút.' },
  { number: '03', title: 'Nhận lượt', detail: 'Đến đúng máy, kiểm tra và bắt đầu giặt.' },
];

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <span className="mark" aria-hidden="true">◉</span>
        <span>GIẶT CHUNG CƯ</span>
        <span className="badge">BẢN KHỞI TẠO</span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">CHUNG MÁY · KHÔNG CHUNG NỖI LO</p>
          <h1 id="hero-title">Biết khi nào<br /><em>đến lượt mình.</em></h1>
          <p className="lead">Một hàng đợi chung cho cả tòa. Xem máy đang hoạt động, vị trí của bạn và chỉ nhận máy khi bạn sẵn sàng.</p>
          <div className="notice" role="status">
            <span aria-hidden="true">✦</span>
            <div><strong>Đang dựng nền tảng</strong><br />Màn hình này chưa kết nối dữ liệu thật và chưa nhận đặt lượt.</div>
          </div>
        </div>
        <div className="illustration" aria-hidden="true">
          <div className="machine"><div className="controls"><i /><i /><span>0:45</span></div><div className="drum"><div className="wave" /></div><div className="foot"><i /><i /></div></div>
          <span className="spark one">✳</span><span className="spark two">✳</span>
        </div>
      </section>

      <section className="steps" aria-labelledby="steps-title">
        <div className="section-head"><p className="eyebrow">CÁCH HOẠT ĐỘNG</p><h2 id="steps-title">Ba bước, một lượt giặt</h2></div>
        <div className="step-grid">{scope.map((step) => <article className="step" key={step.number}><span className="step-number">{step.number}</span><h3>{step.title}</h3><p>{step.detail}</p></article>)}</div>
      </section>
      <footer>Phiên bản nền tảng · Không có dữ liệu cư dân thật trên trang này</footer>
    </main>
  );
}
