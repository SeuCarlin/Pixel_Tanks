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

## Novo saguão, áudio e HUD — 2026-10-17

- Cada jogador humano escolhe classe (quando habilitada) e três cartas de arsenal no saguão, depois marca Pronto. Bots ficam prontos automaticamente. O servidor inicia a roleta de 10 segundos somente quando todos estiverem prontos; também permite cancelar Pronto enquanto a sala espera. Revanche retorna ao saguão e reinicia a confirmação.
- O saguão agora mostra classe, arsenal e status individual de cada comandante, resumo da própria preparação e contagem de prontos. Em 844×390, o layout horizontal não exige rolagem. O tutorial foi alinhado ao novo fluxo.
- O mobile usa WAVs renderizados pelo mesmo sintetizador do desktop, com variantes para armas e explosões. O som de impacto passa a acompanhar o quadro visual da colisão; a música não toca mais na tela inicial. A barra REGISTRO foi ocultada no mobile.
- O botão ATIRAR fica desabilitado fora do turno, enquanto animações bloqueiam o ataque e durante a roleta. Uma animação de faíscas aparece ao tocar para disparar. A tecla Espaço obedece à mesma regra.
- Suíte automatizada: 102/102 testes aprovados. Playwright: sala mobile com bot, dois jogadores humanos em desktop, seleção de classe/arsenal, Pronto, roleta, tiro e som nativo sem erros de página. Capturas em `output/web-game/lobby-*.png`.
- TODO: confirmar timbre, volume e latência em iPhone Chrome e Android físicos; navegadores emulados verificam reprodução e sequência, mas não conseguem ouvir os alto-falantes.

## Física, explosões e arsenal mobile — 2026-10-17

- A resolução de posição dos tanques agora valida toda a largura do casco contra o solo, inclusive no movimento previsto pelo cliente; tanques apoiados em plataformas também são afastados de paredes que cruzam seu casco. Isso impede que a lateral fique presa numa parede ou sob um barranco.
- O Mega Canhão produz um feixe vertical que atravessa plataformas e varre estruturas e solo por toda a coluna de impacto. Seu efeito visual foi ampliado; a bomba atômica ganhou cogumelo em blocos, coluna de fumaça e mais partículas.
- No HUD mobile, o arsenal vira uma faixa rolável com setas e slider quando as cartas excedem o espaço disponível. Arrastar a faixa revela cartas, e mover o slider seleciona a carta quando ela está habilitada. A faixa permanece ao lado dos powerups e fora da área de mira.
- Verificação: 105/105 testes automatizados passaram. Skill Playwright executada; Chromium Android e WebKit iPhone emulados completaram saguão, roleta, tiro e seleção do arsenal estendido sem erro de página nem rolagem externa. Capturas: `output/web-game/arsenal-carousel-mobile.png` e `output/web-game/explosion-visual.png`.
- TODO: validar áudio e gesto do slider nos aparelhos físicos; a automação verifica evento de seleção/rolagem e início da mídia, não qualidade sonora ou sensibilidade do toque real.

## Classes, estruturas e palco mobile — 2026-10-17

- Mega Canhão exclusivo do Atacante agora exige 1000 pontos de destruição por carga. Descrições de classe, carta, HUD e tutorial acompanham o novo limite.
- As outras sete classes receberam melhorias específicas: escudo também para o Blindado; maior alcance, dano e resistência do Bombardeiro; aura e disparo curativo mais fortes; mais influência e Para-raios recarregável do Meteorologista; Arrancada extra do Ninja; Tesla mais frequente e pane ampliada do Sabotador; suporte de munição a aliados e cura solo maior do Mochileiro.
- Depósitos de suprimentos dourados liberam dois powerups visíveis quando destruídos. Bobinas elétricas azuis causam dano e bloqueiam poderes próximos sem escavar o terreno; Sabotadores são imunes. Ambos têm colisão, degradação, pontuação, animações e física ao perder apoio. A geração os reserva antes das estruturas comuns para que realmente apareçam e evita spawns de tanques.
- No mobile, o canvas mantém a proporção física do palco ao variar a altura disponível. O botão ⛶ tenta tela cheia nativa e tem fallback compacto; o manifesto permite abrir o jogo como app horizontal sem barras do navegador em plataformas compatíveis. O tutorial explica o controle e as estruturas.
- Verificação: testes de regras e estruturas com dez sementes, Playwright Chromium/WebKit mobile 844×390 sem distorção, rolagem ou erros de página. Tela cheia nativa confirmada no Chromium; fallback compacto no WebKit emulado. Validação em aparelho real ainda recomendada para instalação pela Tela de Início e gestos do navegador.
- Gesto de pinça no palco mobile aproxima ou afasta o zoom com dois dedos. O primeiro toque não dispara poderes de ativação imediata até ser solto; ao iniciar uma pinça, a mira anterior é restaurada. A conversão da mira também usa a altura real do canvas redimensionado. Playwright com multitoque real no Chromium verificou zoom de 1,12 → 1,65 → 0,73 sem mudar a mira nem registrar erros.
- Suíte completa após as mudanças: 111/111 testes aprovados. O teste isolado de fogo amigo limpa estruturas geradas antes de nivelar o terreno artificialmente, para não confundir o impacto de objetos em queda com dano direto de aliados.

## Controles mobile e convites por link — 2026-10-17

- O mobile oferece mira por arrasto ou alavanca, e câmera em Foco Dinâmico ou Zoom Único, com preferências salvas no aparelho. No modo fixo, a pinça muda o zoom e dois dedos deslocam o mapa sem seguir disparos automaticamente.
- O arsenal começa sem carta selecionada a cada turno; o jogador toca explicitamente na carta antes de disparar. O botão ATIRAR indica esse estado.
- O saguão ganhou CONVIDAR AMIGOS: gera o endereço com `?room=CODIGO`, permite copiar e usa o compartilhamento nativo quando disponível. O convite abre a aba ENTRAR com código preenchido; em mobile horizontal, o formulário inteiro cabe sem rolagem. O código separado continua copiável.
- Verificação: 111/111 testes automatizados; Chromium e WebKit emulados testaram duas sessões entrando pelo convite, o controle mobile, o zoom e o estado inicial do arsenal sem erros de página. O cliente Playwright oficial gerou captura e `render_game_to_text`.

