import type { Metadata }
from "next";
import { Geist, Geist_Mono }
from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], });
export const metadata: Metadata = {
  title: "Suraksha Circle | FamilyOS India",
  description: "Family safety OS for India — daily check-ins, SOS emergency alerts, medical cards and scam protection.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Suraksha" },
  icons: { icon: "/icon.svg" },
}
export const viewport = { themeColor: "#059669" }
export default function RootLayout({ children }: LayoutProps<"/">) { return ( <html lang="en" className={`${geistSans.variable}
${geistMono.variable}
h-full antialiased`}
> <body className="min-h-full flex flex-col">
  {children}
  <ServiceWorkerRegistrar />
</body> </html> ); }