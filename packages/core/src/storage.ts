import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

let client: S3Client | undefined;

export function getStorage(): S3Client {
  client ??= new S3Client({
    endpoint: env.storage.endpoint,
    region: env.storage.region,
    forcePathStyle: Boolean(env.storage.endpoint), // RustFS necesita rutas, no subdominios
    // Google Cloud Storage (interoperabilidad S3) no acepta los checksums CRC32 que el SDK agrega por defecto.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials:
      env.storage.accessKeyId && env.storage.secretAccessKey
        ? { accessKeyId: env.storage.accessKeyId, secretAccessKey: env.storage.secretAccessKey }
        : undefined,
  });
  return client;
}

export async function ensureBucket(): Promise<void> {
  const s3 = getStorage();
  const Bucket = env.storage.bucket;
  try {
    await s3.send(new HeadBucketCommand({ Bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket }));
  }
}
