Original prompt: crie esse jogo de acordo com o plano; analise o plano e continue implementando o máximo possível dos 12 blocos do TankDots Wars.

## Estado em 2026-10-17

- O plano de implementação está em `docs/IMPLEMENTATION_PLAN.md`; o primeiro incremento e parte do segundo já foram entregues.
- Incremento atual: impactos de estruturas pesadas em estruturas vizinhas, efeitos visuais por material e testes de regressão.
- A skill `develop-web-game` foi instalada a partir de um commit anterior à sua remoção do ramo principal de `openai/skills`.
- O teste de queda em cadeia confirma fratura da estrutura vizinha, preservação da distante e ausência de dano repetido. A suíte completa passou (74 testes).
- O cliente agora expõe `render_game_to_text` para inspeção de partida; efeitos de queda/choque são disparados na chegada, com partículas por material.
- Smoke de navegador: sala com bot criada, preparação concluída, gameplay capturado, tiro do jogador avançou o turno 2 → 3; nenhum erro de página. A captura específica de uma queda em cadeia ainda fica pendente de cenário reproduzível via navegador (a regra foi coberta por teste de servidor).

## Próximos passos

- Concluir a animação de queda e verificar o estado jogável com o cliente Playwright da skill.
- Depois: prévia dos movimentos especiais, evolução de classes, revisão visual dos eventos por bioma e QA mobile horizontal.
- O cliente Playwright da skill captura apenas o canvas; para conferir HUD e sobreposições, também foi feita uma captura da página inteira num fluxo real de partida.