## Seleção inicial do arsenal — 2026-10-17

- A preparação mostrava OBUS, FRAG e PULO selecionados porque usava o arsenal padrão interno do servidor mesmo com `arsenalSelected: false`. A interface agora só marca cartas se o jogador já confirmou um arsenal; primeira abertura é 0/3, mas reabrir uma escolha confirmada preserva as três cartas.
- Playwright validou sala nova, seleção de três cartas, confirmação e reabertura em Chromium desktop, WebKit mobile e sala sem classes; todas sem erros de página. Capturas em `output/web-game/arsenal-*-empty.png` e `arsenal-*-reopened.png`.
- TODO: conferir a sensação do fluxo em aparelhos físicos; os navegadores emulados validam seleção e layout, mas não a ergonomia do toque real.

## Afinidade de classe e novas cartas de sobrevivência — 2026-10-17

- O sorteio de recompensas a cada terceira jogada usa a classe do tanque: quatro powerups afins a cada classe têm peso 3× em relação aos demais, sem duplicar cartas nem ignorar os tipos habilitados pela configuração da sala. A tela de recompensa identifica as cartas de sinergia.
- A nova carta Reciclagem Vital pode ser combinada com outros modificadores de disparo. Após a conclusão de todos os efeitos do tiro, cura 25% dos pontos de destruição causados, até 60 HP. A carta Vida Extra é consumida automaticamente antes da eliminação definitiva e reposiciona o tanque em terreno/plataforma segura, longe de outros tanques, estruturas, minas, fogo e lava, com 25% da vida máxima.
- Ambas receberam arte própria em pixel art, descrição e instruções de uso na biblioteca, na recompensa, na notificação de coleta e no inventário; respawn e cura ganharam partículas, indicação numérica e som.
- Verificação: 114/114 testes automatizados; smoke Playwright com dois jogadores, escolhas e inventário; biblioteca WebKit mobile 844×390 e cliente oficial Playwright sem erros. TODO: conferir sensibilidade visual e sonora em aparelhos físicos.

## Refinamento das artes e animação de respawn — 2026-10-17

- Substituídas as duas artes simples em SVG por ilustrações raster pixel art com os contornos, volumes e brilhos do atlas das cartas anteriores. A Vida Extra mostra um tanque com asas de anjo, cruz de cura e aura dourada; a Reciclagem Vital mostra um disparo convertendo destruição em energia verde de cura. As novas imagens são usadas na biblioteca, recompensa, coleta e HUD.
- A Vida Extra agora apresenta uma animação de 3 segundos: o tanque ressurge acima do ponto seguro, flutua até o chão sob aura amarela pulsante e deixa partículas verdes. A câmera acompanha o destino no modo dinâmico; o servidor segura o fim do tiro para completar destruição e respawn antes do próximo turno.
- Verificação: teste unitário do tempo configurado, teste de animação no Chromium verificando descida, partículas e pouso, e biblioteca mobile WebKit com ambas as artes. TODO: observar em partida real no aparelho físico a transição após tiros com muitas explosões atrasadas.

## Cogumelo da Mega Bomba — 2026-10-17

- O desenho do cogumelo foi reconstruído em etapas legíveis: clarão inicial, coluna incandescente que sobe, cúpula formada por lóbulos de blocos com sombras e bordas, onda de choque horizontal e escurecimento gradual da fumaça. As partículas antigas que criavam uma massa solta e desconexa foram substituídas por detritos, brasas e fumaça concentrados no impacto.
- A prévia automatizada registra três momentos da animação em `output/web-game/mega-bomb-mushroom-v2.png`; sem erros de página. Suíte completa: 114/114 testes aprovados. O cliente Playwright oficial foi executado após a mudança.

## Arte da Haste (Para-raios) — 2026-10-17

- Corrigido o índice do atlas do arsenal: o Mega Canhão usa imagem própria e não deve ocupar uma célula da imagem compartilhada. A Haste agora aponta para a última célula, que já contém sua arte pixel art.
- O mapeamento de cartas com imagem própria foi centralizado em `shared/card-art.js`, com teste de regressão que garante que todas as cartas do atlas cabem nele.
- Verificação: 115/115 testes; navegador confirmou a imagem da Haste na biblioteca em `output/web-game/haste-card-final.png`, sem erros de página.

## Bots, bases aéreas, queda e Ira de Zeus — 2026-10-17

- A escolha de 6–9 bots amplia automaticamente a capacidade da sala até 10 tanques, incluindo o anfitrião. O saguão e a partida foram conferidos no navegador com 9 bots (`10 / 10`).
- Cada bioma ganha plataformas aéreas fixas e destrutíveis, com estrutura treliçada visível. Parte delas aceita spawn seguro; outra é reservada para estruturas no alto. Um barril aéreo explode agora na sua altura real, sem deslocar a explosão para o solo.
- Ao perder o apoio ou cair num buraco, o tanque entra em queda física gradual em vez de teleportar até o chão. A descida mostra rastros; pousos altos geram impacto mais forte e partículas. Spawns e estruturas não compartilham a mesma base aérea.
- Ira de Zeus ganhou um raio principal luminoso com ramificações e onda elétrica durante 2 segundos. O turno aguarda esses 2 segundos após a trajetória da bala.
- Verificação: 118/118 testes automatizados; Playwright conferiu 9 bots, cenário aéreo e duração visual de Zeus em `output/web-game/sky-battle.png` e `output/web-game/zeus-2s.png`, sem erros de página. TODO: conferir sensação da queda e legibilidade do raio em celulares físicos.

## Caça, Fogos, vórtex e leitura do turno — 2026-10-17

