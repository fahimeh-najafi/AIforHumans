import "./globals.css";

export const metadata = {
  title: "A Conversation Before the Conversation",
  description: "A short questionnaire about language, machines, and understanding.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
