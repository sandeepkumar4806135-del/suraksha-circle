import type { Metadata }
from "next";
import { Geist, Geist_Mono }
from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], });
export const metadata: Metadata = {
  title: {
    default: "Suraksha Circle | FamilyOS India",
    template: "%s | Suraksha Circle",
  },
  description:
    "Family safety OS for India — daily check-ins, SOS emergency alerts, medical cards and scam protection.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Suraksha" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};
export const viewport = { themeColor: "#059669" }
export default function RootLayout({ children }: LayoutProps<"/">) { return ( <html lang="en" className={`${geistSans.variable}
${geistMono.variable}
h-full antialiased`}
> <body className="min-h-full flex flex-col">
  {children}
  <ServiceWorkerRegistrar />
</body> </html> ); }