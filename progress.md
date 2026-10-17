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

## Incremento 8 — concluído

- Regressão de áudio desktop: o botão de teste `SOM ON` desligava o áudio ao ser clicado. Agora reproduz sempre uma amostra sem alternar o estado; o botão de mute continua separado. Teste automatizado cobre dois testes consecutivos.
- O terreno era liberado ao primeiro impacto de uma salva. A sincronização visual agora aguarda todos os projéteis da salva concluírem a trajetória antes de revelar alterações do solo.
- Carga Sísmica agora deixa o solo intacto até o marcador vermelho completar 2 s; só então detona centro e ondas laterais. Mega Canhão só libera após 300 pontos de destruição, fixa um marcador por 3 s e desce como feixe azul com céu escurecido, clarão, tremor e partículas.
- Fragmentária ganhou cápsula violeta de voo mais lento e segunda ativação por botão, toque no cenário ou Espaço; três mísseis caem do ponto escolhido. O botão permanece visível e clicável durante o foco de câmera. A Ativação Vertical também pode usar o botão.
- O Atacante não recebe mais munição por turno. Corrigido um `else` vinculado ao laço errado que descartava certos powerups coletados.
- Artes pixel art avulsas v2 para Fragmentária, Carga Sísmica e Mega Canhão, preservando moldura, nome, descrição e dados em HTML. Prompts e aplicações registrados em `docs/ART_DIRECTION.md`.
- Playwright percorreu biblioteca, seleção das novas cartas, áudio ativado e segunda ativação real da Fragmentária, sem erro de página. Após tornar o botão clicável durante o foco, o servidor confirmou três mísseis. Testes de regra cobrem aviso sísmico, carga do Mega Canhão e ausência de munição extra no Atacante.
- A Biblioteca voltou a ser acessível no lobby mobile horizontal (o cabeçalho estava oculto), com cartas compactadas para leitura no painel rolável; miniaturas novas medem 69 × 69 px em 844 × 390.
- Ainda depende de teste auditivo em desktop físico e revisão em iPhone/Android reais; o navegador automatizado não verifica saída de alto-falante.

## Ajuste do Atacante e Mega Canhão — 2026-10-17

- Tanque eliminado: 200 pontos de destruição; o Atacante recebe bônus passivo de 50 por eliminação (250 no total).
- Mega Canhão exclusivo do Atacante, removido da escolha inicial e da lista de powerups coletáveis. Ao acumular 300 pontos de destruição, ganha uma carga e a carta aparece automaticamente no arsenal, com aviso central de poder de classe; após disparar, precisa carregar novamente.
- Descrição da classe, carta, tutorial e dica de pontuação foram alinhados à regra. O servidor rejeita a escolha da carta inicial e o disparo por outra classe.
- Suíte completa: 97/97 aprovada. Skill Playwright: captura do canvas inicial sem erros; QA de navegador percorreu classe Atacante, arsenal sem Mega Canhão, partida e disparo. Capturas em `output/web-game/attacker-mega/`, sem erros de página.
- TODO: validar o timing do card de desbloqueio durante uma partida longa no navegador e revisar áudio/vibração em aparelho físico.

## Tutorial, áudio e controles mobile — 2026-10-17

- Diagnóstico: o aviso de cópia atual fica dentro do canvas da partida e não aparece no lobby. No iPhone, a sessão Web Audio padrão pode ser silenciada pela chave de silencioso apesar de `AudioContext.state === 'running'`.
- Primeira mudança: solicitar `navigator.audioSession.type = 'playback'` em iPhone/iPad antes de criar/resumir o contexto, também ao retornar à página. Teste unitário cobre ordem e restauração (7/7 na suíte de áudio). Smoke da skill Playwright capturado; saída física ainda não verificável neste ambiente.
- Tutorial em 21 etapas cobre criação e entrada em salas, bots, modos, classes, arsenal, powerups, controles, eventos e fim de partida. O aviso de cópia agora é global e aparece no lobby; o código só é anunciado como copiado após sucesso da API.
- Entrada no site apresenta diálogo para ativar som por gesto do usuário ou continuar sem som; no iPhone a sessão de áudio é configurada para `playback` quando a API existe. Diálogos de som e tutorial foram compactados para mobile horizontal.
- Alavanca mobile removida. Arrasto direto no campo define lado, ângulo e força; leitura compacta substitui a alavanca. A câmera enquadra tanque e prévia de impacto durante o gesto, usando câmera congelada para interpretar o arrasto sem realimentação.
- Seleção de classe, 16 cartas disponíveis de arsenal e três recompensas de rodada cabem inteiras em 844×390; arsenal também verificado em 667×375. Cartas compactas mantêm a arte, e um painel exibe a descrição completa da carta tocada.
- Playwright verificou convite de áudio, tutorial acessível, cópia real para clipboard, HUD sem alavanca, mira por arrasto, câmera e menus de cartas. Sem erros de página. `node --test`: 98/98 aprovada. Saída de áudio física ainda precisa ser conferida no iPhone real.

## Compatibilidade de áudio mobile — concluída em código

- Relato em aparelhos reais: Chrome no iPhone e Android continuam sem áudio; o botão de ativação não resolve. A versão publicada já contém `audioPrompt` e `requestPlaybackSession`, então não é apenas ausência do último deploy.
- `AudioContext.state === 'running'` não comprova saída audível. Agora há saída alternativa nativa com `<audio>` e arquivos WAV para dispositivos touch, iniciada sincronicamente pelo toque; o botão só confirma quando `play()` aceita iniciar. Web Audio permanece no desktop.
- O primeiro teste com URLs `blob:` passou no Chromium Android, mas falhou no WebKit com `NotSupportedError`. Arquivos `.wav` reais servidos por HTTP resolveram o teste no WebKit. Testados convite e botão de teste com navegador Android e WebKit emulados: ambos passam sem erro de página; 100/100 testes automatizados passam.
- Ainda é necessária confirmação auditiva nos aparelhos físicos do usuário: a automação verifica que o navegador iniciou a mídia, mas não consegue ouvir o alto-falante nem verificar volume/chave de silêncio/Bluetooth do dispositivo.

## Tema original de marcha para o menu

- Substituído o loop simples por composição instrumental original de ~16,55 s a 116 BPM: pulso de bumbo/caixa, baixo marcado, resposta de metais e acordes dedilhados sincopados com clima de MPB brasileira. Não usa trecho, riff ou melodia da gravação de referência.
- Desktop e mobile compartilham a mesma progressão e frase musical; mobile recebe WAV pré-gerado. Testes verificam duração, nível audível sem clipping e início de `music.wav` em Chromium Android e WebKit iPhone emulados.

## Preferência do usuário: retorno da música anterior

- O usuário preferiu o loop anterior à marcha. Restaurar exatamente o tema de 4 s no desktop e em `music.wav` para mobile; preservar toda a infraestrutura de áudio mobile e os demais efeitos.
- Restauração concluída: o WAV regenerado tem o mesmo hash Git da versão anterior (`61d043c`). Teste mobile emulado Android/WebKit iniciou `music.wav` sem erros; 101/101 testes passaram.
