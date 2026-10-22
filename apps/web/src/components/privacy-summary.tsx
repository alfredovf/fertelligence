// Resumen en lenguaje simple (Documentos legales y de consentimiento). Se muestra en la página de
// consentimiento y en /privacidad, arriba del texto completo.
export function PrivacySummary({ school, student }: { school: string; student?: string }) {
  const who = student ?? "tu hijo o hija";
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5">
      <li>
        <b>Qué es:</b> Fertelligence es la plataforma donde los docentes de {school} le dan tareas a {who}, y donde las resuelve.
      </li>
      <li>
        <b>Qué guardamos:</b> nombre, curso, email, las tareas que hace, sus respuestas y sus notas. También tus datos de contacto.
      </li>
      <li>
        <b>Qué no guardamos:</b> datos de salud ni diagnósticos. No grabamos su voz.
      </li>
      <li>
        <b>Quién lo ve:</b> sus docentes y la dirección de la escuela. Nadie más.
      </li>
      <li>
        <b>Inteligencia artificial:</b> ayuda a los docentes a armar ejercicios. Nunca recibe datos de {who}, y no pone notas: las decide el docente.
      </li>
      <li>
        <b>Servicios de otros países:</b> usamos servicios de Google (incluida su inteligencia artificial, Gemini) y Resend, que guardan o procesan datos en Estados Unidos.
      </li>
      <li>
        <b>Cuánto tiempo:</b> mientras esté en la escuela y un año más. Después se borra todo.
      </li>
      <li>
        <b>Tus derechos:</b> podés pedir ver, corregir o borrar sus datos, o retirar este permiso cuando quieras, escribiendo a la escuela.
      </li>
    </ul>
  );
}
