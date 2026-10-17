Original prompt: crie esse jogo de acordo com o plano; analise o plano e continue implementando o máximo possível dos 12 blocos do TankDots Wars.

## Estado em 2026-10-17

- O plano de implementação está em `docs/IMPLEMENTATION_PLAN.md`; o primeiro incremento e parte do segundo já foram entregues.
- Incremento atual: impactos de estruturas pesadas em estruturas vizinhas, efeitos visuais por material e testes de regressão.
- A skill `develop-web-game` foi instalada a partir de um commit anterior à sua remoção do ramo principal de `openai/skills`.
- O teste de queda em cadeia confirma fratura da estrutura vizinha, preservação da distante e ausência de dano repetido. A suíte completa passou (74 testes).
- O cliente agora expõe `render_game_to_text` para inspeção de partida; efeitos de queda/choque são disparados na chegada, com partículas por material.
- Smoke de navegador: sala com bot criada, preparação concluída, gameplay capturado, tiro do jogador avançou o turno 2 → 3; nenhum erro de página. A captura específica de uma queda em cadeia ainda fica pendente de cenário reproduzível via navegador (a regra foi coberta por teste de servidor).

## Próximos passos

- Reproduzir uma queda em cadeia no navegador para capturar e inspecionar o instante exato do impacto; a regra física já tem teste de servidor.
- Depois: evolução de classes, revisão visual dos eventos por bioma e QA em aparelhos mobile reais.
- O cliente Playwright da skill captura apenas o canvas; para conferir HUD e sobreposições, também foi feita uma captura da página inteira num fluxo real de partida.

## Incremento 4

- A prévia de movimentação passou a mostrar Arrancada, Escavadeira, Investida Blindada e Aranha, inclusive as paredes que podem ser escavadas ou rompidas.
- Distâncias, cavar e atravessar até três paredes foram centralizados em `shared/movement.js`, usado por cliente e servidor.
- Testes com semente fixa comparam o destino e a alteração do terreno nos quatro modos; um teste adicional cobre o destino após um lançador do cenário. A suíte tem 76 testes.
- O teste Playwright em mobile horizontal revelou que lançadores alteravam o destino após a prévia da Aranha. A regra do lançador foi compartilhada e a prévia agora marca o ponto final como `LANÇADOR`, com o pouso intermediário indicado pela linha.
- O clique no botão de arsenal do lobby gerava um erro JavaScript por receber o evento como parâmetro de tempo; corrigido e conferido no navegador sem erros.
- Smoke mobile horizontal (844×390): o documento não exigiu scroll; a prévia Aranha indicou X=1668 e o servidor confirmou o mesmo destino. Também foi conferida a Investida no desktop (previsão X=1655, resultado X=1655).
- TODO: evolução de classes, revisão visual dos eventos em todos os biomas e QA real em iPhone/Android.

## Incremento 5

- Classes habilitadas agora recebem escolhas permanentes nas rodadas de 1/3 e 2/3 do limite. Fortificar dá +30 de vida máxima e cura imediata; Sobrecarga acrescenta +6 de dano por acerto direto ou explosivo contra inimigos. Escolhas podem ser repetidas; bots escolhem automaticamente.
- Modal central, indicador de nível no placar, biblioteca pesquisável e tutorial explicam os dois caminhos. Avisos de coleta aguardam o fim da escolha para não cobrir as cartas.
- Testes cobrem marcos, escolha válida/inválida, bônus cumulativo, dano direto e explosivo sem afetar autolesão ou eventos, bots e salas sem classes. A suíte passou com 80 testes.
- Playwright percorreu uma partida real de dois jogadores até a rodada 4, em desktop e mobile horizontal (844×390). O modal ficou visível sem card de coleta sobreposto, sem scroll e sem erros de página; a escolha Fortificar foi confirmada pelo servidor (+30 HP e +30 máximo).
- TODO: revisão visual dos eventos em todos os biomas e QA real em iPhone/Android. Reavaliar estatisticamente as duas evoluções após partidas completas.

## Incremento 6 — fechamento dos modos e auditoria visual

- Sobrevivência: curva de maré de lava compartilhada, subida a cada rodada, previsão no HUD, inundação visível e eliminação/vitória imediata ao tocar na lava. Testes cobrem a curva, encerramento e isolamento do modo comum.
- Domínio por Equipes: atribuição de equipes, ponto compartilhado por ocupação sem rivais, contestação, vitória por quatro pontos ou eliminação, placar na colina/HUD e bot orientado ao objetivo. Fogo amigo desativado. Dois testes novos de regra.
- Alertas de evento e maré não cobrem escolha de recompensa, evolução de classe ou card de coleta. A coleta é adiada até o modal prioritário fechar.
- Auditoria visual com sementes fixas de aviso e impacto em seis biomas e do bombardeio; conferência separada do helicóptero e flash do raio. O raio agora pisca repetidamente durante o impacto.
- Navegador real: fluxo de Sobrevivência com dois jogadores até a rodada 6; partida de Domínio por Equipes com humano e três bots; capturas desktop e mobile horizontal (844×390), sem rolagem nem erros de página.
- `npm test`: 85/85 aprovados. Checklist restante de aparelhos físicos em `docs/QA_HANDOFF.md`.

## Incremento 7 — céu, mira, áudio e preparação de partida

- Céu: removidas as faixas horizontais de paletas conflitantes; cada bioma agora preenche todo o canvas com uma cor coerente ao ciclo dia/noite. Captura inicial da skill Playwright conferida.
- Helicóptero: sprite espelhado conforme direção real do voo (o desenho-base aponta para a esquerda).
- Assistente de mira no mobile calcula ângulo e força contra tanques visíveis levando vento, terreno e plataformas em conta. Permite alternar alvos; ajustes manuais soltam a sugestão e travar mira bloqueia o assistente. Testes balísticos usam a simulação do servidor.
- Áudio não reexecuta sons antigos após liberar o contexto; tiro sem impacto não toca explosão, ações rejeitadas não tocam som de movimento e clique de seleção de carta não usa efeito de ativação. Sons de movimento e pulo acompanham confirmações do servidor.
- Preparação separada: 10 segundos para classe, 10 segundos para arsenal e sorteio de início em seguida. No lobby há duas telas; classes desativadas pulam a primeira. Servidor recebe escolhas independentes e não permite trocar a classe durante a fase de arsenal.
- Todos os tanques têm etiqueta da classe junto ao marcador de posição/vida, inclusive fora da câmera. A classe também permanece visível na faixa de vida do HUD horizontal.
- Playwright mobile 844×390 percorreu lobby, escolha de classe, arsenal, partida e assistência de mira sem erro de página. Capturas do céu, helicóptero nas duas direções e indicadores conferidas. Testes automatizados: 92/92.
- Ainda depende de iPhone/Android físicos: confirmar áudio, vibração e desempenho real sob carga. Checklist em `docs/QA_HANDOFF.md`.
