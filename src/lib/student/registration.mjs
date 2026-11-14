import { localPath } from "../school/onboarding.mjs";

export const educationLevels = [
  { value: "sd", label: "SD / MI" },
  { value: "smp", label: "SMP / MTs" },
  { value: "sma", label: "SMA / MA / SMK" },
];

export function registrationContext(params) {
  const next = localPath(params.get("next"));
  const invited = new URL(next, "https://local.invalid").pathname === "/school/join";
  const requested = params.get("method");
  const method = invited ? "school" : ["independent", "school"].includes(requested) ? requested : null;
  const level = educationLevels.find(item => item.value === params.get("level")) || null;
  return { next, method, level };
}

export function studentRegistrationPath({ method, level } = {}) {
  const params = new URLSearchParams();
  if (["independent", "school"].includes(method)) params.set("method", method);
  if (educationLevels.some(item => item.value === level)) params.set("level", level);
  return `/register${params.size ? `?${params}` : ""}`;
}

export function registrationEducationLevel(context, value) {
  const level = context.level?.value || value;
  if (!educationLevels.some(item => item.value === level)) throw new Error("Pilih jenjang pendidikan siswa.");
  return level;
}
