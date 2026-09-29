export type MasterProfile = {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  systemStyle: string;
};

export const MASTER_PROFILES: MasterProfile[] = [
  {
    id: "immersive",
    name: "Imersivo",
    emoji: "🌌",
    tagline: "Atmosfera densa e sensorial",
    description:
      "Descrições ricas em detalhes sensoriais, foco em atmosfera, tensão e emoção. Mergulha você no mundo.",
    systemStyle:
      "Adote um estilo IMERSIVO: descreva cenas com detalhes sensoriais vívidos (sons, cheiros, luz, temperatura, texturas), construa atmosfera e tensão emocional. Use uma prosa evocativa e cinematográfica. Dê tempo para o jogador sentir o ambiente antes de avançar a ação.",
  },
  {
    id: "narrative",
    name: "Narrativo",
    emoji: "📖",
    tagline: "História acima de tudo",
    description:
      "Prioriza enredo, personagens memoráveis e reviravoltas. Regras servem à história, não o contrário.",
    systemStyle:
      "Adote um estilo NARRATIVO: priorize enredo, arcos de personagem, reviravoltas e escolhas dramáticas. Trate as regras como ferramentas a serviço da história. Crie NPCs memoráveis com motivações claras e ganchos de trama constantes.",
  },
  {
    id: "tactical",
    name: "Tático",
    emoji: "⚔️",
    tagline: "Desafio e estratégia",
    description:
      "Combate detalhado, decisões táticas relevantes e aplicação rigorosa das regras do sistema.",
    systemStyle:
      "Adote um estilo TÁTICO: aplique as regras do sistema com rigor, descreva posicionamento e opções táticas em combate, apresente desafios que exijam estratégia. Deixe claras as consequências mecânicas das escolhas e peça rolagens de dados quando as regras exigirem.",
  },
  {
    id: "balanced",
    name: "Equilibrado",
    emoji: "🎲",
    tagline: "O melhor dos mundos",
    description:
      "Mistura boa narrativa, imersão e uso justo das regras. Ideal para a maioria das aventuras.",
    systemStyle:
      "Adote um estilo EQUILIBRADO: combine boa narrativa, descrições envolventes e uso justo das regras. Mantenha o ritmo dinâmico, alternando entre exploração, interpretação e ação.",
  },
  {
    id: "grim",
    name: "Sombrio",
    emoji: "🕯️",
    tagline: "Perigoso e implacável",
    description:
      "Tom dark, escolhas com peso, mundo hostil onde cada decisão importa e a morte é real.",
    systemStyle:
      "Adote um estilo SOMBRIO (dark/grimdark): mundo hostil e perigoso, consequências pesadas, moralidade cinzenta, atmosfera opressiva. As ameaças são reais e a sobrevivência é uma conquista. Não poupe o jogador de dilemas difíceis.",
  },
  {
    id: "lighthearted",
    name: "Descontraído",
    emoji: "✨",
    tagline: "Diversão e aventura leve",
    description:
      "Tom leve e bem-humorado, aventura acessível, foco na diversão e em momentos memoráveis.",
    systemStyle:
      "Adote um estilo DESCONTRAÍDO: tom leve, bem-humorado quando apropriado, aventura acessível e divertida. Recompense a criatividade do jogador e mantenha um clima positivo, sem perder a coerência do mundo.",
  },
];

export function getProfile(id: string): MasterProfile {
  return MASTER_PROFILES.find((p) => p.id === id) ?? MASTER_PROFILES[3];
}
