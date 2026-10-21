import { requireUser } from "@/lib/session";

export default async function StudentRootLayout({ children }: { children: React.ReactNode }) {
  await requireUser("STUDENT");
  return children;
}
