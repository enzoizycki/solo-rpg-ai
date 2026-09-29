"use client";

import { useState } from "react";
import UploadStep from "@/components/UploadStep";
import PlayStep from "@/components/PlayStep";
import type { GameInfo } from "@/lib/types";

export default function Home() {
  const [game, setGame] = useState<GameInfo | null>(null);

  if (!game) return <UploadStep onCreated={setGame} />;
  return <PlayStep game={game} />;
}
