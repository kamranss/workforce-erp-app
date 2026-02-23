import '../src/styles/app.css';

export const metadata = {
  title: 'ArchBuild'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body data-auth="anon" data-role="anon">
        {children}
      </body>
    </html>
  );
}
