import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-persian",
  display: "swap",
});

export const metadata = {
  title: "A Conversation Before the Conversation",
  description: "A short questionnaire about language, machines, and understanding.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return <html lang="en" className={vazirmatn.variable} suppressHydrationWarning><body>{children}</body></html>;
}
