Original prompt: crie esse jogo de acordo com o plano; analise o plano e continue implementando o máximo possível dos 12 blocos do TankDots Wars.

## Busca livre de sons na página de revisão — 2026-10-25

- Cada ocorrência agora tem **+ BUSCAR OUTRO SOM**: pesquisa todos os 111 arquivos do catálogo, permite prévia e escolha fora das cinco sugestões.
- Um seletor de arquivo permite ouvir MP3/WAV do computador, inclusive `D:\sons`. O arquivo fica no IndexedDB deste navegador; o resumo exporta nome, tamanho e SHA-256, sem embutir o áudio.
- A escolha adicional só entra no resumo depois de confirmada. Teste Playwright verificou busca, seleção, upload, persistência após recarga, prévia do arquivo e layout mobile de 390 px, sem erros de página.

## Tiro Vetorial, camadas de áudio e revisão de sons — 2026-10-25

- Tiro Vetorial aceita duas mudanças de direção depois do disparo inicial. Cada segmento reabre a prévia e a segunda ativação fecha a janela de redirecionamento. O cálculo final parte de uma cópia intacta do estado inicial, evitando consumo duplicado e colisões antecipadas.
- Tiros elementais agora sobrepõem o som do canhão e o elemento no lançamento; no contato, sobrepõem o impacto físico e o impacto elemental. O Vórtex e suas variantes foram nivelados para ficarem audíveis. O disparo ganhou onda de choque, clarão, fumaça traseira e partículas mais evidentes.
- `sound-review.html` oferece cinco amostras e confirmação individual para 108 ocorrências, sem aplicar novas escolhas automaticamente. Cinco trechos de voo de míssil de `D:\sons` estão prontos para audição. A trilha em voo aguarda a seleção do jogador antes de entrar no jogo.
- Verificação: 399 testes automatizados passaram; Playwright executou disparo, primeira e segunda ativação do Vetor sem erros. A página de revisão exibiu cinco opções distintas nas 108 ocorrências, preservou uma escolha anterior, não criou rolagem horizontal em 390 px e serviu a quinta amostra com HTTP 206. Pendente: receber as escolhas A–E do jogador para vincular a trilha de voo e as demais ocorrências.

## Verificação do pacote de áudio no navegador — 2026-10-25

- Relato do jogador: os efeitos importados não eram perceptíveis na versão testada. A causa principal foi confirmada: `localhost:3000` servia `D:\tankswar`, uma cópia antiga do jogo; o trabalho anterior tinha atualizado somente `D:\tankswar\_upstream` e o pacote portátil. O WAV antigo em `/sounds/shot.wav` tinha 41.940 bytes, contra 44.144 bytes do arquivo importado. A pasta ativa foi sincronizada e a porta 3000 passou a devolver os bytes novos.
- A checagem antiga da tela inicial tocava apenas `ready.wav`, um som anterior ao pacote novo; não demonstrava nenhum dos arquivos enviados. Agora todas as variantes de disparo do arsenal e os fogos usam as gravações de `D:\sons`, com cortes e velocidade apropriados. Sons de interface e ambiente continuam com a identidade minimalista anterior porque a pasta não contém arquivos dessa natureza.
- O botão inicial agora toca uma sequência curta de tiro, explosão pesada e laser, e informa se a amostra não carregou. As URLs dos WAVs têm uma revisão explícita compartilhada entre Web Audio e áudio nativo mobile para evitar arquivos antigos do cache; falhas de carregamento podem ser tentadas novamente.
- Navegador local: os três WAVs retornaram HTTP 200 com bytes idênticos aos do repositório e foram iniciados pelo Web Audio. Pendente: identificar se o usuário estava no site publicado, instalação anterior ou servidor local e confirmar a audição no dispositivo real.

## Efeitos fornecidos em D:\sons — 2026-10-25

- Auditados 32 MP3s, com quatro cópias idênticas. As 28 gravações distintas foram recortadas e niveladas em WAV mono de 22.050 Hz; o mapeamento reproduzível está em `scripts/import-local-sfx.py`.
- Tiros padrão e especiais, explosões, água, laser, AP, metralhadora da Sentinela, meteoro, terremoto e bombardeio passaram a usar os arquivos enviados. Efeitos já presentes, mas sem chamada de gameplay, foram ligados a colisões e eventos apropriados.
- Os canais nativos do mobile agora reservam a duração real de todos os WAVs, inclusive efeitos antigos que estavam sendo interrompidos cedo. Interface, música e camadas ambientais permanecem separadas. Validação: 397 testes passaram; a partida TEST em navegador desktop e perfil mobile acionou `shot.wav` e a explosão na colisão, sem erros de página. Pendente: conferir o equilíbrio de volume e a sensação dos cortes em iPhone e Android reais.

## Retorno aos tiros e impactos originais — 2026-10-25

- Restauradas as amostras de disparo, explosão, arma pesada, eletricidade e trovão do commit `5189e03`; o nivelamento anterior mantém o volume audível sem alterar o timbre.
- Armas mais novas reutilizam a família sonora original. Impactos de projéteis voltaram a um único efeito confirmado na colisão, sem sobrepor o som de material e a explosão; meteoros e bombardeio usam a explosão pesada antiga.
- Testes de áudio passaram. Partida TEST no navegador disparou e exibiu o projétil com Web Audio ativo, sem erros de página. Pendente: ouvir o equilíbrio final em iPhone e Android reais.

## Novas texturas ambientais — 2026-10-25

- Criadas seis faixas curtas de brisa, chuva, neve, gelo, fogo e água em cascata com a skill ElevenLabs. O processamento deixa cada uma em mono, 22.050 Hz, com filtro, quantização leve e volume baixo para combinar com os sons minimalistas.
- O volume responde ao clima, zoom e posição da câmera. Chuva e neve acompanham o tempo; gelo, fogo e cascatas só soam junto das fontes visíveis, incluindo chamas que caem após perder apoio.
- No máximo duas camadas ambientais tocam juntas, preservando canais para tiros e impactos no mobile. Gerador e instruções foram adicionados ao projeto.
- Validação: 391 testes passaram; Playwright em perfil mobile confirmou que as seis novas faixas foram acionadas nos contextos correspondentes, sem erros de página.

## Volume dos efeitos e hover da interface — 2026-10-25

- Efeitos sintéticos adicionados depois do pacote original receberam cerca de 6 dB a mais; os sons antigos que estavam muito baixos foram nivelados sem mudar seu timbre. Ambiente e música mantiveram o ganho próprio.
- O hover foi encurtado para 0,11 s e limitado a uma entrada real em cada controle. Se a interface recriar o botão sob o cursor, o som não dispara de novo; ao sair e voltar, toca uma vez.
- O fluxo de geração e nivelamento está em `npm run generate:minimal-sfx`. Os 387 testes passaram; QA no navegador confirmou 1 som na primeira entrada, 0 ao recriar o controle e 1 ao reentrar, sem erros de página.

## Sons minimalistas, ambientação e repouso da madeira — 2026-10-25

- Restaurados os 42 WAVs originais do commit `5189e03`; os efeitos criados depois foram sintetizados localmente no mesmo estilo, mantendo as armas e eventos recentes.
- Adicionadas camadas ambientais discretas de vento, folhas, poeira e água. O volume depende da força do vento, da proximidade de árvores, chão e lagos, e do zoom; ao afastar a câmera, a camada para.
- Fragmentos de tronco agora perdem rotação e velocidade ao repousar. Contatos audíveis têm limite por fragmento, intervalo mínimo e volume menor, sem repetir o som de árvore quebrando.
- Testes de áudio, ambiente e física da madeira passaram; navegador confirmou ambiente próximo, silêncio ao mostrar o mapa inteiro e ausência de erros de página. Pendente: avaliar o volume percebido no iPhone e Android reais.

## Abalo da Arena — 2026-10-24

- O evento agora anuncia de três a seis falhas maiores, com maior chance de mirar posições ocupadas. O impacto rompe o solo em três pontos, danifica plataformas e estruturas próximas, causa dano e arremessa tanques atingidos.
- Aviso com fenda sísmica e risco marcado; impacto com ondas horizontais, rachaduras ramificadas, detritos, poeira, tremor e flash. A câmera permanece no evento por 2,2 s.
- Sons próprios de aviso e impacto gerados para desktop e mobile. O evento pausa o relógio do turno durante a animação.
- Verificação: 381 testes passaram; Playwright abriu uma partida de treino, sem erros no navegador; capturas de aviso e impacto foram inspecionadas.

## Recorte das imagens das cartas — 2026-10-24

- Artes da biblioteca, arsenal e recompensas agora ficam recuadas dentro da janela de cada carta, sem cobrir a linha de separação ou a moldura. O corpo da carta não muda bruscamente de cor abaixo da arte.
- Conferido no desktop e no mobile horizontal: imagens permanecem inteiras, com margens reais de 6–7 px e 4–5 px; seleção por toque, mouse e teclado continua funcionando. Sem erros de página.

## Efeitos sonoros ElevenLabs — 2026-10-24

- Skill `sound-effects` instalada e conta conectada pelo CLI; chave guardada em `.env.local`, fora do Git. 41 WAVs de efeitos antigos foram regenerados e 24 novos foram criados para interface, estruturas, água, gelo, clima, arpão, Sentinela, AP e meteoro. Música preservada.
- Desktop e mobile usam os mesmos arquivos: Web Audio no desktop com carregamento gradual, mídia nativa no mobile. Sons de impactos são acionados pela colisão confirmada, e não apenas pelo disparo. A síntese anterior funciona como fallback.
- Formato PCM mono 22.050 Hz, 16 bits, com volume normalizado e margem contra distorção. Gerador e instruções estão em `scripts/generate-sfx.mjs` e `docs/SOUND_DESIGN.md`.
- Verificação: WAVs válidos, audíveis e distintos; navegador desktop e mobile horizontal com áudio ativo e sem erros; tiro em partida de treino disparou amostras reais. Suíte completa: 377/377 testes.

## HUD e cartas em metal pixel art — 2026-10-24

