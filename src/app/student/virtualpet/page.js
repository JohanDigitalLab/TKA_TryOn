import VirtualPetRoom from "@/components/student/virtualpet/VirtualPetRoom";
import GameHeader from "@/components/student/game-header";

export const metadata = {
  title: "Sahabat Virtual | TKA TryOn",
  description: "Rawat sahabat virtual dan tumbuh bersama dalam perjalanan belajar.",
};

export default function VirtualPetPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <GameHeader />
      <div className="flex-1">
        <VirtualPetRoom />
      </div>
    </div>
  );
}