- O Caça Voadora agora sobe mais de 350 blocos antes do mergulho, acelera em direção ao alvo e dispara um grito sintético de águia exatamente quando começa a perseguição. O som também foi renderizado como WAV para o caminho nativo de áudio mobile.
- Fogos de Artifício ganharam detonação no ar por toque, espaço ou botão ATIRAR/DETONAR. Os doze microfoguetes partem radialmente, inclusive para o alto, seguem trajetórias físicas e explodem ao colidir ou esgotar o voo. O turno espera a animação dos rastros.
- O raio de influência da Bomba de Propulsão aumentou de 230 para 410 blocos, com halo, anéis de acreção animados e partículas convergentes. A Ira de Zeus recebeu núcleo mais largo, escurecimento de tempestade, nuvens e flashes.
- O próprio turno agora ilumina o cartão do jogador com aviso persistente; o botão VOCÊ centraliza a câmera no tanque mesmo após zoom ou deslocamento.
- Verificação: 119/119 testes; cliente Playwright oficial e teste de partida real em Chromium confirmaram turno, botão de localização, detonação aérea e renderização sem erros. Capturas em `output/web-game/current-request/`.

## Tanques em três partes, crítico e Blindado exclusivo — 2026-10-17

- O sprite pixel-art agora separa base/esteiras, centro blindado e cabeça/torre, com esteiras animadas, canhão e suspensão. Blindado tem silhueta 22% maior, placas laterais, torre reforçada e área de acerto proporcional ao tamanho.
- Acerto direto do tiro PADRÃO: base 20–30 HP, centro 50 HP, cabeça 60–80 HP (crítico), antes das passivas e escudos. O local e o dano final aparecem sobre o alvo e no tutorial. Dano radial sem acerto direto continua usando a regra da explosão.
- Tiros e poderes ganharam halos em microblocos com cores específicas e ao menos 2 segundos de efeito após o impacto ou ativação. O servidor aguarda o fim do disparo e de seus efeitos antes de passar o turno; o tratamento inclui tiros atrasados, fragmentação não ativada e projéteis que saem do mapa.
- Verificação: testes de colisão por zona, Blindado, escudo e disparo real; cliente Playwright oficial e partida em Chromium sem erros de página. Capturas em `output/web-game/tank-redesign/`.

## Tesla, Haste e Mochileiro — 2026-10-17

- Tesla ganhou raio de 440 blocos e pode encadear até nove inimigos. Alvos atingidos ficam um turno em pane total: apenas movimento normal, sem tiro, arsenal, powerups ou passivas. O HUD indica a restrição e o campo/arcos elétricos duram dois segundos.
- Haste é uma antena arremessável persistente e destrutível em três impactos. Seu raio visível de 360 blocos causa 20 HP por turno a inimigos próximos e atrai eventos destrutivos enquanto estiver ativa. Adicionadas animações de pulsos, faíscas e som sincronizado com dano real.
- Mochileiro atrai powerups revelados em 270 blocos, compartilha a coleta com a equipe ou se cura sozinho. A animação desenha as partículas puxadas até o tanque; a atração fica suspensa durante a pane Tesla.
- Verificação: 125/125 testes; cliente Playwright oficial e partida real no Chromium com capturas da Haste e do Tesla em `output/web-game/tesla-rod/`, sem erros de página. TODO: validar legibilidade do círculo de alcance e balanço de dano em telas mobile reais.

## Haste exclusiva, Caça no Arsenal e novo dano de arena — 2026-10-17

- A Haste sai da seleção inicial e dos drops. O Meteorologista a desbloqueia automaticamente na rodada 2; jogadores de outras classes não podem dispará-la. Combos de disparo incluem múltiplas Hastes, Expansor de Impacto (raio de pulso ampliado), Congelamento (pulso congelante), perfuração, teleporte, Molotov e Mega Bomba.
- Caça Voadora passou de modificador de tiro a carta selecionável de Arsenal, com carga própria e arte SVG pixel-art independente. Seu voo, mergulho e efeitos sonoros foram preservados; pode usar modificadores de tiro. Bots podem usar tanto o Caça quanto a Haste desbloqueada.
- Minas nativas passaram a causar 70 HP, mantendo minas arremessadas em 40 HP. O Bombardeio começa em 24 HP e cresce 7 HP por impacto, antes da escalada de rodadas.
- Verificação: 127/127 testes; cliente Playwright oficial e partida real Chromium, carta, HUD e disparo visualizados em `output/web-game/haste-hunter/`, sem erros de console. TODO: validar balanço dos novos danos em partidas multiplayer extensas.

## Haste rebalanceada, Caça e pulso magnético — 2026-10-17

- Haste passou de 20 para 10 HP por pulso. O alcance da passiva do Sabotador aumentou de 520 para 760 blocos; cada ativação agora transmite seu próprio efeito visual de 2,8 s, com anel expansivo, núcleo persistente, interferência pixelada e indicação dos alvos atingidos. No foco dinâmico, a câmera enquadra imediatamente a origem do pulso antes de retomar a ação; o modo fixo não é alterado.
- Nova arte pixel-art detalhada para a carta Caça Voadora em `client/assets/flying-hunter-card-v2.png`, gerada a partir das cartas anteriores como referência de estilo. O SVG simplificado foi removido.
- Todos os projéteis ganharam halo, partículas orbitais e rastro de núcleo; Zeus, Tesla e Haste recebem arcos elétricos dedicados. Fogos usam partículas multicoloridas e mísseis ganham brilho quente.
- Verificação: 128/128 testes; cliente Playwright oficial e teste real Chromium em `output/web-game/rod-pulse-projectiles/`, com quadros capturados de Zeus e do pulso, sem erros de console. TODO: validar performance de partículas em celulares antigos e o contraste da onda em todos os biomas.

## Treino guiado, spawn variável e novo balanço — 2026-10-18

