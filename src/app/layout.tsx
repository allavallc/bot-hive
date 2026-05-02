import type { ReactNode } from "react";

export const metadata = {
  title: "Bot Hive",
  description: "Live kanban for hive/ ticket files in your GitHub repos.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