- HUD com placas de aço em degraus, rebites quadrados, brilho contido e destaque claro do turno, armamento, powerup e botão de tiro.
- Cartas da biblioteca, escolha de classe, arsenal e recompensas com moldura metálica colorida, arte rebaixada e estado selecionado iluminado. No mobile horizontal, miniatura e nome continuam visíveis.
- Seleção por toque agora distingue o clique sintético do toque real em cada carta; recompensas e evolução preservam seus botões durante atualizações da partida.
- Verificação: testes automatizados, seleção rápida por mouse, teclado e toque, inspeção visual em desktop e mobile horizontal, sem erros de página.

## HUD, cartas e física de estruturas — 2026-10-24

- HUD com trilho tático mais legível: destaque de turno, jogador local, vida e seleção de armas e poderes. Moldes das cartas de biblioteca, arsenal, recompensas e classes agora compartilham bordas, acentos e áreas de informação no estilo pixel art existente.
- Troncos e árvores grandes caem progressivamente; os galhos permanecem presos ao tronco durante a queda. A bola do guindaste cai com gravidade e causa dano ao tocar o apoio. Raios incendeiam árvores antes de calcular o dano do impacto.
- Verificado no navegador em desktop e mobile horizontal, sem erros de página. Suíte completa: 377/377 testes.

## Gelo com cobertura e estalactites — 2026-10-24

- A explosão de gelo só cria pontos nas superfícies expostas; plataformas impedem crosta e congelamento prematuros no solo e em tanques abaixo. O dano elemental de gelo não empurra o alvo.
- Novas camadas se acumulam sobre gelo existente, até quatro níveis. Impactos em plataformas e estruturas elevadas criam estalactites; tiros ou destruição do apoio as soltam, e a queda causa 36 HP base ao atingir um tanque.
- Inspeção visual das camadas e da queda no navegador; 375/375 testes automatizados e cliente Playwright oficial sem erros.

## Água sobre plataformas — 2026-10-24

- A esfera elemental não escava o solo ao atingir uma plataforma ou estrutura. A água se espalha pelo apoio, cai da borda sob gravidade e pode ser recebida por outro apoio abaixo; o lago só aparece após contato real com o terreno.
- Destruir o apoio faz a água cair. A cascata tem desenho próprio e mantém a animação da ação até pousar ou sair do mapa.
- Regressões cobrem pouso inicial, duas plataformas e apoio destruído. `npm.cmd test`: 371/371. QA visual em três etapas e cliente Playwright oficial, sem erros de página.

## Gelo restrito à água real — 2026-10-24

- A crosta congelada agora é dividida em trechos por coluna molhada, sem criar pontes sobre solo seco ou lacunas. Trechos seguem a altura real da superfície da água e desaparecem quando a água perde apoio.
- Removida a faixa decorativa que ainda desenhava gelo pelo raio inteiro do lago. A arte agora cresce em microblocos irregulares, com brilho e rachaduras, em vez de uma barra rígida. Quebrar uma placa continua impedindo sua regeneração durante o mesmo congelamento.
- Teste de dois bolsões separados por solo seco, destruição de placa e inspeção visual no navegador sem erros. Próximo: conferir o efeito em partidas reais com lagos grandes e plataformas móveis.

## Gelo por pontos, esfera de água e madeira fluida — 2026-10-24

- Gelo elemental só forma após o impacto. Cada ponto fica preso ao solo, parede, plataforma ou estrutura real; quando perde o apoio, cai. O impacto ganhou partículas e vapor branco.
- A bomba de água cria a esfera no ponto do impacto, lança a água para cima e só se liquefaz ao pousar numa superfície. O modo TEST permite escolher diretamente o elemento do Elementalista.
- Troncos quebrados usam passos físicos curtos em cada tick de rede, preservam quique e rolamento; o cliente interpola o movimento desde a origem do fragmento. Árvores inteiras balançam levemente pelo vento.
- Verificação: 368 testes automatizados e capturas reais de água/gelo no navegador sem erros de console. Próximo: validar sensação de movimento e desempenho em iPhone/Android reais.

## Gelo, fogo e três arenas — 2026-10-21

- Gelo sobre lagos congelados agora é uma plataforma física destrutível: suporta tanques, desliza um pouco mais rápido, estilhaça em partículas azuis e só reaparece após um novo congelamento. Ao derreter ou quebrar, tanques sem apoio entram em queda.
- Incêndios de solo/plataforma usam focos individuais. Cada chama segue seu próprio apoio; se ele é destruído, aguarda o fim da animação de batalha e cai até o próximo apoio. Contato e desenho seguem os focos, sem um oval vermelho único.
- Prédios em solo verificam toda a largura da base contra colunas submersas. Novos biomas selecionáveis: Tecnópolis (solo quase plano, rampas e transportadores aéreos), Ilhas Celestes (quatro ilhas grandes, plataformas móveis de resgate que impulsionam tanques, queda fatal fora do mapa) e Campo Plano (solo exatamente nivelado, plataformas e estruturas).
- 329 testes automatizados aprovados, incluindo 7 testes novos; cliente Playwright oficial e captura visual dos três biomas sem erros de página. TODO: validar desempenho e legibilidade das ilhas e do gelo em iPhone/Android reais e partidas longas de dez jogadores.

## Mina aquática e nado Anfíbio — 2026-10-21

- Mina aquática agora é um corpo físico inativo em terra (quique, rolagem e 40 HP por contato direto, sem detonar). Ao tocar água, arma e boia; contato posterior com tanque, parede ou estrutura dispara a explosão de 100 HP. A renderização diferencia claramente os dois estados, com pulso vermelho, ativação aquática, som de queda próprio e detonação visual/sonora sincronizada.
- Quedas na água não causam dano em nenhuma classe. O Anfíbio acumula subida ao nadar para cima e, saindo da superfície após mergulho, executa um salto curto com partículas de água. Arte do tanque nadando recebeu barbatanas e bolhas animadas.
- Novos testes de mina em terra, ativação na água, colisão com estrutura, parede e tanque, queda de plataforma destruída, pouso na água e salto Anfíbio. QA com o cliente Playwright oficial e `scripts/qa-aquatic-mine.mjs`: capturas da mina inativa, armada, detonação e salto; sem erros de página. O eco de impacto aquático recebeu paleta azul após inspeção da captura. TODO: conferir áudio e vibração em dispositivos mobile reais.

## Defesa dos drones do Especialista — 2026-10-21

- Cada drone ativo, próximo e fora de pane tem uma tentativa independente de 70% para interceptar um projétil que atingiria seu criador. O drone avança até a trajetória antes do tanque, absorve o impacto e é destruído; terreno, plataformas e estruturas podem impedir a manobra.
- A interceptação recebeu rastro azul, rotores em movimento, fragmentos, aviso visual e som sincronizado com o impacto. A descrição da classe e o resumo da carta mostram a nova passiva.
- Testes unitários e de disparo real cobrem chance, segunda tentativa de outro drone, pane, distância, aliado e proteção do dono. `npm.cmd test`: 305/305. Cliente Playwright oficial e QA jogável de dash/impacto executados sem erros; capturas em `output/web-game/specialist-guard/`.

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

## Arpão contra tanques e Corte Fatal furtivo — 2026-10-19

- O Arpão contra outro tanque agora coloca o alvo em estado aéreo, interrompe bolhas/aderência anteriores e o puxa rapidamente até o atirador. Os 30 HP são aplicados no choque; depois, o alvo segue sob gravidade. O Arpão usado para puxar o próprio tanque mantém sua regra anterior e preserva o ataque.
- O Corte Fatal ganhou antecipação, rastro pixelado, cruzamento de lâminas e onda de impacto durante 1,8 s. Se o Ninja já estava invisível, o adversário vê apenas o golpe: o sprite, o indicador e a posição continuam ocultos até a invisibilidade terminar naturalmente. Um tiro comum ainda revela o Ninja.
- Verificação: testes de dano no contato, estado aéreo e visibilidade por jogador; QA Playwright com captura do corte furtivo e partida real com Arpão em `output/web-game/`, sem erros de console. A skill `develop-web-game` guiou a inspeção visual e de estado.

## Aranha em rampas e fantasma do disparo Ninja — 2026-10-19

- A caminhada da Aranha agora consulta a frente do casco para detectar paredes antes de atravessá-las. Degraus baixos são tratados como inclinações caminháveis; a correção de apoio aceita a inclinação e não empurra o tanque de volta. A aderência usa a mesma distância frontal na física, inclusive em paredes à esquerda.
- Um Ninja invisível que atira mantém a invisibilidade e deixa um fantasma pixelado fixo somente no ponto do tiro, por até duas rodadas. Andar, saltar ou usar movimentação depois não desloca o marcador nem entrega as novas coordenadas aos adversários. O dono segue vendo seu tanque normalmente.
- Verificação: testes de parede nos dois sentidos, rampa em degraus, estabilidade após acomodação e visão separada por jogador. Cliente Playwright oficial, QA visual do fantasma, partida real com Aranha, movimento desktop/mobile e suíte completa sem erros. Capturas em `output/web-game/ninja-bomber-reveal/`, `output/web-game/tank-states/` e `output/web-game/drive-qa/`.
- TODO: conferir a sensação de escalada em paredes irregulares de biomas variados e em telas touch físicas.

## Ninja, Aranha, arsenal e estilo das cartas — 2026-10-19

- Ninja agora indica invisibilidade, deixa um fantasma azul destrutível, executa Corte Fatal em dash e recupera Blink ao eliminar. Blink retorna a cada duas rodadas. Aranha ganhou salto de aproximação, mais combustível e velocidade, e aderência sob plataformas flutuantes.
- A rodada inicial libera somente tiro padrão e movimentação; o Obus pesado intensifica a cor com a carga crítica. Entraram Reciclagem Vital, Superaquecer e Dano Dividido, com artes pixeladas próprias no mesmo formato das cartas existentes.
- Incêndios causam 25 HP por rodada durante três rodadas e queimam estruturas e plataformas. Suprimentos podem pousar em superfícies elevadas. O arsenal mobile ganhou grade horizontal compacta para as novas cartas.
- Verificação: 203 testes Node aprovados; QA Playwright desktop/mobile, imagens da biblioteca e seleção do arsenal sem erros de console em `output/web-game/arsenal-art-v4/`.

## Equipes, lobby e consulta de classe — 2026-10-19

