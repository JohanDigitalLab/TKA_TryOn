import BossFightArena from "@/components/student/fightboss/BossFightArena";
import GameHeader from "@/components/student/game-header";

export const metadata = {
  title: "Boss Fight | TKA TryOn",
  description: "Latihan soal dengan pertarungan Boss Fight.",
};

export default function FightBossPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <GameHeader />
      <div className="flex-1">
        <BossFightArena />
      </div>
    </div>
  );
}
