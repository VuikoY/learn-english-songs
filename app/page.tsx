import PhraseMixGame from "@/components/game/PhraseMixGame";

export default function HomePage() {
  return (
    <main className="mx-auto mt-3 flex w-full max-w-3xl flex-col gap-3 px-4 pb-8 pt-2">
      <PhraseMixGame />
    </main>
  );
}
