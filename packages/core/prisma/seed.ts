// Datos de ejemplo: una escuela de prueba con un administrador, dos docentes, cinco alumnos
// y una tarea de cada tipo. Es idempotente: si la escuela ya existe, no hace nada.
import { Prisma, PrismaClient, type TaskType } from "@prisma/client";
import { env } from "../src/env";
import { ensureBucket } from "../src/storage";
import { taskTypeSchemas } from "../src/task-types";

const prisma = new PrismaClient();

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

type SeedItem = { content: unknown; correct: unknown; maxPoints: number; explanation: string };
type SeedTemplate = { title: string; instructions: string; subject: string; type: TaskType; settings?: object; items: SeedItem[] };

const templates: SeedTemplate[] = [
  {
    title: "Estados del agua",
    instructions: "Leé cada pregunta y elegí la respuesta correcta.",
    subject: "Ciencias Naturales",
    type: "MULTIPLE_CHOICE",
    items: [
      {
        content: { question: "¿En qué estado está el agua cuando forma un cubito de hielo?", multiple: false, options: [{ id: "a", text: "Líquido" }, { id: "b", text: "Sólido" }, { id: "c", text: "Gaseoso" }] },
        correct: { optionIds: ["b"] },
        maxPoints: 5,
        explanation: "El hielo es agua en estado sólido: sus partículas están muy juntas.",
      },
      {
        content: { question: "¿Cuáles de estos son estados del agua?", multiple: true, options: [{ id: "a", text: "Sólido" }, { id: "b", text: "Arena" }, { id: "c", text: "Gaseoso" }] },
        correct: { optionIds: ["a", "c"] },
        maxPoints: 5,
        explanation: "El agua puede estar en estado sólido, líquido o gaseoso.",
      },
    ],
  },
  {
    title: "El ciclo del agua",
    instructions: "Indicá si cada afirmación es verdadera o falsa. Si se pide, explicá por qué.",
    subject: "Ciencias Naturales",
    type: "TRUE_FALSE",
    items: [
      { content: { statement: "El agua de los ríos llega al mar.", requireJustification: false, justificationPoints: 0 }, correct: { value: true }, maxPoints: 4, explanation: "Los ríos desembocan en el mar o en lagos." },
      { content: { statement: "Las nubes están formadas por humo.", requireJustification: true, justificationPoints: 3 }, correct: { value: false, expectedJustification: "Están formadas por gotitas de agua condensada." }, maxPoints: 6, explanation: "Las nubes son gotitas de agua que se juntaron en el cielo." },
    ],
  },
  {
    title: "Animales y cómo se mueven",
    instructions: "Uní cada animal con su forma de desplazarse.",
    subject: "Ciencias Naturales",
    type: "MATCHING",
    items: [
      {
        content: {
          left: [{ id: "l1", text: "Pez" }, { id: "l2", text: "Águila" }, { id: "l3", text: "Serpiente" }, { id: "l4", text: "Caballo" }],
          right: [{ id: "r1", text: "Vuela" }, { id: "r2", text: "Nada" }, { id: "r3", text: "Galopa" }, { id: "r4", text: "Repta" }],
        },
        correct: { pairs: [["l1", "r2"], ["l2", "r1"], ["l3", "r4"], ["l4", "r3"]] },
        maxPoints: 10,
        explanation: "Cada animal se desplaza según su cuerpo y el medio donde vive.",
      },
    ],
  },
  {
    title: "Fracciones equivalentes",
    instructions: "Completá con el número o la palabra que falta.",
    subject: "Matemática",
    type: "FILL_BLANKS",
    items: [
      { content: { text: "1/2 es equivalente a {{b1}}/4.", blanks: [{ id: "b1" }], requireAccents: false }, correct: { answers: { b1: ["2", "dos"] } }, maxPoints: 5, explanation: "Si multiplicás numerador y denominador por 2, obtenés 2/4." },
      { content: { text: "Dos fracciones que representan la misma cantidad se llaman {{b1}}.", blanks: [{ id: "b1" }], wordBank: ["equivalentes", "impropias", "mixtas"], requireAccents: false }, correct: { answers: { b1: ["equivalentes"] } }, maxPoints: 5, explanation: "Las fracciones equivalentes representan la misma parte del entero." },
    ],
  },
  {
    title: "Los mamíferos",
    instructions: "Leé el texto y tachá las frases que no corresponden.",
    subject: "Ciencias Naturales",
    type: "STRIKE_OUT",
    items: [
      {
        content: {
          topicText: "Los mamíferos son animales vertebrados. Tienen pelo en el cuerpo y las crías se alimentan con leche. Respiran por pulmones.",
          phrases: [{ id: "p1", text: "Tienen pelo en el cuerpo" }, { id: "p2", text: "Ponen huevos con cáscara dura" }, { id: "p3", text: "Las crías toman leche" }, { id: "p4", text: "Respiran por branquias" }],
        },
        correct: { strikeIds: ["p2", "p4"] },
        maxPoints: 10,
        explanation: "Los mamíferos respiran por pulmones y la mayoría no pone huevos.",
      },
    ],
  },
];

