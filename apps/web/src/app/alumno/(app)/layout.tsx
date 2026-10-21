import { StudentShell } from "@/components/student-shell";
import { requireUser } from "@/lib/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("STUDENT");
  return <StudentShell user={user}>{children}</StudentShell>;
}
