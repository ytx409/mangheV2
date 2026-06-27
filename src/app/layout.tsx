import type { Metadata, Viewport } from "next";
import Script from 'next/script';
import "./globals.css";

export const metadata: Metadata = {
  title: "盲盒去哪 - 吃喝玩乐随机推荐",
  description: "以盲盒惊喜感+地图精准推荐，解决用户吃喝玩乐选择困难。纯免费、零广告、无商业推广的随机推荐工具。",
  keywords: "盲盒,吃喝玩乐,推荐,美食,游玩,休闲,随机推荐,地图导航",
  authors: [{ name: "盲盒去哪" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "盲盒去哪",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#42A5F5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const amapWebKey = process.env.NEXT_PUBLIC_AMAP_WEB_KEY || '';
  const amapSecurityCode = process.env.AMAP_SECURITY_CODE || '';

  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.cn" />
        <link rel="preconnect" href="https://fonts.gstatic.com.cn" crossOrigin="anonymous" />
        {/* 高德地图安全配置 */}
        <Script
          id="amap-security-config"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window._AMapSecurityConfig = {
                securityJsCode: '${amapSecurityCode}'
              };
            `
          }}
        />

        {/* 高德地图 Web JS API */}
        {amapWebKey ? (
          <Script
            id="amap-api"
            src={`https://webapi.amap.com/maps?v=2.0&key=${amapWebKey}&plugin=AMap.Geolocation,AMap.PlaceSearch,AMap.AutoComplete,AMap.Driving,AMap.Walking,AMap.Geocoder`}
            strategy="beforeInteractive"
          />
        ) : null}
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
