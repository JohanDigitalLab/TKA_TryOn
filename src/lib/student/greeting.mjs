// Use the device's local time, matching the clock visible to the learner.
export function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) return "Selamat Pagi";
  if (hour >= 11 && hour < 18) return "Selamat Siang";
  return "Selamat Malam";
}