- Cores fixas por equipe desde o saguão (inclusive Coop), com miniaturas das artes de classe e das três cartas do arsenal. A configuração de Fogo Amigo aparece nos modos em equipe e fica desligada por padrão; tiros/explosões, laser, investida e incêndio respeitam a escolha.
- Os spawns de cada equipe ocupam uma faixa horizontal própria; posições seguras variam dentro da faixa. Uma segunda camada de plataformas estáticas, altas e largas distribui mais pontos elevados pelo mapa.
- O HUD agora mostra a classe do jogador e abre uma consulta com arte, descrição, destaques e status atual. Também é possível consultar as classes dos outros tanques tocando no placar.
- Testes direcionados de equipes, território, cor, Fogo Amigo e novas plataformas: 83 aprovados. O teste isolado de Caça Voadora agora remove plataformas do cenário para verificar só a trajetória da arma.
- QA de navegador: lobby e HUD conferidos em desktop 1366×900 e mobile horizontal 844×390; botão da classe, detalhes e consulta pelo placar funcionam. Foi corrigido o rótulo da classe que vazava no HUD mobile de 844 px. Capturas em `output/web-game/team-lobby-hud/`, sem erros de console. Suíte completa: 209 testes aprovados, inclusive dano de laser em aliado com Fogo Amigo ligado/desligado.
- O tutorial agora explica as faixas de spawn por equipe, cores compartilhadas, configuração de Fogo Amigo e consulta das passivas no HUD.
- TODO: confirmar legibilidade do lobby e Fogo Amigo em aparelhos reais e em partida multiplayer com mais de um humano.

## Classes e arsenal aleatórios dos bots — 2026-10-19

- Bots agora sorteiam classe e três cartas sem repetição ao criar a sala. Cada carta tem 40% de chance de vir da lista favorável à classe, e 60% de outra carta disponível; armas exclusivas não entram no sorteio inicial.
- Em Vs Equipe, Domínio de Equipe e Coop, bots do mesmo time evitam classes repetidas. Ao humano confirmar uma classe, só os bots conflitantes trocam de classe e arsenal; classes iguais entre humanos continuam permitidas. A regra também é reaplicada quando entra ou sai alguém do saguão.
- Testes automatizados cobrem distribuição de 40%, arsenal válido, lotação de 10 tanques, mudança de classe, humanos com classe igual e atualização de partida ainda em preparação. QA de navegador valida lobby e partida em desktop e mobile horizontal.
- Limite natural: se houver mais de oito bots na mesma equipe, faltam classes distintas para todos; após esgotar as oito classes, uma repetição será inevitável.
- TODO: validar o fluxo de seleção simultânea com vários humanos em dispositivos reais.

## Pulsos de classe, corte Ninja e física do incêndio — 2026-10-19

- Blindado emite pulso de proteção de raio médio a cada rodada: aliados próximos recebem 40% menos dano durante a rodada. Curandeiro emite pulso de +25 HP para si e aliados próximos. Ambos têm anéis e partículas próprios na arena.
- Mochileiro entrega cada powerup ativo coletado a apenas um aliado próximo, com um único uso. Ninja e Blindado não sofrem dano de queda. Blink e Arpão não revelam Ninja.
- Corte Fatal exclusivo do Ninja agora aparece no arsenal com arte própria, prévia reta de 200 blocos, alcança múltiplos adversários até no ar e ignora escudos/armadura. Eliminação recarrega Blink.
- Incêndio dura três rodadas, causa 25 HP por rodada e danifica estruturas/plataformas. Zonas sobre plataformas acompanham o movimento e caem quando o suporte quebra. Haste muda de cor, pulsa e exibe o próximo evento. Bots fixam a direção durante o turno e limitam o gasto de combustível.
- Testes: 222 aprovados, incluindo Arpão/Blink sem revelar o Ninja. Navegador: partida de treino chegou à arena, renderizou HUD e cenário sem erros de página; capturas em `output/web-game/`.
- TODO: validar em multiplayer real os pulsos de equipe e a leitura visual da previsão da Haste em tela pequena.

## Travamento da Furadeira — 2026-10-19

- A revelação gradual da cratera reconstruía o canvas inteiro de 5.600 px a cada ~65 ms. Benchmark no Chromium: média de 153 ms por atualização, provocando bloqueio contínuo da renderização.
- Durante a escavação, o renderer agora repinta somente as colunas de microblocos cuja altura visível mudou. A mesma sequência caiu para cerca de 4 ms por atualização (pico de 28 ms no ambiente de teste).
- Comparação de pixels entre o resultado incremental e uma reconstrução completa da cratera no meio da animação: zero diferenças. A captura visual fica em `output/web-game/drill-fix/drill-halfway.png`.
- Suíte completa: 223 testes aprovados. Partida de treino no navegador chegou à arena sem erros de página; captura em `output/web-game/drill-fix/gameplay.png`.
- TODO: conferir a fluidez em um celular físico de entrada durante múltiplas Furadeiras simultâneas.

## Rodada inicial, Aranha, paraquedas e Superaquecer — 2026-10-19

- Corrigida a seleção do tiro padrão no HUD durante a rodada 1; arsenal ofensivo e modificadores continuam bloqueados até a rodada 2. O fluxo foi confirmado numa partida real de treino no navegador.
- A invisibilidade passiva do Ninja começa apenas depois de dois turnos próprios completos, preservando a exigência de duas rodadas sem dano/revelação. O contador da classe agora parte de 0/2.
- A Aranha salta ao clicar ou tocar no mapa: alcance de 230 blocos, círculo e trajetória com pouso previsto. O servidor valida o mesmo alvo compartilhado com o renderer; o modo de escalada continua permanente após o salto. Confirmado por clique desktop e toque mobile horizontal.
- Paraquedas agora aceita A/D, setas ou controles laterais, gastando combustível para deslocar-se suavemente. A cúpula inclina, exibe fluxo de ar e segue a física até pousar; abrir o paraquedas cancela subida residual. Confirmado em navegador e teste de física.
- Superaquecer foi convertido de bomba em pulso centrado no tanque com raio de 330 blocos, dano de queimadura de 25 HP/rodada por três rodadas em inimigos, estruturas e plataformas. Não cria projétil; a carta e o botão indicam ativação de pulso. Anel de calor/partículas dura 2 s e a câmera acompanha. Bot só ativa perto de alvos.
- Suíte completa: 227 testes aprovados. Playwright: tiro padrão na rodada 1, salto da Aranha por clique e toque, voo dirigido de paraquedas e Superaquecer ao vivo, sem erros de página. Capturas em `output/web-game/`.
- TODO: conferir sensação de direção do paraquedas e legibilidade do pulso em celulares físicos de tamanhos variados.

## Prévia do Blink — 2026-10-19

- O Passo Relâmpago/Teleporte agora usa um resolvedor compartilhado de pouso seguro entre cliente e servidor. Prévia apresenta régua horizontal de alcance, distância ao toque, alvo e silhueta do tanque no pouso real; pontos inválidos ficam vermelhos e não enviam ação.
- Desktop: mover o cursor atualiza a prévia. Mobile: tocar e arrastar atualiza antes de soltar, preservando gesto de pinça para zoom.
- Validação: partida de treino abriu no Chromium sem erros de página; capturas da régua, pouso válido e alvo fora do alcance inspecionadas em `output/web-game/blink-smoke/`. O teste de integração confirma que o destino aplicado pelo servidor coincide com a prévia. Suíte completa: 230 testes aprovados.
- TODO: conferir a legibilidade da régua e do rótulo do Blink em um celular físico pequeno, especialmente perto das bordas da arena.

## Camuflagem inicial do Ninja — 2026-10-19

- A primeira invisibilidade do Ninja conta dois turnos concluídos por outros jogadores, excluindo o turno do próprio Ninja; pode ativar ainda na rodada 1. Dano ou ação reveladora reinicia essa espera; depois da primeira ativação, a recarga existente por rodadas permanece.
- O estado de camuflagem e a contagem dos turnos alheios aparecem na descrição da classe e em `render_game_to_text`. Testes específicos cobrem ativação no quarto turno da rodada 1, reset por dano e recarga posterior.
- Validação no Chromium em partida real de quatro jogadores: o Ninja continuou visível após um turno de outro jogador e ficou invisível após o segundo, ainda na rodada 1 (`output/web-game/ninja-first-cloak/playing-cloaked.png`), sem erros de página. Suíte completa: 231 testes aprovados.
- TODO: conferir em celular físico a legibilidade do aviso de camuflagem quando o Ninja fica invisível fora do turno próprio.

## Sincronia da destruição dos tanques — 2026-10-19

- O som e a vibração de eliminação agora começam junto da fragmentação visual do tanque, após a animação pendente do projétil/evento. O aviso no registro de combate continua imediato.
- Removido o disparo antecipado pelo snapshot de rede, que no mobile também podia suprimir completamente o som quando havia projétil em voo.
- Verificação no navegador: atualização visual adiada não emite som; ao aparecerem os fragmentos, o som dispara uma única vez. Suíte completa: 231 testes aprovados; smoke test do cliente sem erros.

## Assinaturas de disparo — 2026-10-19

- O clarão, a fumaça e as partículas saem do início real da trajetória e acompanham sua direção, inclusive com a mira inclinada. As famílias cinética, pesada, atômica, elétrica, laser, fogo, gelo, perfurante, gravidade, bolha, arpão, fogos, fragmentária, drone, sísmica, caça voadora e armas posicionáveis têm cores e densidades próprias.
- Sons de lançamento novos para fogo, gelo, AP, gravidade, bolha, arpão, caça e posicionáveis foram gerados a partir do sintetizador do jogo para o áudio nativo mobile; o desktop usa variações procedurais correspondentes.
- Modificadores de tiro como Molotov, congelamento, AP, onda de choque, perfurador, ponte, guiado e explosão ampliada também alteram a assinatura do disparo; reciclagem vital usa efeito de suporte verde.
- Testes unitários cobrem perfis, orientação da trajetória, seleção dos sons nativos, validade e volume mínimo dos WAVs. O arpão e a sentinela ficaram baixos na primeira medição e tiveram a mixagem reforçada.
- Partida real no Chromium confirmou tiro padrão (25 partículas) e Obus (49 partículas), emitidos pelo próprio jogador, mais prévias visuais de Zeus, Gravidade e Bolha; sem erros de página. Capturas em `output/web-game/shot-launch/`. O clarão recebe escala compensatória em zoom afastado. Playwright oficial executado e imagens inspecionadas.
- Suíte final: 234 testes aprovados; teste de qualidade de áudio comprovou os oito novos sons mobile distintos e audíveis.
- QA final repetido com o áudio habilitado: sons do tiro padrão e Obus foram invocados durante os disparos reais do jogador, no mesmo fluxo em que os efeitos de cano surgiram; sem erros de console.
- TODO: conferir volume relativo e legibilidade de cada efeito em aparelhos iOS e Android físicos.

