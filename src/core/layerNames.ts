const ANIMALS = [
  "Lobo",
  "Búho",
  "Zorro",
  "Corzo",
  "Nutria",
  "Gato",
  "Cuervo",
  "Foca",
  "Lince",
  "Marta",
  "Tejón",
  "Grulla",
  "Delfín",
  "Koala",
  "Panda",
  "Cobra",
  "Toro",
  "Cisne",
  "Rana",
  "Halcon",
] as const;

export function randomAnimalName(): string {
  return ANIMALS[Math.floor(Math.random() * ANIMALS.length)]!;
}