async function main() {
  await ensureBucket();
  console.log(`[seed] Bucket "${env.storage.bucket}" listo`);

  if (await prisma.schoolSettings.findUnique({ where: { id: 1 } })) {
    console.log("[seed] La escuela ya existe; no se cargan datos de ejemplo.");
    return;
  }

  // Validar las tareas de ejemplo contra los esquemas antes de cargarlas
  for (const t of templates) {
    for (const item of t.items) {
      taskTypeSchemas[t.type].content.parse(item.content);
      taskTypeSchemas[t.type].correct.parse(item.correct);
    }
  }

  await prisma.$transaction(async (tx) => {
    const cycle = await tx.schoolCycle.create({ data: { year: 2026, startsOn: new Date("2026-03-02"), endsOn: new Date("2026-12-18") } });
    await tx.schoolSettings.create({ data: { id: 1, name: env.schoolName, activeCycleId: cycle.id } });
    const course = await tx.course.create({ data: { cycleId: cycle.id, name: "4° B" } });

    const subjectData = [
      { name: "Matemática", area: "Exactas", color: "#3346C8" },
      { name: "Prácticas del Lenguaje", area: "Lengua", color: "#A96E12" },
      { name: "Ciencias Naturales", area: "Ciencias", color: "#1D8656" },
      { name: "Ciencias Sociales", area: "Ciencias", color: "#C03D37" },
      { name: "Inglés", area: "Lenguas extranjeras", color: "#5B6480" },
    ];
    const subjects = Object.fromEntries(
      await Promise.all(subjectData.map(async (s) => [s.name, await tx.subject.create({ data: s })] as const)),
    );

    const privacy = await tx.legalDocument.create({ data: { type: "PRIVACY_POLICY", version: "1.0", content: "Borrador: ver 'Fertelligence · Documentos legales y de consentimiento'.", effectiveFrom: new Date("2026-10-21") } });
    await tx.legalDocument.create({ data: { type: "TERMS", version: "1.0", content: "Borrador: ver 'Fertelligence · Documentos legales y de consentimiento'.", effectiveFrom: new Date("2026-10-21") } });

    const admin = await tx.user.create({ data: { email: "admin@escuela.test", firstName: "Graciela", lastName: "Paz", role: "ADMIN" } });

    const marcela = await tx.user.create({ data: { email: "mlopez@escuela.test", firstName: "Marcela", lastName: "López", role: "TEACHER" } });
    const ana = await tx.user.create({ data: { email: "aferreyra@escuela.test", firstName: "Ana", lastName: "Ferreyra", role: "TEACHER" } });
    await tx.teacherSubject.createMany({
      data: [
        { teacherId: marcela.id, subjectId: subjects["Ciencias Naturales"]!.id },
        { teacherId: marcela.id, subjectId: subjects["Matemática"]!.id },
        { teacherId: ana.id, subjectId: subjects["Prácticas del Lenguaje"]!.id },
      ],
    });

    const studentData = [
      ["tomas.ramirez@escuela.test", "Tomás", "Ramírez", "Carla Ramírez"],
      ["lucia.pereyra@escuela.test", "Lucía", "Pereyra", "Jorge Pereyra"],
      ["bruno.medina@escuela.test", "Bruno", "Medina", "Silvia Medina"],
      ["valentina.gomez@escuela.test", "Valentina", "Gómez", "Andrea Gómez"],
      ["joaquin.benitez@escuela.test", "Joaquín", "Benítez", "Raúl Benítez"],
    ] as const;

    const students = [];
    for (const [email, firstName, lastName, family] of studentData) {
      const student = await tx.user.create({
        data: {
          email, firstName, lastName, role: "STUDENT",
          studentProfile: { create: { courseId: course.id, familyContactName: family, familyContactEmail: `familia.${email}` } },
        },
      });
      await tx.consent.create({
        data: {
          studentId: student.id, legalDocumentId: privacy.id, method: "PAPER", status: "GRANTED",
          grantorName: family, grantorRelationship: "Madre, padre o tutor", decidedAt: new Date(), recordedById: admin.id,
        },
      });
      students.push(student);
    }

    // Cada alumno: Ciencias Naturales y Matemática con Marcela, Prácticas del Lenguaje con Ana
    const assignments = new Map<string, string>(); // `${studentId}:${subject}` -> assignmentId
    for (const student of students) {
      for (const [subject, teacher] of [["Ciencias Naturales", marcela], ["Matemática", marcela], ["Prácticas del Lenguaje", ana]] as const) {
        const a = await tx.assignment.create({ data: { studentId: student.id, subjectId: subjects[subject]!.id, teacherId: teacher.id, cycleId: cycle.id } });
        assignments.set(`${student.id}:${subject}`, a.id);
      }
    }

    for (const t of templates) {
      const template = await tx.taskTemplate.create({
        data: {
          title: t.title, instructions: t.instructions, subjectId: subjects[t.subject]!.id, type: t.type,
          settings: { redoScope: "INCORRECT_ONLY", shuffle: true, ...t.settings }, createdById: marcela.id,
          items: {
            create: t.items.map((item, position) => ({
              position, content: item.content as Prisma.InputJsonValue, correctAnswer: item.correct as Prisma.InputJsonValue,
              maxPoints: item.maxPoints, explanation: item.explanation,
            })),
          },
        },
      });
      for (const student of students) {
        await tx.task.create({
          data: {
            templateId: template.id, assignmentId: assignments.get(`${student.id}:${t.subject}`)!,
            status: "NEW", startsAt: days(-1), dueAt: days(4), publishedAt: days(-1),
          },
        });
      }
    }

    await tx.auditLog.create({ data: { action: "seed", entity: "school", after: { students: students.length, templates: templates.length } } });
  });

  console.log("[seed] Escuela de prueba creada: 1 administrador, 2 docentes, 5 alumnos, 5 tareas por alumno.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