- Criação de uma partida teste em um clique: 1 bot fácil, Blindado, Obus/Zeus/Pulo, 10 rodadas e sorteio curto. Tutorial de oito etapas aparece dentro da arena, destaca os controles correspondentes, pode ser fechado e reaberto por `?`.
- O mapa conserva a geometria quando usa a mesma semente, mas embaralha a associação dos tanques aos pontos de spawn a cada partida.
- Sabotador recebe uma carga Tesla por rodada e seu pulso causa 20 HP, pane de movimento e bloqueio de powerups. Mochileiro mantém pickups passivos; os ativos curam 30 HP quando está sozinho. Drone de cura agora entrega 20 HP por turno durante quatro turnos.
- Estações de cura persistentes restauram 40 HP por contato, com espera antes de reutilizar. Barris podem ser empurrados e indicam alcance; sua explosão cresceu e deixa fogo. Granada ganhou aviso de detonação acelerado; Vórtex dura 4 s e causa até 80 HP perto do centro.
- Bot usa mira direta ao equipar Laser, e o traçado lateral escava o terreno de forma contínua. Eventos passaram a interagir com plataformas e estruturas elevadas; estruturas sem apoio caem. Dash Blindado retém o foco da câmera durante a animação.
- Verificação: 131 testes de servidor/client, treino e tiro real em Chromium desktop e viewport mobile horizontal sem erros de console. Capturas em `output/web-game/training-*.png`. TODO: validar sensibilidade dos controles e legibilidade do tutorial em aparelhos físicos; ajustar física de objetos arremessados em sessões multiplayer mais longas.

## Colisões de queda e impactos visuais — 2026-10-18

- Voos de tanques agora são integrados em pequenos passos no servidor. Colisões rápidas com paredes e plataformas deixam de atravessar o cenário entre ticks; o pouso no solo considera a largura inteira do tanque para não encaixá-lo na borda de um penhasco.
- Cada pouso transmite velocidade e distância de queda, aguarda brevemente a animação antes de avançar o turno e mostra compressão/retorno da suspensão, poeira e onda de impacto proporcionais à força. O tanque sincroniza sua posição no instante do pouso para não parecer flutuar acima dos efeitos.
- Estruturas em queda aceleram visualmente até o solo e dão um pequeno rebote; os efeitos de impacto acontecem no instante do contato. Fragmentos também quicam nas plataformas ativas.
- Em telas horizontais estreitas, o arsenal passa a recortar e rolar dentro do seu próprio espaço, sem cobrir a barra de powerups.
- Verificação: testes automatizados de colisão rápida, plataforma estreita e borda de penhasco; partida de treino em Chromium desktop e mobile horizontal, sem erros de console. TODO: experimentar o peso dos pousos em celular físico e ampliar testes de colisão entre fragmentos/objetos móveis.

## Granada física e plataformas em camadas — 2026-10-18

- A Granada Ricochete só colide com o topo de plataformas ao cair. Depois do terceiro quique ela mantém parte do impulso, rola com atrito durante o pavio e pode cair de uma borda antes de explodir. Seu sprite pixel-art gira com o deslocamento e o pavio solta faíscas próprias em vez de fumaça contínua.
- Estruturas que perdem o suporte superior pousam na primeira plataforma estática intacta abaixo, desde que toda a base caiba nela. O novo apoio fica registrado e evita uma segunda queda indevida.
- `render_game_to_text` agora expõe a fase atual dos projéteis para inspeção dos testes de navegador.
- Verificação: testes de regressão para a face inferior, rolagem até a borda e queda em plataformas empilhadas; partida real no Chromium com quadros do pavio e da explosão em `output/web-game/grenade-physics/`, sem erros de console.
- TODO: validar em aparelho físico a legibilidade do pavio e o custo de partículas; melhorar colisões de fragmentos de estruturas com plataformas móveis e calibrar o impulso de rolamento da granada com feedback de jogadores.

## Tiro Vetorial, Sentinela e fumaça de caveira — 2026-10-18

- Tanques destruídos deixam, junto aos fragmentos, uma caveira de fumaça pixelada que sobe e se dissipa durante a animação de 2,8 s. A silhueta foi conferida em captura isolada.
- Ataque Vertical agora se chama Tiro Vetorial: segundo toque/clique redireciona o projétil em linha reta a partir de sua posição corrente. O indicador pontilhado mostra a rota prevista até o primeiro obstáculo. O botão do HUD também aciona a segunda etapa usando o ponto indicado pelo cursor, com direção padrão quando não há toque.
- Míssil GPS ganhou correção de rota forte e rastro próprio. Tiro AP fratura esteiras de inimigos sem escudo atingidos: menos um movimento no próximo turno, inclusive para Ninja; proteção existente impede a fratura.
- Sentinela entrou no arsenal com arte pixel-art própria. Após arremesso vira uma estrutura metálica de três impactos, acompanha o suporte estático ou cai sob gravidade se perder apoio, atira até 20 HP no inimigo mais próximo a cada rodada dentro de 300 blocos e tenta interceptar projéteis inimigos com chance de 60%. Tesla e o pulso do Sabotador a desligam temporariamente; eventos, laser, tiros e estruturas em queda podem danificá-la. A torre tem varredura, dano flutuante, rajada visual e sonora.
- Verificação: testes automatizados completos e testes dirigidos de redirecionamento, GPS, AP, física, disparo/interceptação e Tesla da Sentinela; arena real no Chromium sem erros de console. Capturas em `output/web-game/sentry-vector/`.
- TODO: validar em aparelho físico a legibilidade da linha vetorial e a intensidade da rajada da Sentinela; ampliar teste end-to-end do segundo acionamento em mapas com teto baixo (colisão precoce pode encerrar o voo antes da interação).

## Vocabulário visual e armas em plataformas móveis — 2026-10-18