## Corte Fatal direcional e atalhos de combate — 2026-10-19

- Corte Fatal do Ninja passou a ter dois dashes retos independentes, inclusive ida/volta, até 340 blocos por ativação e 80 HP por acerto. A prévia usa o mesmo cálculo do servidor, atravessa solo, prédios e plataformas, e só exige destino final livre para o tanque não ficar preso.
- O primeiro corte preserva a ação para a segunda mira após a animação; bots também completam a dupla ativação. Eliminações adiam o encerramento: 3 s com o tanque se repartindo, câmera travada no alvo, depois explosão e fragmentos. O som da destruição é disparado com a explosão.
- Arpão e demais disparos, Blink, Teleporte e troca Sacana funcionam no ar ou sob paraquedas; teleportes cancelam corretamente o estado de queda sem consumir o ataque restante. O canvas não interpreta um toque de mira como comando de paraquedas quando outra carta está equipada.
- Q/W/E selecionam as três cartas do arsenal; 1–9 e 0 selecionam até dez powerups; R volta ao tiro padrão e C seleciona o Corte Fatal. As teclas ficam indicadas no HUD desktop e não agem durante a digitação. F continua reservado para tela cheia.
- Testes: 237/237 na suíte Node e QA Playwright de partida real com seleção de atalhos, prévia direcional e eliminação animada (`scripts/qa-fatal-dash-hotkeys.mjs`). Capturas em `output/web-game/fatal-dash-hotkeys/`; cliente oficial da skill também executado.
- TODO: conferir os atalhos em teclados físicos variados e testar o toque de precisão do Corte Fatal em iPhone/Android reais; o QA automatizado cobriu desktop.

## Investida com mira e Superaquecer passivo — 2026-10-19

- A Investida Blindada agora segue a direção apontada no canvas (mouse ou toque) e também pode ser acionada pelo botão INVESTIR. A prévia compartilhada com a física do servidor destaca o pouso e as paredes rompidas; no ar, indica o impulso previsto. A/D continua disponível.
- Superaquecer equipado funciona desde o começo como passiva: cada 2 turnos inimigos concluídos emite um pulso de 480 blocos, causa 25 HP a inimigos no raio e danifica estruturas/plataformas. Turnos aliados não contam; Tesla pausa a carga. O HUD mostra `0/2` ou `1/2`, com aura térmica permanente e pulso animado.
- Munição, caixas e rerrolagem foram ajustadas para não tratar a passiva como disparo. Cartas e descrições foram atualizadas.
- Validação: 239/239 testes Node, cliente Playwright oficial e QA de partida real em desktop e mobile horizontal, com captura de prévia, pulso e comando de toque em `output/web-game/dash-superheat/`; sem erros de página. Pulsos simultâneos também permanecem visíveis individualmente.
- TODO: conferir em aparelhos físicos o conforto do toque direcional e a legibilidade do contador da passiva no HUD compacto.

## Entrada, minimapa e Inundação — 2026-10-20

- A entrada ficou mais legível e reorganizada: criação de sala em destaque, atalhos de partida rápida/treino e regras avançadas recolhidas. Fundo em canvas usa microblocos do jogo, quatro paletas de bioma e ciclo animado de dia/noite.
- Tiro padrão agora inicia selecionado e volta a ficar selecionado no começo de cada turno ou após uma carta indisponível. Minimapa recebe arraste por mouse/toque e preserva a câmera escolhida por alguns segundos no modo dinâmico.
- O evento Inundação foi adicionado às regras e à biblioteca com arte própria. Nuvens se acumulam e escurecem o céu, chuva animada cai, bacias de solo se abrem progressivamente e viram lagos; a água remove incêndios na área.
- Validação: 241/241 testes Node; QA Playwright da tela inicial desktop/mobile e de partida real com seleção padrão e arraste do minimapa em `scripts/qa-weather-ui.mjs`, sem erro de página. Carta Inundação verificada na biblioteca; cliente oficial da skill executado. Arte e direção de arte documentadas.
- TODO: detalhar física de tanques e objetos na água, escoamento após destruição das bordas e QA em dispositivos físicos.

## Física hídrica e sequência de tempestade — 2026-10-20

- Lagos agora reduzem a velocidade dos tanques submersos e aumentam o consumo de combustível; pousos na água amortecem metade do dano de queda e têm respingos em microblocos. Minas submersas são desativadas, incêndios se apagam e objetos molhados deixam de queimar. Ao abrir um buraco no fundo, o lago escoa em 1,8 segundo, inclusive no minimapa.
- Uma ocorrência climática começa com chuva e nuvens acumuladas. Ao terminar o aviso, sorteia Inundação ou Raios com 50% de chance para cada quando ambos estão habilitados; após a animação, o Vendaval fecha a sequência se também estiver habilitado. O jogo espera os efeitos concluírem antes de iniciar a etapa seguinte, e mantém o turno pausado. A fase de chuva não marca antecipadamente os pontos de impacto nem toca trovão antes dos raios.
- As cartas e visuais dos três eventos continuam no estilo pixel art já aprovado. Descrições da biblioteca explicam a sequência, o sorteio e as novas interações da água.
- Validação: 244/244 testes Node, cliente Playwright oficial, partida de treino com captura desktop e QA da entrada/mobile sem erros de página.
- TODO: chuva leve por bioma, transição gradual após o Vendaval e validação de áudio/controles/desempenho em iPhone e Android reais.

## Clima ambiente e encerramento da tempestade — 2026-10-20

- Chuva leve intermitente, com intensidade própria para planície, plataformas e ilhas, usa ciclo determinístico por semente e transições suaves. A chuva da sequência de eventos se sobrepõe ao clima ambiente sem cortes bruscos.
- A chuva intensa diminui gradualmente durante o aviso de Vendaval. Depois da animação de 3 s, nuvens e vento se dissipam em 6,5 s. O aviso de Vendaval agora é legível em coordenadas de tela e não exibe falso marcador de impacto no centro da arena.
- QA em partida real com bot confirmou chuva ambiente e tiro padrão; QA visual com estado real do servidor percorreu chuva → Inundação → Vendaval → dissipação, com capturas em `output/web-game/climate-cycle/` e nenhum erro de navegador. Suíte Node: 247/247 testes. Ainda falta validar áudio, controles e desempenho em aparelhos físicos.

## Perfil da água em partidas longas — 2026-10-20

- O desenho dos lagos agora ignora colunas fora da câmera e preserva o alinhamento dos microblocos ao aproximar ou afastar o zoom.
- QA de carga com 24 lagos, mapa completo e zoom próximo em `scripts/qa-water-load.mjs`; no Chromium local, o custo isolado do desenho da água no zoom próximo caiu de aproximadamente 1,6 ms para 0,2–0,4 ms por chamada. As capturas `output/web-game/water-load/` foram inspecionadas e não houve erros de página.
- Cliente Playwright oficial e suíte Node executados após a alteração; 247/247 testes passaram. TODO: verificar desempenho total, áudio e legibilidade da chuva em aparelhos físicos; avaliar a apresentação de lagos sobrepostos após muitos eventos de Inundação.

## Expansão de classes e cartas — 2026-10-20

- Iniciado o ciclo previsto no plano: Engenheiro com Sentinela extra, +1 durabilidade em estruturas próprias e reparo de 1 casco por rodada; Kit de Reparos coletável cura 25 HP e repara duas estruturas aliadas próximas.
- Duas artes pixel art individuais adicionadas sem deslocar o atlas original; biblioteca, seleção, lobby, HUD, miniarte e sinergia de bot conectados. Testes de regra e mapeamento adicionados.
- QA com navegador verificou biblioteca, seleção de classe em desktop/mobile horizontal e HUD de batalha com Sentinela extra. As novas artes apareceram corretamente e não houve erro de página. Cliente Playwright oficial executado; `scripts/qa-engineer.mjs` cobre os fluxos novos.
- `scripts/qa-water-load.mjs` passou após a equalização de 24 lagos: 865 retângulos no mapa inteiro contra 747 no zoom local e cerca de 0,25 ms por desenho. Suíte completa: 251/251 testes. TODO: balanceamento em partidas longas e validação de miniaturas/desempenho em aparelhos físicos.

## Continuação — classe Incendiário e Espuma de Combate

- Incendiário recebe Molotov na rodada 2 e depois a cada 3 rodadas. Fogo próprio de Molotov/barril dura 4 rodadas, causa 35 HP por rodada e poupa o dono enquanto a passiva estiver ativa; Tesla a suspende.
- Espuma de Combate apaga fogo próximo, remove marcas de queima de estruturas/plataformas e bloqueia fogo nesta e na próxima rodada. Efeito de pulso azul, partículas e aro de proteção no tanque.
- Artes pixel art individuais salvas em `client/assets/incendiary-class-v1.png` e `client/assets/fire-foam-card-v1.png`, com integrações à biblioteca, HUD e lobby. Testes focalizados cobrem duração, dano, imunidade, concessão do Molotov, proteção temporária e atlas.
- TODO: inspecionar novo grid de 10 classes no mobile horizontal e a nova carta no navegador; executar suíte completa; avaliar balanceamento em partidas longas.

## Expansão aquática e Elementalista — 2026-10-20

