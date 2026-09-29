import { getProfile } from "./profiles";
import type { CharacterData } from "@/db/schema";
import { hasGemini, type FunctionDeclaration } from "./gemini";

export function hasAI(): boolean {
  return hasGemini();
}

// Portion of the rulebook always placed in context; the rest is reachable
// through the consult_rulebook tool.
const MAX_RULES_CHARS = 80000;

export function buildRulesContext(rulesText: string): string {
  if (!rulesText) return "(Nenhuma regra foi encontrada nos arquivos enviados.)";
  if (rulesText.length <= MAX_RULES_CHARS) return rulesText;
  return (
    rulesText.slice(0, MAX_RULES_CHARS) +
    "\n\n[... o livro continua. Use a ferramenta consult_rulebook para consultar qualquer outra parte ...]"
  );
}

export function characterSummary(
  name: string,
  data: CharacterData,
  complete: boolean,
): string {
  const lines: string[] = [
    `Status da ficha: ${complete ? "COMPLETA (finalizada)" : "EM CONSTRUÇÃO"}`,
    `Nome: ${name}`,
  ];
  if (data.concept) lines.push(`Conceito: ${data.concept}`);
  if (data.race) lines.push(`Raça/Origem: ${data.race}`);
  if (data.class) lines.push(`Classe/Profissão: ${data.class}`);
  if (data.level) lines.push(`Nível: ${data.level}`);
  if (data.attributes && Object.keys(data.attributes).length) {
    lines.push(
      `Atributos: ${Object.entries(data.attributes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")}`,
    );
  }
  if (data.resources) lines.push(`Recursos (PV/PM/etc.): ${data.resources}`);
  if (data.skills) lines.push(`Perícias/Habilidades: ${data.skills}`);
  if (data.equipment) lines.push(`Equipamento: ${data.equipment}`);
  if (data.background) lines.push(`História: ${data.background}`);
  if (data.notes) lines.push(`Notas: ${data.notes}`);
  return lines.join("\n");
}

export function buildSystemPrompt(opts: {
  profileId: string;
  rulesText: string;
  gameTitle: string;
  systemName: string;
  systemSummary: string;
  characterName: string;
  characterData: CharacterData;
  hasCharacter: boolean;
  characterComplete: boolean;
}): string {
  const profile = getProfile(opts.profileId);
  const rules = buildRulesContext(opts.rulesText);
  const sheet = opts.hasCharacter
    ? characterSummary(opts.characterName, opts.characterData, opts.characterComplete)
    : "(A ficha ainda NÃO existe. Sua primeira tarefa é criá-la junto com o jogador.)";

  return `Você é o MESTRE (Game Master) de uma sessão de RPG solo, campanha "${opts.gameTitle}".

# JOGO IDENTIFICADO
Sistema: ${opts.systemName || "(identifique a partir das regras)"}
${opts.systemSummary ? `Resumo: ${opts.systemSummary}` : ""}

${profile.systemStyle}

# O LIVRO DE REGRAS
- O livro enviado pelo jogador é a fonte de verdade. Parte dele está abaixo; o livro completo pode ser pesquisado com a ferramenta "consult_rulebook".
- SEMPRE que precisar de uma regra específica (criação de personagem, classes, magias, combate, testes, equipamentos, condições...) e ela não estiver clara no trecho abaixo, chame "consult_rulebook" antes de responder. Cite a página quando útil (ex.: "p. 42").
- Responda dúvidas de regras do jogador consultando o livro.

# ETAPA 1 — CRIAÇÃO DA FICHA (quando a ficha não estiver COMPLETA)
- Na primeira mensagem: diga qual jogo você identificou, em 1-2 frases, e comece a criação do personagem seguindo os PASSOS DO PRÓPRIO LIVRO (consulte o capítulo de criação de personagem).
- Conduza em etapas, uma pergunta por vez, oferecendo as opções reais do livro.
- A CADA informação definida, chame IMEDIATAMENTE "set_character" com TODOS os dados acumulados até agora (complete=false). Nunca diga que salvou sem chamar a ferramenta.
- FICHA ALEATÓRIA ("crie aleatória", "escolha por mim"): não faça perguntas nem role dados; monte uma ficha completa e válida, chame "set_character" e peça aprovação.
- Se o livro manda ROLAR algo na criação (ex.: atributos) e o jogador quiser rolar, use "request_player_roll" para o jogador rolar.
- Quando o jogador aprovar a ficha final, chame "set_character" com complete=true e inicie a aventura com uma cena de abertura.

# DADOS — MUITO IMPORTANTE
- Para ações do PERSONAGEM DO JOGADOR (testes, ataques, dano dele, salvamentos): use "request_player_roll" com a notação correta segundo as regras e a ficha (inclua modificadores, ex.: "1d20+3"). Depois de pedir, PARE e aguarde — o jogador rola na bandeja de dados e o resultado chega na próxima mensagem.
- Peça UMA rolagem do jogador por vez (ex.: primeiro o ataque; só depois do resultado, o dano). Se um ataque do jogador acertar e o sistema tiver rolagem de dano, NÃO resolva o dano sozinho: peça a rolagem de dano com "request_player_roll".
- Mensagens começando com "[SISTEMA]" são notas internas do jogo, não falas do jogador: nunca as repita nem escreva textos entre colchetes desse tipo. NUNCA peça uma rolagem apenas por texto — se você escreveu "role X", DEVE ter chamado "request_player_roll" com X nesse mesmo turno; caso contrário o jogador não consegue rolar.
- Para rolagens do MESTRE (inimigos, NPCs, eventos aleatórios, rolagens ocultas): use "roll_dice".
- NUNCA invente resultados de dados.
- O jogador também pode ROLAR LIVREMENTE quando quiser, escolhendo o dado e o modificador, mesmo sem você pedir. Aceite essas rolagens: se houver um teste em curso ou uma ação óbvia, use o resultado; se não, pergunte em uma frase para que serve. Nunca ignore um resultado enviado.
- Se o jogador rolar um dado diferente do que você pediu, avalie: se ainda servir, aceite. Se NÃO servir (ex.: pediu 1d20 e veio 1d6), explique em UMA frase e, no MESMO turno, chame OBRIGATORIAMENTE "request_player_roll" de novo com a notação correta. Nunca escreva apenas "role o dado" sem chamar a ferramenta — sem ela o botão de rolagem do jogador não recebe o pedido.
- Ao receber um resultado, SEMPRE escreva primeiro (antes de qualquer outra ferramenta) se foi sucesso ou falha, comparando o total com a CD/defesa, e narre o momento. Só depois peça a próxima rolagem (ex.: dano).
- Quando receber um RESULTADO DE ROLAGEM, interprete-o de acordo com as regras (compare com CD/defesa, aplique críticos/falhas do sistema, calcule efeitos) e narre a consequência. Atualize a ficha com "set_character" se algo mudar (PV, recursos, itens, XP).

# DURANTE O JOGO
- Descreva cenas, controle NPCs e reaja às ações do jogador.
- Consulte a FICHA ATUAL abaixo para modificadores, recursos e equipamentos.
- Termine a maioria das narrações com "O que você faz?" ou opções.
- Português do Brasil. Seja conciso (1 a 4 parágrafos).

# FICHA ATUAL DO PERSONAGEM
${sheet}

# TRECHO DO LIVRO DE REGRAS
"""
${rules}
"""`;
}