- As skills oficiais `spritecook-workflow-essentials`, `spritecook-generate-sprites` e `spritecook-animate-assets` foram instaladas do repositório informado. O MCP SpriteCook não estava conectado nesta sessão, então não houve geração de imagens no serviço; a reformulação atual usa desenho pixel-art nativo no canvas e mantém a integração futura como pendência.
- `client/visual-fx.js` define silhuetas, cores, rastros e indicadores de modificadores para todos os projéteis do arsenal. O renderer usa esses perfis também nas explosões, mostra halo de microblocos nos coletáveis e aplica pose amortecida nos lançamentos.
- Sentinela, Haste e minas arremessadas podem se fixar em plataformas móveis. O servidor mantém o deslocamento relativo ao suporte; o cliente interpola a posição para evitar tremedeira. Minas perdem o suporte e caem ao solo quando a plataforma quebra, enquanto estruturas usam a física de queda existente.
- Tanques em queda têm arrasto horizontal, alongamento proporcional à velocidade e reação visual ao impacto. Explosões e esmagamentos transmitem impulso aos tanques já no ar; em solo, registram recuo, podem deslocá-los de plataformas e deixam a resolução de queda cuidar do pouso.
- Verificação: 147 testes automatizados aprovados; cliente Playwright oficial e partida guiada real em Chromium sem erros de página. Capturas em `output/web-game/spritecook-fx/`, incluindo o projétil padrão em voo.
- TODO: conectar/autenticar o MCP SpriteCook em nova sessão para gerar sprite sheets consistentes e avaliar se substituem os desenhos nativos; testar a física de minas e torres em plataformas móveis num aparelho mobile real; revisar a paleta de explosões por bioma.

## Pipeline alternativo de sprites — 2026-10-18

- A skill oficial `sprite-pipeline` foi localizada e instalada. Os scripts auxiliares não vieram no pacote da skill isolada, então a normalização automatizada ficou indisponível nesta sessão. A skill `imagegen` integrada gerou assets transparentes no estilo pixel-art do jogo.
- `projectile-atlas-v1.png` traz 16 silhuetas para projéteis; `special-projectile-atlas-v1.png` completa Laser, Haste, Sentinela e Mega Bomba em voo. O renderer mantém o desenho nativo de fallback e preserva os efeitos de combo por cima. Cada sprite usado recebeu quatro batidas de animação próprias (propulsão, arcos elétricos, órbita gravitacional, fusível ou varredura). A última célula do primeiro atlas fica reservada para um projétil de cura futuro.
- `shell-impact-strip-v1.png` traz quatro quadros de impacto (ignição, expansão, explosão e fumaça) aplicados a tiros explosivos comuns, sem substituir os efeitos especializados.
- Verificação: 148 testes automatizados, `git diff --check`, cliente Playwright oficial e treino guiado real no Chromium; o projétil em voo, a ignição e a fumaça foram conferidos em `output/web-game/sprite-pipeline/`, com assets HTTP 200 e sem erros de página.
- As faixas específicas para Tesla/Zeus, Mega Bomba e movimentação foram criadas na etapa seguinte. Pendente: trazer os scripts completos do plugin `game-studio` antes de adotar a normalização automatizada da `sprite-pipeline`.

## Faixas dedicadas de animação — 2026-10-18

- Novas faixas transparentes de quatro quadros em `client/assets/electric-impact-strip-v1.png`, `atomic-cloud-strip-v2.png` e `tank-motion-atlas-v1.png`. A última tem duas linhas: salto ciano e avanço blindado laranja. O atlas atômico foi refinado para evitar cortar a copa; a leitura usa recortes alinhados aos corredores transparentes.
- O impacto de Zeus, Tesla e Tiro Vetorial recebe descarga elétrica por quadros; a Mega Bomba usa cogumelo raster com ignição, coluna, coroa e fumaça, mantendo onda de choque e fallback em microblocos; salto e dash ganharam propulsores que seguem o sentido do tanque. Nenhuma dessas mudanças altera física, dano ou duração da jogada.
- Verificação: 149 testes automatizados aprovados; partida de treino real em Chromium desktop e viewport mobile horizontal sem erros de página ou console; atlas e quatro quadros de cada efeito conferidos em `output/web-game/sprite-pipeline/motion-impact-review.png` e `live-jump-mobile.png`.
- TODO: validar em mobile físico a legibilidade da propulsão com zoom mínimo e o custo das faixas raster; confirmar em partida longa que os efeitos não cobrem indicadores de saúde.

## Retorno ao visual nativo — 2026-10-18

- A pedido do jogador, impactos, descargas, Mega Bomba e movimento dos tanques voltaram ao desenho original de microblocos no canvas. Após esclarecimento, os dois atlas e a animação das balas foram preservados: o usuário aprovou o desenho dos projéteis, mas não as explosões raster. As quatro faixas de impacto/movimento foram removidas. Os registros acima permanecem como histórico, não como estado atual.
- Mantidas as correções de física e de objetos arremessáveis que acompanham plataformas móveis. O recuo visual adicionado na etapa raster foi retirado, sem desfazer o impulso físico do servidor.
- Impactos agora ganham fagulhas geométricas breves e descargas elétricas ramificadas, ainda desenhadas com os mesmos blocos e cores do estilo original.
- Verificação final do visual: atlas das balas carregados, faixas de explosão/movimento não requisitadas; disparos padrão e Zeus inspecionados no Chromium desktop e em viewport mobile horizontal, sem erros de console. Capturas em `output/web-game/native-visuals/`.
- TODO: conferir em aparelho físico a intensidade das novas fagulhas e ajustar por tipo de tiro se necessário.

## GPS e Sentinela — 2026-10-18

- O Míssil GPS traça uma rota guiada pela malha livre do cenário, contorna até três plataformas ou estruturas na linha até o alvo e colide com a quarta. Respeita terreno sólido, interceptação da Sentinela e coleta de powerups durante o voo. A carta e o aviso de coleta agora explicam esse limite.
- A Sentinela tem esteiras, corpo e cabeça giratória separada. Ao atacar, dispara cinco traçantes em sequência com recuo, clarões no cano, cápsulas e microimpactos; a animação dura 1,1 s e o servidor aguarda seu término antes de prosseguir com eventos.
- Verificação: testes de GPS para três paredes, quarta parede, plataforma e estrutura combinadas, e disparo real que consome a carta; trajetória com três obstáculos revisada em `output/web-game/native-visuals/gps-review.png`; animação da Sentinela conferida em cinco momentos em `sentry-review.png`.
- TODO: medir em aparelho físico a legibilidade da rajada no zoom mínimo e testar em partida longa interações do GPS com guindastes móveis.