- Anfíbio, Canhão de Água, física de submersão, Boia, Caçador Aquático, Mina Aquática e três Torpedos Aquáticos implementados com artes próprias. O jato ascendente lança tanques e a Propulsão drena lagos conectados.
- Elementalista possui quatro bombas sorteadas a cada turno: Fogo, Água, Vento e Terra. O vórtice dura duas rodadas, move-se com o vento, levanta tanques/objetos/powerups e incendeia ao cruzar fogo. Novas artes de classe e de cada bomba em `client/assets/`.
- Vórtice também acelera tiros comuns, vetoriais, granadas e Bomba Marcadora para o alto. GPS que cruza um vórtice passa à trajetória balística guiada para respeitar a força. A prévia de mira usa a mesma função compartilhada de desvio.
- Novo visual de coluna em microblocos com anéis, detritos ascendentes, aviso de desvio e partículas de ignição. Três timbres próprios com WAVs nativos gerados para mobile: surgimento, desvio e fogo. Os sons disparam apenas nos respectivos eventos.
- Suíte Node após integração: 264/264 testes (incluindo casos novos de cada bomba elemental e do desvio); teste randômico do Mochileiro corrigido para aceitar Superaquecer passivo com munição zero. Cliente Playwright oficial executado e `scripts/qa-elemental-vortex.mjs` capturou prévia da mira, trajetória desviada e ignição em `output/web-game/elemental-vortex/`; as três imagens foram inspecionadas, sem erros de página.
- TODO: implementar a classe Especialista e a interação de reposicionar drones/Sentinelas/Hastes. Portal explicitamente adiado pelo jogador. Validar áudio, toque e desempenho em iPhone/Android físicos; ajustar balanceamento de vórtices simultâneos em partidas longas.

## Especialista e drones estruturais — 2026-10-20

- Classe Especialista implementada com arte pixel art individual existente: primeiro drone na rodada 2, mais um nas rodadas pares. Drones voam, têm corpo microblocado/rotores animados e fazem rajadas de cinco projéteis (até 25 HP por alvo) em até três inimigos; os drones do mesmo dono priorizam o mesmo alvo.
- Cada drone é uma estrutura de um único acerto: bloqueia e recebe tiros, laser e eventos, entra em pane por Tesla/pulso e serve de âncora aérea para Arpão, Blink e Teleporte. O tanque volta à física de queda depois de alcançá-lo.
- O Especialista pode selecionar por toque/clique e mover drones, Sentinelas e Hastes de qualquer jogador num raio de 850 blocos, uma vez por estrutura por turno. Prévia visual do alcance/destino, animação de deslocamento e som de seleção; powerups de teleporte têm prioridade quando equipados para que também possam usar o drone como ponto de apoio.
- Corrigido suporte de plataforma obsoleto que impedia o Anfíbio de nadar após a remoção da plataforma. Suíte Node: 268/268 testes; QA Chromium em `scripts/qa-specialist.mjs` capturou controle e metralhadora sem erros de página. Cliente Playwright oficial também executado.
- TODO: validar toque/arrasto, áudio e desempenho com vários drones em iPhone/Android físicos; balancear densidade máxima de drones em partidas longas. Portal permanece adiado conforme pedido do jogador.

## Aranha, Ninja e estruturas interativas — 2026-10-19

- Aranha agora salta até 380 blocos e interrompe o arco no primeiro contato físico com solo, parede, plataforma ou estrutura. A aderência registra a face atingida; o tank pode caminhar sob plataformas/estruturas, contornar laterais e retornar ao topo sem perder o modo Aranha.
- O Blink deixou de ser recompensa/passiva do Ninja e foi removido das afinidades e descrições da classe. O Corte Fatal permanece como sua mobilidade ofensiva exclusiva em dois dashes.
- Três estruturas passaram a fazer parte de todo mapa: Gerador de Escudo (domo de 185 blocos, três cargas e 50% de redução explosiva), Repulsor Cinético (onda de 220 blocos a cada impacto e explosão de sobrecarga) e Terminal de Munição (recarrega uma arma vazia e 55 de combustível por tank a cada três turnos; destruído, libera uma caixa de munição).
- As novas estruturas bloqueiam projéteis/GPS, aceitam Laser, Arpão e aderência da Aranha, caem quando perdem suporte, danificam estruturas vizinhas e rendem pontos de destruição. O renderer mostra alcance, durabilidade, energia, pulsos, reabastecimento e textos de combate próprios.
- Validação: 244/244 testes Node aprovados. QA Playwright dedicado sem erros em `scripts/qa-spider-ninja.mjs` e `scripts/qa-interactive-structures.mjs`; capturas inspecionadas em `output/web-game/spider-ninja/` e `output/web-game/interactive-structures/`. O cliente oficial da skill também foi executado e inspecionado.
- TODO: conferir em celular físico a escala do domo e dos rótulos das estruturas quando dois efeitos grandes se sobrepõem.

## Abertura do paraquedas por Espaço e toque — 2026-10-19

- Corrigida a abertura do paraquedas depois do Pulo: a ação não depende mais de a carta Pulo continuar selecionada, pois ela é desmarcada assim que o salto começa.
- Durante o voo, Espaço abre o paraquedas no desktop e um toque livre na arena faz o mesmo no celular, inclusive quando outra carta está marcada. Fragmentação, Fogos, Tiro Vetorial e puxão do Arpão em andamento preservam prioridade.
- O aviso contextual agora mostra `ABRIR PARAQUEDAS • Pressione Espaço ou toque na arena`; depois da abertura, volta a orientar A/D e os botões laterais.
- Validação: 244/244 testes Node aprovados, QA Playwright dedicado para teclado e toque sem erros, e captura mobile inspecionada em `output/web-game/parachute-input/`. O cliente oficial da skill também foi executado e inspecionado.
- TODO: conferir a resposta do toque e da vibração em aparelhos iOS e Android físicos.

## Prioridade das ativações do Arpão — 2026-10-19

- A tração do cabo pronto agora tem prioridade consistente sobre armas selecionadas e sobre Pulo/paraquedas em todos os controles.
- ATIRAR, Espaço, Enter e toque na arena enviam uma única ativação do Arpão; a trava de requisição impede comandos duplicados enquanto o servidor inicia a puxada.
- O aviso contextual exibe `PUXAR CABO DO ARPÃO` e lista os quatro controles aceitos, sem mostrar incorretamente a instrução de paraquedas ou a prévia de teleporte nesse estado.
- QA Playwright dedicado confirmou as quatro entradas com outra arma selecionada e com o tank no ar. Testes direcionados do arsenal e da partida: 89/89 aprovados; captura mobile em `output/web-game/harpoon-activation/`.
- TODO: validar a puxada em multiplayer real sob latência alta e com o Arpão preso a uma plataforma móvel.

## Árvores de cenário e evento Tempo de Flora — 2026-10-19

- Todos os mapas agora recebem árvores pequenas, médias e grandes sem consumir as posições obrigatórias das estruturas interativas. Pequenas têm porte próximo ao tank, não bloqueiam projéteis e usam a copa em primeiro plano como cobertura visual; médias bloqueiam tiros e quebram com facilidade.
- Árvores grandes têm tronco alto e largo mais cinco níveis/conjuntos de galhos feitos de microtrechos de madeira. Os trechos sustentam tanks, permitem condução contínua entre segmentos adjacentes, bloqueiam projéteis e podem ser perfurados individualmente; ao perder o apoio, o tank cai pelo buraco. Tronco e galhos acompanham a física de queda quando o solo é removido.
- Explosões, Laser, estruturas encadeadas e eventos destrutivos danificam árvores. Incêndios causam dano ampliado na madeira, acendem a copa, criam novas zonas de fogo para árvores próximas e deterioram galhos duas vezes mais rápido que plataformas comuns.
- O novo evento TEMPO DE FLORA espalha núcleos de bosque, mata densa e sementes ancestrais. Ao germinar, cada núcleo cria uma composição diferente de árvores, inclusive gigantes, sem escavar o terreno. O seletor, catálogo, alerta, áudio, câmera e `render_game_to_text` reconhecem o evento, as árvores, cobertura e galhos.
- Validação: 250/250 testes Node; cliente Playwright oficial executado; QA dedicado sem erros em `scripts/qa-flora-trees.mjs`. Capturas inspecionadas em `output/web-game/flora-trees/` cobrem os três portes, tank oculto, galhos caminháveis/danificados, propagação do fogo e aviso de sementes.
- TODO: medir em partidas longas e aparelhos móveis físicos o custo visual de vários bosques ancestrais acumulados; caso necessário, limitar apenas a densidade de folhas fora da câmera, sem reduzir a física dos galhos.

## Ilhas, árvores secas e balanceamento — 2026-10-20

- O saguão mostra o cenário resolvido; o bioma Ilhas cria lagos desde o início. A largura jogável varia com o número de tanques, reduzindo duelos para 3.200 blocos.
- Árvores de geração e do Tempo de Flora verificam toda a base contra colunas submersas; as sementes de Flora também evitam os lagos.
- Engenheiro removido, Incendiário atira três labaredas extras por disparo; Anfíbio regenera 30 HP por rodada na água e Especialista mantém no máximo três drones.
- QA Chromium dedicado capturou saguão, Ilhas e labaredas; imagem do arquipélago inspecionada. Teste de regressão de árvores no lago adicionado.
- Pendente: testes em dispositivos físicos e balanceamento estatístico após partidas reais.

## WASD, alavanca de movimento e Aranha invertida — 2026-10-20

- Movimento desktop passou a aceitar A/S/D/W e setas; na água W/S controlam a profundidade. Tanques comuns afundam quando param de subir; Anfíbio e Boia preservam a profundidade. A alavanca mobile de quatro direções fica no HUD, independente da mira.
- Aranha invertida requer duas pressões separadas para baixo para desprender-se do teto, então entra em queda física. O gesto contínuo da alavanca não conta duas vezes.
- Arsenal usa Q/E/R/T; os números continuam nos powerups, V seleciona o tiro padrão e Y abre o chat. Tutorial, HUD e dicas foram atualizados.
- Testes automatizados de água e Aranha passaram. O cliente Playwright oficial e o QA de movimentação desktop/mobile rodaram sem erros; capturas de jogo foram inspecionadas.
- Pendente: testar a alavanca e o duplo toque em iPhone/Android físicos, além de avaliar se o tamanho do controle fica confortável em celulares pequenos.

## Pulsos, vórtice e novo sorteio de cenário — 2026-10-20

