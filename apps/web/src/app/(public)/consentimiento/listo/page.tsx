import { Notice } from "@/components/ui";

export const metadata = { title: "Consentimiento · Fertelligence" };

export default async function ConsentDonePage({ searchParams }: { searchParams: Promise<{ resultado?: string }> }) {
  const { resultado } = await searchParams;
  if (resultado === "rechazado") {
    return (
      <>
        <h1 className="font-display text-2xl font-semibold">Registramos tu respuesta</h1>
        <Notice>No diste el consentimiento, así que el alumno no va a poder usar Fertelligence. Le avisamos a la escuela. Si cambiás de opinión, comunicate con la escuela.</Notice>
      </>
    );
  }
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">¡Listo, gracias!</h1>
      <Notice tone="ok">Registramos tu consentimiento. El alumno ya puede ingresar a Fertelligence. Te enviamos una copia por email.</Notice>
    </>
  );
}