## Rajada física da Sentinela — 2026-10-18

- A Sentinela dispara cinco projéteis independentes de 5 HP a cada dois turnos. Cada bala para no primeiro tanque inimigo, estrutura, plataforma ou solo. O solo sofre pequena perfuração e estruturas recebem dano por bala; barreiras impedem dano ao tanque protegido.
- A câmera enquadra a torre e o percurso das balas até o fim da rajada, inclusive no modo de zoom fixo, e depois retorna. O terreno visual aguarda os impactos para não sumir antes da colisão.
- Rajada, explosões e poderes receberam fagulhas e detritos adicionais no desenho nativo de microblocos, com cores por tipo de poder. O som acompanha os cinco disparos em desktop e mobile.
- Validação: 153 testes automatizados aprovados; cliente Playwright da skill e partida de treino sem erros; cinco quadros da rajada e ida/volta da câmera conferidos em `output/web-game/sentry-five-shot/visual-review.png`.
- TODO: conferir a legibilidade dos microprojéteis e o volume da rajada em aparelhos físicos Android/iPhone.

## Arsenal tático novo — 2026-10-18

- Tiro Vetorial mantém a balística normal até a segunda ativação e reproduz o voo inicial a 78% da velocidade anterior, com relógio do servidor, renderização e áudio sincronizados.
- Bomba de Sabão cria até três bolhas com trajetória oscilante, levitação, estouro de 30 HP e queda física. Bomba Marcadora quica três vezes no solo ou parede, ganha impulso, causa 10 HP no terceiro contato e detona cada uma das três marcas após 3 s por 30 HP.
- Arpão tem duas ativações: lançamento e ancoragem, depois puxada de um movimento. Ao atingir inimigo, puxa-o até o atirador e causa 30 HP no choque. O ataque permanece disponível após puxar; passar sem puxar devolve a munição. Bots também executam a segunda ativação.
- Todas as armas do arsenal têm recarga própria de 2–4 turnos do dono, mostrada na carta e HUD. Os três novos poderes têm artes pixel art exclusivas; combos explosivos compatíveis funcionam nas bombas, sem gastar modificadores incompatíveis no Arpão.
- Verificação: 160 testes automatizados aprovados, cliente Playwright oficial e fluxo de partida real com as três novas cartas, marcas no cenário, ancoragem, puxada e disparo posterior. Capturas em `output/web-game/new-arsenal-live/` e nenhum erro de console.
- TODO: validar sensação e volume dos novos SFX em Android/iPhone físicos e avaliar o equilíbrio das recargas com telemetria de partidas longas.

## Vibração mobile — 2026-10-18

- Relato do jogador: o jogo funciona bem no mobile, exceto a vibração. Os pulsos nativos agora têm duração mínima perceptível e chamadas menos intensas em sequência não cancelam uma vibração mais forte.
- O painel de controles mobile oferece **TESTAR VIBRAÇÃO**. Ele informa se o navegador aceitou o comando; quando a API não está disponível, mantém o retorno visual sem prometer vibração física.
- Verificação: 160 testes aprovados; cliente Playwright oficial e partida em viewport mobile horizontal com API simulada disponível e ausente, capturas em `output/web-game/haptics-check/`, sem erros de console.
- TODO: executar o teste em Android/Chrome físico e verificar configurações de vibração do aparelho. A ausência da API de vibração no WebKit/iPhone não pode ser corrigida apenas com JavaScript do jogo.

## Bolhas, arpão e construção da arena — 2026-10-18

- A Bomba de Sabão agora tem raio amplo (460), bolhas grandes e legíveis, flutuação por 5 s com desvio lateral próprio para até três inimigos, estouro e queda física.
- O Arpão voa em linha reta até 1750 unidades, mostra uma prévia de trajetória/alcance e identifica terreno, plataformas, tanques e estruturas. A segunda ativação tensiona o cabo, puxa com impulso e mantém o ataque disponível após a chegada.
- Projéteis de sabão, arpão e marcador receberam silhuetas pixel art próprias. A prévia comum e a assistência de mira compartilham com o servidor a geometria das estruturas; o voo e a queda dos tanques receberam acentos visuais e ajuste de integração temporal.
- A tela de sorteio exibe o mapa real se formando em blocos brancos sobre preto, seguida por estruturas, plataformas e tanques nas posições efetivas de spawn durante a contagem de 10 s. O layout ocupa a tela inteira e acomoda 10 participantes no mobile horizontal.
- Verificação: 162 testes de lógica; cliente Playwright oficial; partida real com três armas e capturas de sorteio em desktop; cenário com nove bots no mobile horizontal, entrada em partida e nenhum erro de console. Capturas em `output/web-game/new-arsenal-live/` e `output/web-game/roulette-construction/`.
- TODO: validar em Android/iPhone físicos a leitura dos rótulos dos tanques no sorteio com dez jogadores e a sensação do impulso do Arpão.

## Arsenal v4 — 2026-10-18

- As 22 armas ganharam artes novas individuais, seguindo o fundo azul-marinho, pixels duros, brilho curto e silhueta dominante dos powerups. O design diferencia explicitamente projéteis, mobilidade, estruturas e ações de segunda ativação.
- As imagens estão em `client/assets/arsenal-v4/`, normalizadas para 320 × 320 px (4,5 MiB no total). `atlasStyle()` e o CSS levam a mesma arte à biblioteca, escolha inicial, HUD e revelação de coleta; o atlas v3 fica preservado como histórico.
- Verificação: 163 testes aprovados; cliente Playwright oficial; QA de 22 URLs e dimensões, biblioteca em três páginas, escolha de arsenal desktop/mobile horizontal e HUD de partida, sem erros de console. Capturas em `output/web-game/arsenal-art-v4/`.
- TODO: conferir em aparelhos Android/iPhone reais a legibilidade das miniaturas de 37 px e ajustar apenas as que se mostrarem ambíguas no tamanho físico.

