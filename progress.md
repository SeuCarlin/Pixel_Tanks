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
