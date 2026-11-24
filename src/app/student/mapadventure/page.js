import MapAdventure from "@/components/student/mapadventure/MapAdventure";
import GameHeader from "@/components/student/game-header";

export const metadata = { title: "Petualangan Peta Materi | TKA TryOn", description: "Jelajahi peta materi, latihan, dan tantangan belajar." };

export default function MapAdventurePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <GameHeader />
      <div className="flex-1">
        <MapAdventure />
      </div>
    </div>
  );
}