## Assinaturas de impacto — 2026-10-18

- Os impactos de tiro receberam um núcleo de flash em microblocos e assinaturas específicas: ramificações elétricas, cristais de gelo, quadrados convergentes de gravidade, estrelas multicoloridas de fogos e rachaduras sísmicas. Explosões cinéticas conservam detritos; o efeito de congelamento agora acompanha o modificador do tiro.
- Nenhuma regra de dano, colisão ou duração de turno foi alterada. O renderer mantém as assinaturas dentro do ciclo de efeitos existente, sem adicionar partículas persistentes ao limite global.
- Verificação: 163 testes aprovados, cliente Playwright oficial executado, partida real em desktop e mobile horizontal com seis capturas de assinatura e disparo de Obus. QA em `scripts/qa-impact-effects.mjs` e capturas em `output/web-game/impact-effects/`; sem erros de console.
- TODO: conferir brilho e contraste em telas mobile físicas, especialmente quando múltiplas explosões ocorrem no mesmo ponto.

## Ações de classe — 2026-10-18

- Ninja revela a posição ao disparar ou usar arma de arsenal (incluindo salto, paraquedas e avanço). Ao ficar a até 96 blocos de um inimigo visível, sem parede ou estrutura no caminho, recebe o botão CORTE FATAL: ataque manual de 80 HP-base, uma vez por turno, com escudo aplicado normalmente, animação de 1,8 s, som próprio e foco de câmera. Bots Ninja também o usam quando elegíveis.
- Mochileiro pode trocar manualmente as três cartas do arsenal por duas armas de tiro e uma de movimento aleatórias nas rodadas 3, 6, 9…; somente uma troca por rodada, munição nova de uma carga por carta. Bots Mochileiros efetuam a troca automaticamente. Ambos os botões são contextuais e visíveis no HUD mobile horizontal.
- Verificação: 167 testes aprovados, cliente Playwright oficial executado, QA de partida real e capturas desktop/mobile em `output/web-game/class-actions/`, sem erros de console. O QA visual injeta uma prévia de corte e dos dois botões para verificar o desenho; a aplicação das regras reais é coberta pelos testes de servidor.
- TODO: testar em aparelhos físicos a legibilidade e área de toque dos botões contextuais; se o HUD ficar carregado, mover o botão para junto dos controles de ação no mobile.

## Física de bolhas, arsenal e cartas — 2026-10-18

- Bolhas mantêm até três tanques suspensos durante 5 s, sobem com deriva lateral mínima e contornam plataformas/estruturas; ao estourar, o tanque cai sob gravidade e só dispara a animação de pouso ao tocar chão ou plataforma.
- Destruidor escava cratera mais larga/profunda, exibe furadeira e detritos durante 4 s e mantém o foco da câmera. Onda de Choque, Expansor e AP receberam assinaturas de impacto distintas; o AP ganhou projétil, faíscas e som próprio.
- Zeus marca o primeiro impacto (40 HP) e, 2 s depois, atinge o ponto exato por mais 40 HP; coberturas superiores bloqueiam o segundo raio. Bomba de Propulsão agora remove solo e desloca estruturas/objetos, além dos tanques. Obus ganha bônus crítico em trajetórias muito altas e longas; Sentinela anima 5 disparos ao interceptar projéteis.
- Caixa de Munição dá 2 cargas para cada arma, até 4, e zera recargas. Mega Canhão virou Intervenção dos céus, custando 1000 pontos mais 500 por uso anterior. Ícones do arsenal indicam recarga e disponibilidade com animação. Artes do Arpão simplificadas.
- Cartas da biblioteca, seleção de arsenal e recompensas exibem textos curtos, com dano e alcance em campos coloridos; classe e carta tiveram fontes ampliadas no mobile horizontal.
- Verificação: 171 testes Node aprovados; cliente Playwright oficial e QA de biblioteca desktop/mobile, escolha de arsenal, partida real, disparo de Obus e prévia de furadeira; nenhum erro de console. Capturas em `output/web-game/oct18-physics-cards/`.
- TODO: validar em dispositivos móveis físicos a vibração/áudio e a leitura das cartas em densidades de tela variadas.

## Correção do layout das cartas — 2026-10-18

- A biblioteca não usa mais linhas de altura fixa para cartas com descrições de tamanho variável. Cada linha cresce com o conteúdo e mantém campos de dano/alcance e botão de comparação dentro dos limites da carta.
- O QA `scripts/qa-card-layout.mjs` confere todas as 68 cartas em desktop, mobile horizontal e vertical, testa a comparação e registra capturas em `output/web-game/card-layout/`.
- Verificação: QA visual sem recortes nem erros de console; cliente Playwright oficial executado; 171 testes Node aprovados; `git diff --check` limpo.
- TODO: conferir a rolagem da biblioteca em aparelhos físicos com escala de texto do sistema aumentada.

## Arpão, bolha e turnos de bot — 2026-10-18

- O Arpão agora puxa tanques inimigos em 520 ms, com aceleração até o impacto, cabo ligado visualmente ao atirador e tremor mais forte. O puxão do próprio tanque continua em 1100 ms; o dano do Arpão permanece 30 HP.
- O Corte Fatal do Ninja passou de 80 para 100 HP; as cartas, o HUD e os testes refletem o valor novo.
- O renderizador deixa de prender ao chão um tanque carregado pela bolha ou pelo Arpão. O início da bolha não dispara um pouso falso; a queda real após o estouro segue a física do servidor.
- Bots congelados ou realmente sem ação passam a vez imediatamente, antes do atraso normal da IA. Corrigido também o caso em que a resolução da pegada podia reposicionar um tanque através da parede quando ele nem havia dado o primeiro passo.
- Verificação: 172 testes Node aprovados; Playwright oficial, partida real com bolha e Arpão, e QA isolado do renderizador sem erros de console. Capturas em `output/web-game/harpoon-bubble-frozen/`.
- TODO: conferir em mobile físico a percepção de velocidade do puxão inimigo e a leitura da bolha durante partidas com muitos efeitos simultâneos.