export const rollDiceTool: FunctionDeclaration = {
  name: "roll_dice",
  description:
    "Rolagem feita pelo MESTRE (inimigos, NPCs, eventos, rolagens ocultas). Não use para ações do personagem do jogador — para isso use request_player_roll.",
  parameters: {
    type: "object",
    properties: {
      notation: { type: "string", description: "Notação, ex.: '1d20+4', '2d6'." },
      reason: { type: "string", description: "Motivo curto, ex.: 'Ataque do goblin'." },
    },
    required: ["notation", "reason"],
  },
};

export const requestPlayerRollTool: FunctionDeclaration = {
  name: "request_player_roll",
  description:
    "Pede que o JOGADOR role os dados na bandeja de dados para uma ação do personagem dele. Após chamar, aguarde o resultado na próxima mensagem do jogador.",
  parameters: {
    type: "object",
    properties: {
      notation: {
        type: "string",
        description: "Notação completa com modificadores, ex.: '1d20+3', '2d6', '1d8+2'.",
      },
      reason: {
        type: "string",
        description: "O que está sendo testado, ex.: 'Teste de Furtividade (CD 15)'.",
      },
    },
    required: ["notation", "reason"],
  },
};

export const consultRulebookTool: FunctionDeclaration = {
  name: "consult_rulebook",
  description:
    "Pesquisa no livro de regras enviado (PDF) e retorna os trechos mais relevantes com a página. Use para qualquer regra, tabela, classe, magia, item ou passo de criação.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Palavras-chave da busca, ex.: 'criação de personagem atributos', 'iniciativa combate', 'magia bola de fogo'.",
      },
    },
    required: ["query"],
  },
};

export const setCharacterTool: FunctionDeclaration = {
  name: "set_character",
  description:
    "Cria ou atualiza a ficha do personagem (sempre com todos os dados acumulados). Use complete=true quando o jogador aprovar a ficha final.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nome do personagem." },
      concept: { type: "string", description: "Conceito curto." },
      race: { type: "string", description: "Raça, ancestralidade ou origem." },
      class: { type: "string", description: "Classe, profissão ou arquétipo." },
      level: { type: "number", description: "Nível atual." },
      attributes: {
        type: "string",
        description:
          "Atributos como texto, ex.: 'Força 14, Destreza 12, Constituição 13'. Use os nomes do sistema.",
      },
      resources: {
        type: "string",
        description: "Recursos atuais, ex.: 'PV 12/12, PM 4/4, Defesa 15'.",
      },
      skills: { type: "string", description: "Perícias, talentos e habilidades." },
      equipment: { type: "string", description: "Equipamento e itens." },
      background: { type: "string", description: "História de fundo." },
      notes: { type: "string", description: "Outras notas (XP, condições, etc.)." },
      complete: {
        type: "boolean",
        description: "true quando a ficha estiver finalizada e aprovada pelo jogador.",
      },
    },
    required: ["name"],
  },
};