- Corrigida a atualização da partida: mudanças contínuas de vórtice, queda, água ou pulso não interrompem mais a verificação do relógio, da ação dos bots e dos eventos. Um teste reproduz o turno expirado com vórtice ativo.
- O vórtice elemental agora só surge e começa a agir quando o projétil chega ao impacto; a prévia e a simulação ignoram vórtices ainda pendentes. Teste cobre a transição exata.
- Desenho de pulsos grandes sem blur de círculos extensos e com descarte fora da câmera; vórtices usam menos microblocos em zoom distante ou quando vários estão ativos.
- O anfitrião pode sortear um segundo cenário exatamente uma vez no saguão. Em bioma aleatório, muda o bioma e a semente; em bioma fixo, muda a semente/relevo. O resultado e a semente aparecem para todos, e a ação é bloqueada após o começo da partida.
- `npm test`: 290/290. Cliente Playwright oficial, QA dedicado de saguão desktop/mobile, QA de Superaquecer e QA de vórtice executados sem erros de navegador. Capturas em `output/web-game/pulse-vortex-reroll/`, `output/web-game/dash-superheat/` e `output/web-game/elemental-vortex/` inspecionadas.
- Pendente: verificar desempenho e resposta do toque em iPhone/Android físicos com vários pulsos/vórtices simultâneos.

## Incêndio, água elemental, árvores e sorteio livre — 2026-10-20

- Incendiário deixou de ganhar Molotov automaticamente: cada disparo cria incêndio no impacto, além das três labaredas; fogo próprio mantém +10 HP, +1 rodada e imunidade do dono. O fogo acompanha plataformas, cai quando perde suporte, deriva com o vento e agora mostra fumaça e um destaque vermelho no tanque queimado.
- A bomba elemental de água inicia o enchimento no ponto do impacto: a lâmina d'água sobe e se expande em 1,9 s, com microblocos de água no efeito; a onda dá impulso a tanques próximos.
- O anfitrião pode sortear novos cenários sem limite antes de iniciar. A copa das árvores não intercepta projéteis, mas troncos e galhos estruturais permanecem sólidos. Árvores da geleira usam folhagem de neve; danos deixam falhas, rachaduras e fragmentos visuais.
- `npm test`: 290/290. Cliente Playwright oficial executado; QA de sorteio desktop/mobile, QA de árvores e novo QA visual de fogo/água/geleira sem erros. Capturas inspecionadas em `output/web-game/fire-water-glacier/` e `output/web-game/pulse-vortex-reroll/`.
- Pendente: confirmar sensação da corrente d'água e legibilidade do dano por incêndio em celulares físicos, especialmente com várias explosões simultâneas.

## Água por colunas, silhuetas de classe e granadas do Bombardeiro — 2026-10-20

- Lagos fluidos passam a distribuir o volume entre colunas de 8 blocos. A água se espalha sobre áreas planas, escorre para crateras recém-abertas e vaza gradualmente por aberturas; a renderização mostra superfícies locais e pequenas cascatas. O modelo é de águas rasas, não uma simulação completa de pressão e velocidade em cada célula.
- O Anfíbio se desloca horizontal e verticalmente na água sem consumir combustível, inclusive com o tanque zerado. Servidor, controles desktop/mobile e teste automatizado foram alinhados.
- Os 12 tanques ganharam silhuetas e detalhes pixelados por classe — cascos, acessórios, canhões, antenas, aletas e luzes com movimento — preservando a cor-base da equipe. Galeria de inspeção em `output/web-game/class-tanks/all-classes.png`.
- Além da explosão de 80 HP ao morrer, o Bombardeiro lança duas granadas físicas em direções opostas; elas seguem trajetória, detonam após o voo e afetam solo, estruturas e tanques. Turno e vitória aguardam ambas as detonações. Testes cobrem trajetórias e encerramento.
- QA visual de água, árvores, fogo, classes e voo das granadas executado sem erros de navegador; cliente Playwright oficial também executado. `npm test`: 297/297. A validação em iPhone/Android físicos ainda fica pendente.

## Ondas, bolsões de ar e impulso do Canhão de Água — 2026-10-20

- Explosões submersas e impactos do Canhão de Água e Torpedo Aquático deslocam volume entre colunas do lago; o fluxo redistribui a crista sem criar água. Ondas de superfície, respingos e bolhas seguem o estado replicado da partida.
- Lagos profundos geram bolsões de ar estáveis, visíveis por colunas de bolhas. Um tanque submerso que entra no bolsão sobe até a superfície e é lançado para fora dela, com animação e tempo de reutilização para evitar impulsos contínuos.
- O Canhão de Água apontado para o solo próximo mostra `IMPULSO ↑` na mira e lança o próprio Anfíbio apenas quando o jato colide; a câmera acompanha o voo e o turno espera a aterrissagem.
- Testes específicos cobrem conservação de volume, explosão seca/submersa, torpedos, bolsão e impulso. Suíte completa: 301/301. Cliente Playwright oficial e QA de cenário jogável em `scripts/qa-water-impact.mjs` executados; captura em `output/web-game/water-impact/underwater-explosion.png` inspecionada sem erros de navegador.
- Pendente: validar contraste das bolhas e sensação do impulso em iPhone/Android físicos; o modelo hídrico continua sendo de águas rasas por coluna, não uma simulação 2D completa.

## Jato contínuo, vórtice gravitacional e artes v4 — 2026-10-21

- Pull inicial de `origin/main` antes das edições: `a2a8d90` → `ce92a4b`. O Canhão de Água agora mantém o jato por 2 segundos, reaplicando impulso em tanques alinhados; a emissão só libera o turno ao final. O fluxo apaga incêndios em solo/árvores/plataformas e agita lagos ao longo do trajeto.
- A Bomba de Propulsão mantém o campo atrativo por 4 segundos depois da chegada do projétil. A força acelera tanques continuamente, desprende-os de solo e plataformas e continua movendo objetos próximos. O cliente recebe os deslocamentos mesmo enquanto há animação de tiro.
- Novas artes independentes `-v2` de Canhão Cinético, Morteiro Criogênico e Salva Meteórica, criadas no padrão pixel art das cartas e ligadas à Biblioteca/HUD. As versões anteriores foram preservadas.
- `npm.cmd test`: 312/312, incluindo emissão de 2 segundos também em partidas aceleradas. Cliente Playwright oficial executado; QA de gameplay `scripts/qa-continuous-forces.mjs` inspecionou jato sustentado, voo e impacto do vórtice e as três cartas. Capturas em `output/web-game/continuous-forces/`, sem erros de navegador.
- Pendente: validar sensação de empurrão/atração e contraste das miniaturas em iPhone e Android físicos; o modelo da água permanece de águas rasas por coluna.

## Interação dinâmica do Canhão de Água — 2026-10-21

- Corrigida a força do jato atravessando obstáculos: a colisão contínua usa o fim real da trajetória, não o alcance máximo teórico. Fogo e tanques atrás de estruturas ficam protegidos.
- Um tanque que cruza o jato após o disparo recebe dano uma única vez e é acelerado enquanto permanece no fluxo. O servidor publica o contato tardio e o cliente mostra dano em ciano e respingos. Testes direcionados cobrem entrada tardia, repetição e bloqueio por estrutura.
- `npm.cmd test`: 314/314. Cliente Playwright oficial executado; `scripts/qa-continuous-forces.mjs` verificou contato tardio, aviso de dano e efeito visual em jogo, além do jato e vórtice anteriores, sem erros de navegador. Captura em `output/web-game/continuous-forces/water-jet-late-hit.png` inspecionada.
- Pendente: validar sensação de empurrão e legibilidade do aviso em aparelhos físicos; ainda falta simulação hidráulica 2D para fluxo subterrâneo/pressão realista.

## Apoio de objetos atraídos pelo vórtice — 2026-10-21

- O deslocamento de objetos agora preserva vínculos físicos: galhos acompanham árvores grandes e a bola acompanha guindastes. Objetos deixam o apoio de plataformas ao serem puxados e a largura jogável limita seu deslocamento.
- O apoio é recalculado durante o campo em intervalos de pelo menos 100 ms e ao expirar, evitando objetos flutuando sobre bordas e reutilizando dano/fragmentação por queda do cenário. Testes direcionados cobrem barril que cai e alinhamento dos galhos.
- `npm.cmd test`: 316/316. Cliente Playwright oficial e QA de gameplay `scripts/qa-continuous-forces.mjs` executados sem erros; a captura `output/web-game/continuous-forces/gravity-barrel-landed.png` mostra o barril no patamar inferior após cair 120 blocos.
- Pendente: revisar colisões laterais de construções grandes e desempenho em celular físico.

## Salva Meteórica — animação de impacto — 2026-10-21

- Os dois meteoros secundários agora descem visivelmente do céu com rastro, fumaça e marcação do alvo; cada colisão tem explosão, onda de choque, partículas persistentes e som próprio no desktop/mobile.
- Câmera e fim do turno aguardam a sequência completa. O terreno, os tanques e os números de dano só são revelados após os impactos visuais, evitando crateras antecipadas.
- Validação: 322 testes automatizados; QA Playwright `scripts/qa-meteor-visual.mjs` confirmou duas quedas, dois sons, retenção do estado visual e ausência de erros. Capturas em `output/web-game/meteor-visual/`.
- Pendente: conferir intensidade do áudio e legibilidade dos meteoros em celular físico.

## Tornados do Vendaval e Placa Tornado — 2026-10-21

- Vendaval agora sorteia dois tornados com 35% de chance. Aviso/zoom e animação mostram ambos; os campos surgem no final da ventania e expiram após quatro turnos. Reutilizam desvio de projéteis e elevação de tanques, objetos e powerups, sem travar o avanço de turnos.
- Nova Placa Tornado no arsenal: arremesso sem explosão, mini tornado fixo de 165 × 330 blocos por duas rodadas, recarga de três turnos próprios. Balística, física e efeito sonoro próprios.
- Artes pixel art criadas pelo gerador de imagem integrado e copiadas para `client/assets/arsenal-v4/windPlate.png` e `client/assets/flora-event-v1.png`; Biblioteca e HUD consomem as artes corretas.
- `npm.cmd test`: 331/331. Cliente Playwright oficial executado; QA `scripts/qa-tornado-plate.mjs` inspecionou as duas cartas, a Placa ativa e dois tornados simultâneos, sem erros de navegador. Capturas em `output/web-game/tornado-plate/`.
- Pendente: medir contraste e fluidez dos tornados em iPhone/Android físicos; avaliar se a placa precisa de ajuste de recarga após partidas reais.