## Movimento contínuo e combustível — 2026-10-18

- A/D, setas e botões móveis agora dirigem enquanto pressionados, em pequenos passos validados pelo servidor. Cada tanque inicia com combustível de classe; o saldo só é reabastecido após duas rodadas completas. O HUD mostra combustível restante, velocidade e previsão de recarga, inclusive em mobile horizontal.
- Blindado, Atacante, Bombardeiro, Curandeiro, Meteorologista, Ninja, Sabotador e Mochileiro têm perfis distintos de velocidade/capacidade. O Impulso coletável dá +65 de combustível e +8 px/s por carga, acumulativos.
- Aranha sobe paredes em incrementos verticais e gira visualmente o tanque enquanto se agarra à parede. A física preserva o apoio vertical até alcançar o topo ou a parede ser destruída. Investida Blindada e Arrancada Foguete recebem deslocamento visual horizontal rápido, rastro e linha de prévia mais marcada.
- Bots usam o mesmo combustível e movimento gradual; congelados ou sem combustível/ataque passam a vez. O tutorial e a descrição das cartas foram atualizados. Corrigida uma chamada inexistente de áudio ao apertar A/D ou as setas e limitado o som das esteiras a uma ativação a cada 280 ms.
- Verificação: 175 testes Node aprovados; script Playwright oficial executado; QA real de tecla mantida no desktop e botão mantido no mobile, com combustível reduzido, HUD visível e sem erros de console. Capturas em `output/web-game/drive-qa/`.
- TODO: ajustar velocidade/combustível com telemetria de partidas reais e conferir toque contínuo em iPhone/Android físicos.

## Estados dos tanques e correção da Aranha — 2026-10-18

- Criado estado físico compartilhado: no chão, em movimento, planando, flutuando, em queda, preso à parede, subida balística e destruído. A reação breve de dano é um estado visual separado da situação física, preservando a gravidade mesmo durante o impacto. Estados e tempos de transição seguem nos snapshots do servidor.
- Aranha agora salta até o contato real com a parede, anexa-se sem atravessá-la e continua a escalar enquanto a direção é mantida, consumindo combustível em incrementos. A prévia usa a mesma trajetória do servidor. O tanque gira na parede e suas patas alternam passos durante caminhada e escalada.
- As animações distinguem esteiras e poeira no chão, paraquedas no planeio, oscilação na flutuação, rastros na queda, flash ao sofrer dano e patas/partículas na parede. O salto pode impulsionar a Aranha para fora da parede sem manter uma aderência antiga.
- Auditadas interações: Bolha e Arpão soltam a aderência à parede; Propulsão, explosões e outros impulsos fortes rompem a bolha e devolvem o tanque à gravidade; Propulsão também interrompe um puxão de Arpão concorrente. A movimentação normal é bloqueada enquanto um efeito controla a flutuação. Carta Sacana exige apoio real no solo ou numa plataforma.
- Verificação: 181 testes Node aprovados, incluindo estados, Aranha, Bolha, Arpão e Propulsão; cliente Playwright oficial e QA em partida real com Aranha selecionada e tecla mantida, sem erros de console. Captura em `output/web-game/tank-states/`.

## Classes, furadeira, quedas e vento nas bolhas — 2026-10-19

- As oito classes receberam resumos curtos e fatos numéricos próprios na biblioteca. A escolha de classe usa fonte de leitura maior e cards ajustados para desktop, mobile horizontal e vertical; regras completas continuam no tooltip e na busca.
- O Destruidor/furadeira revela a cratera por etapas durante os quatro segundos de descida, com centro e bordas acompanhando a broca. Tanques, estruturas e itens ficam visualmente sincronizados até o fim da escavação; a simulação autoritativa continua resolvendo o impacto no servidor.
- Quedas acima de 110 blocos agora causam dano crescente pela altura real desde o ápice. Cada classe tem multiplicador próprio; o paraquedas evita dano. Solo e plataformas usam a mesma regra, uma única vez no contato, e o HUD mostra `QUEDA -N HP`.
- Bolhas carregando tanques derivam com direção/intensidade do vento atual, ainda desviam de obstáculos e conservam parte da deriva após estourar. Partículas leves ao redor da bolha mostram a direção do vento.
- Verificação: 189 testes Node aprovados, inclusive queda fatal com lápide; QA da biblioteca e da seleção de classes em três viewports; QA visual da furadeira em início/meio/fim com capturas em `output/web-game/drill-visual/`.
- TODO: ajustar os multiplicadores de queda e a deriva das bolhas com observação de partidas reais; conferir toque e legibilidade em iPhone/Android físicos.

## Corte Fatal e detonação do Bombardeiro — 2026-10-19

- O Corte Fatal continua revelando o Ninja imediatamente, mas agora também reinicia a contagem da invisibilidade passiva. Ela só retorna depois de duas rodadas sem dano nem novo ataque, evitando que o Ninja suma outra vez na rodada seguinte.
- O Bombardeiro detona uma área de 160 blocos ao morrer: 80 HP aos inimigos dentro do raio, cratera e interação com estruturas. A explosão respeita aliados, escudos e a desativação de passivas por Tesla. Eliminações em cadeia são processadas uma única vez por tanque; Vida Extra evita a detonação enquanto houver respawn.
- A detonação recebeu partículas, clarão, tremor, foco de câmera, números de dano e som. Durante um tiro, esses efeitos só começam após o projétil concluir sua trajetória.
- Regressões: teste de revelação atravessando rodadas, raio/dano/ausência de duplicação, reação em cadeia, aliados e Vida Extra. Suíte completa: 193/193 testes. Cliente Playwright oficial executado; QA de partida com Ninja e detonação visual sintética conferido em `output/web-game/ninja-bomber-reveal/`, sem erros de console.
- TODO: conferir o impacto visual e o balanço dos 80 HP em partidas multiplayer reais, inclusive em iPhone/Android físicos.
