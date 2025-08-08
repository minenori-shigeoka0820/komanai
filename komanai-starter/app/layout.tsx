export const metadata = {
  title: "こまない.com",
  description: "全国の交差点の混雑・改善案クチコミサイト"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
      </body>
    </html>
  );
}