## Cenário tecnológico — 2026-10-21

- Tecnópolis ganhou céu digital e horizonte de megaprédios, sem montanhas naturais. Prédios físicos agora têm fachada tecnológica iluminada e exibem dano.
- Geração de árvores, guindastes e torres comuns foi removida desse bioma; solo e plataformas altas recebem instalações interativas. Tempo de Flora passa a montar equipamentos sintéticos na Tecnópolis, sem criar vegetação.
- Validação: 332/332 testes automatizados, QA de renderização Chromium para Tecnópolis e cliente Playwright oficial sem erros de página. Captura: `output/web-game/sky-ice-fire/technology.png`.
- Pendente: conferir contraste e desempenho da nova paisagem em aparelhos móveis físicos; ajustar densidade das instalações após partidas reais.

## Biblioteca com demonstrações animadas — 2026-10-22

- Cada uma das 97 cartas atuais da biblioteca ganhou `VER AÇÃO`, que abre uma demonstração ilustrativa em canvas pixel art com três etapas. As artes estáticas originais continuam nas cartas.
- Famílias visuais específicas mostram disparos, explosões, escudos, deslocamento, cura, água, gelo, fogo, vórtices, estruturas e eventos. Suprimentos usam helicóptero/paraquedas; bombardeio tem miras e quedas verticais; raios, tempestade e inundação têm tratamentos próprios.
- Uma única animação roda por vez; pausa, reinício, teclado e preferência por movimento reduzido são respeitados. O modal foi ajustado para mobile horizontal.
- Cobertura de todos os tipos em `test/library-previews.test.js`; `npm.cmd test`: 338/338 após integrar as mudanças remotas. Cliente Playwright oficial e QA visual/de interação `scripts/qa-library-previews.mjs` passaram sem erros, inclusive em viewport mobile horizontal. Capturas em `output/web-game/library-previews/`.
- Pendente: validar legibilidade, fluidez e toque em iPhone/Android físicos.

## Alavanca e resposta tátil mobile — 2026-10-22

- A alavanca de movimento mantém o fluxo de pacotes ao trocar de direção durante o mesmo arrasto; no chão, desvios verticais do dedo não cancelam o movimento horizontal. Área de toque e indicador visual ampliados.
- O teste de vibração usa pulsos mais perceptíveis e informa quando a API não existe. No iPhone, Chrome/Safari não expõem vibração física para páginas; permanece o efeito visual/sonoro.
- TODO: validar tato e ergonomia em Chrome/Android físico e iPhone físico; testes automatizados não conseguem comprovar acionamento do motor do aparelho.
- Verificação: 338 testes passaram; QA do movimento confirmou troca direita→esquerda no mesmo toque e comandos verticais na água; QA da vibração cobriu API disponível e iPhone sem API. Cliente Playwright oficial e capturas de jogo inspecionadas sem erros de página.

## Gravações reais na biblioteca — 2026-10-22

- A biblioteca prioriza 59 vídeos MP4 capturados do motor de combate e do renderizador reais: 33 armas de disparo, 14 modificadores de tiro e 12 eventos. Os clipes são carregados sob demanda, podem pausar/reiniciar e recuam para a demonstração ilustrativa se o vídeo não carregar.
- O gerador reproduz tiros e eventos em cenas de teste determinísticas. Fragmentário, Fogos, Tiro Vetorial e Arpão incluem segunda ativação; Zeus, Intervenção dos Céus, Carga Sísmica e Bomba Marcadora incluem a segunda etapa atrasada. O enquadramento dos disparos foi ajustado para legibilidade no mobile.
- `npm.cmd test`: 339/339. QA Playwright da biblioteca confirmou vídeo, fallback, pausa/reinício, layout mobile horizontal e ausência de erros de página. Cliente Playwright oficial executado; capturas em `output/web-game/library-previews/`.
- Pendente: gravar classes, poderes passivos e ações sem disparo com demonstrações fiéis; validar decodificação H.264 e legibilidade em iPhone/Android físicos. Os clipes não incluem áudio.

## Revisão de prévias, quatro armas e gelo — 2026-10-22

- A pedido do usuário, removidos os 59 vídeos MP4 e o carregador/gerador correspondentes. A biblioteca voltou às prévias ilustrativas animadas, com pausa e reinício; o QA de desktop/mobile passou sem erros de página.
- Enxame de Drones agora agenda três mísseis sequenciais após o marcador e procura alvos próximos, respeitando cobertura superior. Bomba de Terra anuncia a deformação, cria barreira ou cratera conforme o ângulo e acrescenta até 18 HP de dano tectônico mais armadura fraturada por um turno.
- Canhão Cinético lança alvos no ar com momento direcional. Mina Aquática armada deriva sobre a água com vento e relevo, detectando obstáculos em subetapas; inativa mantém física de granada no solo.
- Gelo: deslizamento residual após soltar o movimento, continuidade da velocidade ao perder a plataforma, crostas e plataformas com textura de microblocos, rachaduras e estilhaços, e tanque congelado visivelmente encapsulado.
- 338/338 testes passaram; QA Playwright da biblioteca e cenas reais de marcador/impacto, gelo e mina sem erros de página; cliente Playwright oficial executado e capturas inspecionadas. TODO: validar ritmo, legibilidade e desempenho das partículas em aparelhos reais e partida longa.

## Nuvens Caçadoras e vento — 2026-10-22

- A nuvem do Meteorologista permanece no local no primeiro turno e, a partir do próximo, deriva na direção do vento; com vento calmo, procura o inimigo mais próximo lentamente. A chuva continua apagando incêndios e o raio permanece possível.
- Projéteis que atravessam o corpo da nuvem agendam sua dispersão no instante do cruzamento, sem bloquear o disparo. A dispersão tem partículas, texto e movimento interpolado no navegador.
- Testes de vento/dispersão incluídos; `npm.cmd test`: 339/339. QA Playwright em `scripts/qa-weather-clouds.mjs` sem erros de página; capturas em `output/web-game/weather-cloud-rework/` inspecionadas. Cliente Playwright oficial também executado.

## Controles, legibilidade, equipes e Misturador — 2026-10-23

- Mira por toque ajusta o vetor salvo de forma relativa, com zona morta de 12 px; tocar sem arrastar não desloca a mira. A alavanca de mira usa o mesmo ajuste fino. A alavanca de movimento ganhou zona morta e retenção de eixo perto das diagonais.
- Etiquetas persistentes de fenômenos e estruturas deixam de ocupar o cenário inteiro quando a câmera está afastada; avisos de perigo e interações pontuais permanecem visíveis. Os nascimentos por equipe priorizam Blindado/Curandeiro na frente e Atacante/Ninja mais atrás.
- As classes agora têm diferenças próprias de vida, combustível e velocidade, além dos poderes anteriores. O Morteiro Criogênico foi separado da Bomba Elemental de Gelo: congela/fratura com precisão, sem criar crosta ou alterar lagos.
- Misturador implementado como carta passiva: uma arma de impacto principal recebe o efeito reduzido de outra arma compatível, gastando ambas as cargas e esperando duas rodadas para nova fusão. O HUD destaca a escolha, a disponibilidade e a recarga; há som de seleção/fusão e impacto visual próprio. A nova arte em pixel art detalhado segue as cartas recentes.
- Validação: 345/345 testes automatizados; QA Playwright do arsenal em desktop/mobile e da fusão durante partida, com `render_game_to_text` e sem erros de página. Capturas em `output/web-game/arsenal-art-v4/` e `output/web-game/mixer/`.
- Pendente para avaliação em aparelhos reais: sensibilidade final da mira e alavanca, legibilidade das cartas e desempenho da fusão em partidas com muitos efeitos simultâneos.

## Mira mobile e cano animado — 2026-10-23

- As configurações mobile agora oferecem sensibilidade NORMAL/PRECISA para arrasto e alavanca. A escolha fica salva no navegador e aparece em `render_game_to_text`; o modo preciso reduz o deslocamento da mira mantendo a trajetória anterior e a zona morta para toques acidentais.
- O mostrador de ângulo e força também inverte o lado do disparo com um toque, preservando a regulagem. O cano em microblocos gira suavemente até a direção e o ângulo da mira, compensando inclinações do corpo e posições na parede/teto. A mira dos outros jogadores é sincronizada por uma mensagem curta e a posição final do cano permanece após o tiro.
- Validação: 349/349 testes automatizados; QA Playwright em partida de treinamento no mobile (arrasto, alavanca e inversão) e desktop (controle de ângulo), sem erros de página. Capturas em `output/web-game/mobile-precision/`; cliente Playwright oficial executado novamente após a mudança.
- Pendente para avaliação em aparelhos reais: conforto do modo PRECISA em telas e densidades diferentes.

## Passivas de classe — 2026-10-23

- A cura por rodada do Anfíbio permanece em 30 HP na água. Carta, resumo da biblioteca, HUD e plano agora exibem o valor da regra; os textos de jogo usam a mesma constante do servidor.
- O pulso trienal do Sabotador revela Ninjas inimigos invisíveis dentro dos 760 blocos de alcance, remove o fantasma antigo e reinicia a espera pela camuflagem. Aliados e inimigos fora do alcance seguem invisíveis.
- Testes específicos verificam a cura aplicada, os textos das cartas e a revelação do Ninja para os outros jogadores: 23/23 aprovados. QA Playwright e cliente oficial executados sem erros de página; capturas da camuflagem, pulso e revelação inspecionadas em `output/web-game/saboteur-reveal/`.

## Seleção do Misturador — 2026-10-23

- O Mix agora ocupa exatamente uma das três vagas do arsenal e pode ser confirmado com qualquer combinação das outras duas cartas. A fusão durante a partida continua exigindo duas armas de impacto compatíveis; a tela de seleção avisa quando a combinação escolhida ainda não permite usá-la.
- O contador e o botão de confirmação foram alinhados à validação do servidor. Testes de seleção e fusão: 88/88 aprovados. QA Playwright em desktop e mobile confirmou `3 / 3`, confirmação e exibição no saguão, sem erros de página; capturas em `output/web-game/mixer-selection/`.
- Correção complementar após reprodução do relato: ao reabrir um arsenal já completo, tocar no Mix (ou em outra carta) substitui a última escolha com um toque e informa qual carta saiu. O botão de confirmar permanece visível durante a navegação pela lista no desktop e no mobile vertical. QA Playwright cobriu o fluxo de arsenal previamente salvo em desktop, mobile horizontal e vertical; sem erros de página.

