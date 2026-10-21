// Lectura centralizada de la configuración. Las claves externas son opcionales:
// sin ellas la app arranca con esas funciones desactivadas.
function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get schoolName() {
    return optional("SCHOOL_NAME") ?? "Escuela de prueba";
  },
  storage: {
    get endpoint() {
      return optional("S3_ENDPOINT");
    },
    get region() {
      return optional("S3_REGION") ?? "us-east-1";
    },
    get bucket() {
      return optional("S3_BUCKET") ?? "fertelligence";
    },
    get accessKeyId() {
      return optional("S3_ACCESS_KEY_ID");
    },
    get secretAccessKey() {
      return optional("S3_SECRET_ACCESS_KEY");
    },
  },
  integrations: {
    get anthropic() {
      return Boolean(optional("ANTHROPIC_API_KEY"));
    },
    get google() {
      return Boolean(optional("GOOGLE_CLIENT_ID") && optional("GOOGLE_CLIENT_SECRET"));
    },
    get resend() {
      return Boolean(optional("RESEND_API_KEY"));
    },
  },
};