## Física contínua, Elementalista e sinais de proteção — 2026-10-24

- Elementalista agora recebe um elemento aleatório por turno próprio, aplicado ao próximo disparo junto à arma e aos powerups; as bombas elementais saíram da escolha de arsenal. Aura e partículas mostram o elemento ativo.
- A simulação de tanques no ar, bolhas, arpão e vórtice continua durante animações de tiro e eventos. Tanques com combustível podem andar fora do turno. Aranha com Arpão consegue se prender à parede ou estrutura atingida. A decisão de tiro dos bots leva em conta obstruções próximas.
- Acertos ganharam reação, partículas e flash na tela. Escudo e invisibilidade têm sinais próprios no tanque, texto para o jogador, sons distintos e vibração compatível com o dispositivo.
- Validação: 356/356 testes automatizados; QA de navegador cobre física durante tiro, elemento no projétil e ativação visual de escudo/invisibilidade, sem erros de página. Permanecem a validação em aparelhos físicos e partidas longas do marco 5.

## Compatibilidade do saguão e seleção de classes — 2026-10-24

- O defeito reproduzido no PC veio de um processo Node antigo na porta 3000: a interface nova recebia regras sem `classesEnabled`, `roundLimit` e outros campos, por isso mostrava classes desativadas e valores `undefined`. Reiniciar o servidor com o código atual restaurou a escolha; o fluxo de seleção Ninja foi confirmado via WebSocket e no navegador.
- O servidor agora informa a versão do protocolo na saudação e em `/health`. A interface interrompe o uso de um servidor incompatível e mostra instruções persistentes para reiniciar/recarregar, em vez de exibir um saguão quebrado.
- Validação: 356/356 testes automatizados; QA Playwright em desktop e mobile confirmou seleção e persistência da classe no saguão, além da tela de incompatibilidade simulada, sem erros de página. Cliente Playwright oficial executado e capturas inspecionadas.
- TODO: manter a versão do protocolo sincronizada quando futuras mudanças alterarem o formato das mensagens; testar atualização remota durante partidas ativas.

## Modo TESTE — 2026-10-24

- Sequência `T E S T` na tela inicial cria uma sala de depuração com bot, primeiro turno do jogador, arsenal livre e sem bloqueio da rodada inicial. A sessão permanece isolada das salas comuns.
- Painel no HUD permite escolher classe, arma, powerup e cenário; configurar bot parado ou ativo, dificuldade, classe e vida; recarregar recursos e reiniciar o teste. O bot parado devolve o turno automaticamente.
- Testes novos cobrem criação, configuração, troca de cenário, reinício e rejeição dos comandos fora do modo TESTE. QA Playwright verificou entrada por teclado e painel no navegador sem erros de página.

## Elementalista, gelo e madeira — 2026-10-24

- O elemento sorteado no turno acende o tanque com luz colorida e partículas de movimento próprio para fogo, água, vento, terra e gelo. O tiro padrão mostra a arte da bomba elemental ativa no HUD, escondendo-a após o disparo ou fora do turno.
- O gelo danificado solta cristais; ao quebrar, os blocos se separam em estilhaços giratórios e partículas com som próprio.
- Fragmentos de troncos e galhos de árvores pequenas, médias e grandes agora têm velocidade, gravidade, rotação, colisão com terreno e plataformas, quique e dano no impacto. As coordenadas são atualizadas durante a queda e suavizadas no cliente.
- Validação: 360/360 testes; um teste novo cobre a queda progressiva do tronco. QA no navegador confirmou Elementalista e arte elemental no HUD sem erros de console. TODO: observar desempenho da quebra de muitos lagos congelados e bosques em aparelhos móveis reais.

## Encerramento, água e correntes de ar — 2026-10-24

- A partida só é finalizada depois que tiros e efeitos pendentes terminam. O servidor limpa os efeitos retardados na finalização, permitindo que o cliente conclua a animação de destruição e mostre a tela de resultado.
- A bomba elemental de água libera uma esfera física. Ela cai, colide com solo, plataformas ou estruturas e então se liquefaz em água que se espalha; se cair fora do mapa, desaparece sem criar um lago suspenso. A queda, o espalhamento e as pequenas cascatas têm animação própria.
- Bolsões de ar submersos desviam projéteis e a previsão de mira usa a mesma corrente do servidor. Tornados seguem seus apoios; ao perder solo, plataforma ou estrutura, caem até outro apoio.
- Validação: 364/364 testes; Playwright confirmou esfera visível durante o voo, espalhamento após o contato e ausência de erros de console. TODO: testar as quedas e a dispersão em partidas online longas com várias bombas simultâneas.

## Cavidades laterais e áudio de colisões — 2026-10-24

- Impactos na face de montanhas agora escavam cavidades horizontais sem remover o teto. O servidor, a prévia da mira e a renderização em microblocos usam a mesma geometria; tiros seguintes atravessam o buraco. Furadeira preserva escavação vertical.
- Colisões distinguem ferro, concreto, madeira e terra. Novos sons cobrem esses materiais, fogo, gelo, vento, seis lançamentos de armas e duas variações de explosão. Volume e timbre das repetições variam discretamente; efeitos elementais têm impacto próprio.
- Testes: 380 passaram. Inspeção visual do túnel confirmou pixels transparentes no centro e cobertura sólida acima; Playwright confirmou jogo em desktop e áudio na interface desktop/mobile sem erros.
- Próximo passo sugerido: integrar cavernas laterais à movimentação de tanques e ao fluxo de água, que ainda usam o perfil de altura da superfície.

## Áudio dos tiros e Bombardeio — 2026-10-24

- Disparos elétricos, minas, bombas elementais de água e terra e Reciclagem Vital ganharam assinaturas sonoras próprias. Tiros ocultos, marcadores de detonação e o impacto principal dos ataques elementais agora tocam no momento visível da colisão.
- O Bombardeio recebeu aviso, estrondo inicial e uma detonação curta para cada projétil. Cada colisão também gera tremor, clarão e detritos sincronizados.
- O mobile usa canais nativos de efeito simultâneos, permitindo que disparo, impacto e evento se sobreponham sem cortar um ao outro.
- Validação: 381/381 testes automatizados; QA em navegador com perfil de toque confirmou disparo, impacto e cada colisão do Bombardeio disparada uma única vez, sem erros de página. Pendente: conferir o volume percebido dos novos WAVs em iPhone e Android físicos.

## Bombardeio e fumaça — 2026-10-25

- O Bombardeio agora usa duas novas faixas: escombros em volume baixo e um impacto forte para cada projétil. O corpo grave continua no desktop; cada colisão preserva o ataque sonoro no mobile. Arquivos antigos permanecem apenas para compatibilidade.
- As explosões do evento ganharam desenho em microblocos, fumaça crescente, detritos e pulso de câmera no ponto de contato. Tiros comuns e especiais soltam mais fumaça no rastro; explosões grandes formam plumas mais densas; contatos sem explosão deixam poeira ou vapor conforme a arma.
- Fumaça também deriva com o vento e é desenhada com blocos, acompanhando o visual do jogo. QA em navegador confirmou o rastro e impacto em partida, além de uma detonação por projétil do Bombardeio, sem erros de página.
- Pendente: comparar o volume percebido dos novos efeitos em iPhone e Android físicos, especialmente com o volume do aparelho abaixo de 50%.

## Ataque e explosão legíveis — 2026-10-25

- Corrigido o áudio dos impactos: tiros explosivos que acertam solo ou estruturas agora tocam contato de material e detonação no mesmo instante confirmado. Armas sem explosão continuam apenas com o som do contato.
- Refeitas sete variantes compactas de explosão, incluindo bombardeio, com estalo inicial, corpo grave e fragmentos discretos. As mesmas amostras WAV tocam em desktop e mobile; gerador determinístico em `scripts/generate-impact-sfx.mjs`.
- Testes de ataque inicial, corpo, margem contra clipping e caminho mobile: 392 testes passaram. Playwright em partida de teste confirmou `shot.wav`, `impact-iron.wav`, `explosion.wav` nesta ordem, sem erros de página.

## Drone e Sentinela perfuram o cenário — 2026-10-25

- Metralhadoras do drone Especialista e da Sentinela agora abrem crateras visíveis de 15 blocos por projétil no solo. Seus cinco tiros causam 25 pontos de desgaste por acerto em plataformas e podem destruir uma plataforma comum numa rajada.
- Colisões sucessivas usam o cenário já alterado: os primeiros tiros abrem caminho e os seguintes podem atravessá-lo. Física de tanques e estruturas é aplicada uma vez ao fim da rajada para evitar travamentos.
- A plataforma quebrada some e solta destroços no instante da bala destrutiva, em vez de antes da animação. Testes do servidor e inspeção gráfica no navegador confirmaram solo e plataforma; 394 testes passaram.

## Instalador Windows com anfitrião multiplayer — 2026-10-25

- Instalador EXE autônomo por usuário em `packaging/windows`: embute o jogo portátil e o Node, extrai em `%LOCALAPPDATA%\TankDots Wars`, cria atalhos, registra desinstalação e aceita endereço público/VPN opcional. O script de compilação valida a extração antes de entregar o artefato em `release/TankDotsWars-Setup.exe`.
- O atalho de anfitrião escolhe porta livre, aguarda `/health` e abre o navegador; o servidor continua acessível por IP LAN. O botão Convidar amigos substitui `localhost` pelo endereço de rede, oferece escolha quando há múltiplos endereços e usa o endereço público configurado quando existir.
- Teste real em dois navegadores: anfitrião abriu sala em localhost, segundo jogador entrou pelo convite em `192.168.0.6`, e ambos apareceram no mesmo saguão sem erros de página. Configuração opcional de link público validada pela API; suíte completa com 396 testes passou.
- Acesso pela internet requer VPN ou encaminhamento externo da porta; o instalador não altera roteador nem firewall. O jogo depende do PC anfitrião ligado e as salas continuam somente em memória.
