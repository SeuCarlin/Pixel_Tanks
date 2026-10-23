# TankDots Wars — plano de evolução

Estado inicial: o jogo já possui 28 powerups, 16 cartas de arsenal, 8 classes, 9 eventos, arenas destrutíveis, bots e modos solo, Coop e VS Equipes. O objetivo deste plano é ampliar a legibilidade e a profundidade sem perder a estabilidade da simulação.

## Ordem de entrega

| Bloco | Próxima entrega verificável | Critério de aceite |
|---|---|---|
| 1. Cartas e poderes | Metadados de categoria, ativação e combo; filtros e busca na biblioteca; comparação rápida | Toda carta é encontrável e mostra seu efeito sem depender de ícones genéricos. Dados de dano vêm do mesmo balanceamento usado no combate. |
| 2. Feedback de combate | Prévia do combo equipado; registro dos últimos tiros, acertos, destruições e eliminações | O jogador identifica quem agiu, com qual arma, quem recebeu dano e quando a animação terminou. |
| 3. Física e destruição | Auditoria de suporte das estruturas, queda com massa/material, impactos em cadeia | Estruturas sem apoio caem; dano de destroços não é duplicado e causa consistente alteração no terreno. |
| 4. Cenários distintos | Semente compartilhável; biomas Cidade, Vulcão, Geleira, Usina, Cânion e Base Aérea, com distribuição própria de estruturas | A mesma semente reproduz a geometria e cada bioma tem ao menos uma interação exclusiva. |
| 5. Movimento | Animação de esteiras e suspensão; indicador de aterrissagem segura e de parede escalável | A previsão coincide com o destino validado pelo servidor e não permite cruzar paredes sólidas. |
| 6. Eventos | Aviso com duração e área; variações por bioma e intensidade da rodada; ações de redirecionamento | A área prevista coincide com a área afetada; evento espera todas as animações de combate e física. |
| 7. Bots | Personalidades agressiva, defensiva, coletora, suporte e demolidora; seleção de alvo e poder consciente de risco | Dificuldade altera decisão e precisão separadamente; bot evita quedas óbvias e aliados. |
| 8. Classes | Indicadores de passivas e recarga; uma escolha de evolução em marcos de rodada; revisão estatística | Passivas são legíveis, sincronizadas e têm efeito demonstrável sem criar classe obrigatória. |
| 9. Áudio | Controles separados de música, efeitos e interface; assinatura sonora por poder/evento; teste no iOS | Preferências persistem e cada grupo pode ser reduzido sem silenciar os demais. |
| 10. Modos | Preset de partida rápida; depois Rei da Colina, Sobrevivência e objetivos por equipe | Cada modo tem condição de vitória própria, placar e testes de encerramento. |
| 11. Interface | HUD adaptável a área segura do aparelho, biblioteca pesquisável, resumo pós-partida | Nenhum controle cobre o palco em mobile horizontal; resultados são legíveis. |
| 12. Base técnica | Catálogo de metadados em módulo próprio, testes de simulação longa e perfil de desempenho mobile | Sem divergência entre descrição e regra; testes detectam partidas travadas e regressões de atlas. |

## Marcos e dependências

1. **Fundação de leitura** — blocos 1, 2, 7, 9, 11 e 12. Entregar biblioteca com filtros, prévia de combo, registro de combate, primeiro ajuste de IA e preferências de volume. Semente de mapa e preset rápido iniciam os blocos 4 e 10.
2. **Arena física** — blocos 3, 4, 5 e 6. Definir materiais, suporte e reações de estruturas antes de acrescentar biomas e novos eventos. Criar cenários e eventos por dados compartilhados.
3. **Estratégia de longo prazo** — blocos 7, 8 e 10. Expandir personalidades, evoluções de classe e modos de objetivo após estabilizar física e UI.
4. **Polimento e escala** — blocos 9, 11 e 12. Mixagem final, testes reais de celular, perfil de rede/renderização e simulações prolongadas.

## Regras de execução

- Cada marco passa por teste de servidor e verificação visual em desktop e mobile horizontal.
- Mecânica nova precisa de descrição na biblioteca e feedback no combate.
- Alterações no balanceamento usam `shared/constants.js` como fonte única.
- Uma carta nova exige arte, metadados, teste de mapeamento e entrada em `docs/ART_DIRECTION.md`.
- Salas em andamento continuam usando as regras com que foram criadas.

## Acompanhamento

- [x] Plano de 12 blocos e critérios de aceite.
- [x] Marco 1 — primeiro incremento jogável: filtros e comparação de 61 cartas, prévia de combo, registro de combate, bots com personalidades, semente compartilhável, preset rápido, áudio por grupo e indicadores iniciais de classes/eventos.
- [x] Incremento 2 — seis biomas com paletas, estrutura interativa característica e evento de assinatura; prévia de caminhada compartilhada entre cliente e servidor; massa/material em quedas, crateras de estruturas pesadas, HUD de passivas, modo Rei da Colina, teste de partida longa e verificação dos atlas.
- [x] Incremento 3 — impacto de estruturas pesadas degrada ou destrói estruturas adjacentes uma única vez; partículas de queda e fratura por material surgem no momento do choque; conclusão das animações de estruturas entra na espera visual de combate. Teste de navegador com estado textual e captura de gameplay.
- [x] Incremento 4 — prévia de pouso para Arrancada, Escavadeira, Investida Blindada e Aranha; distância, escavação, quebra de até três paredes e lançamento por plataforma usam simulações compartilhadas entre cliente e servidor. Testes de correspondência para os quatro modos e lançadores; verificação visual desktop e mobile horizontal.
- [x] Incremento 5 — classes evoluem nos marcos de 1/3 e 2/3 da partida. Fortificar concede +30 de vida máxima e cura; Sobrecarga soma +6 por acerto direto ou explosivo contra inimigos. Escolhas permanentes e repetíveis, bots decidem automaticamente, HUD e biblioteca explicam o ganho. Testes de servidor e fluxo visual desktop/mobile horizontal.
- [x] Incremento 6 — Sobrevivência com maré de lava progressiva e previsão no HUD; Domínio por Equipes com captura compartilhada, contestação, placar e vitória própria. Alertas centrais não encobrem recompensas, evoluções ou cartas coletadas. Raios têm flashes repetidos durante o impacto.
- [x] Marco 2 — física de impacto em cadeia, visual de queda por material, prévia de movimentos especiais e revisão visual dos eventos de assinatura nos seis biomas, mais bombardeio. Capturas de aviso e impacto inspecionadas no navegador.
- [x] Marco 3 — personalidades de bots, evoluções permanentes de classe, Rei da Colina, Sobrevivência e Domínio por Equipes implementados e cobertos por testes de regra. Balanceamento estatístico de longo prazo continua sendo uma revisão de produto, não uma regra ausente.
- [ ] Marco 4 — preferências de áudio, HUD horizontal, simulação longa e testes automatizados concluídos. Correções posteriores: áudio contextual sem reprodução atrasada, assistência balística de mira no mobile, céu sem faixas, helicóptero espelhado, classe e arsenal em etapas próprias e etiquetas de classe no combate. Pendente: validação de áudio, vibração, controles e desempenho em iPhone e Android físicos, com o checklist em `docs/QA_HANDOFF.md`.

## Próximo ciclo — clima, navegação e física hídrica (iniciado em 2026-10-20)

1. [x] Entrada legível e hierarquia: ações principais antes das opções avançadas; cenário de microblocos com biomas e ciclo dia/noite no fundo.
2. [x] Navegação: tiro padrão pré-selecionado em cada turno; minimapa arrastável em desktop e toque, sem alterar permanentemente o modo de câmera.
3. [x] Evento Inundação: aviso, nuvens carregadas, chuva, bacias escavadas progressivamente, lagos persistentes e extinção do fogo alcançado pela água. Carta própria no estilo dos eventos.
4. [x] Física hídrica: tanques submersos perdem tração e gastam mais combustível; a água amortece quedas, apaga fogo e inutiliza minas. Objetos molhados deixam de queimar. Lagos fluidos agora conservam volume entre colunas, escorrem para novas crateras e vazam gradualmente por aberturas no fundo ou bordas; efeitos de cascata mostram o desnível. Lagos antigos ainda usam a drenagem legada.
5. [x] Clima sistêmico: sequência jogável de chuva → Inundação/Raios (50% cada quando ambos habilitados) → Vendaval, respeitando eventos desabilitados e aguardando animações. Nuvens acompanham a ventania; chuva leve intermitente varia por bioma e a tempestade se dissipa gradualmente após o Vendaval.
6. [ ] QA de produto: desenho da água perfilado em navegador com 24 lagos e otimizado para desenhar apenas a área visível; ainda validar contraste, escala, áudio e desempenho geral em iPhone/Android físicos.
7. [x] Reação hídrica: impactos e explosões submersas deslocam água entre colunas sem criar volume; ondas, respingos e bolhas acompanham a redistribuição. Bolsões de ar surgem em colunas profundas, elevam tanques submersos e os lançam para fora da superfície.

Os itens 1–5 e 7 estão implementados e cobertos por testes automatizados e inspeção visual no navegador. A validação de áudio, controles e desempenho em aparelhos físicos permanece pendente.

Para um líquido fisicamente mais realista ainda faltam: grade de células 2D com volumes e velocidades por célula, pressão/viscosidade, colisão contínua contra terreno e estruturas móveis, conservação de massa ao destruir blocos, acoplamento com tanques e projéteis, e atualização incremental sincronizada entre servidor e clientes. O modelo atual é de águas rasas por coluna: mantém o custo de rede e CPU previsível e melhora a jogabilidade, mas não simula redemoinhos ou fluxo subterrâneo completo.

## Próximo ciclo — classes e cartas (iniciado em 2026-10-20)

O plano original previa evolução e indicadores das oito classes, mas não especificava nomes de novas classes ou cartas. Este ciclo inicia a expansão com um papel de suporte a estruturas, sem alterar as escolhas existentes.

1. [x] Engenheiro: recebe Sentinela como quarta arma de classe; Sentinelas e Hastes que posiciona têm +1 durabilidade; a cada rodada, repara 1 ponto da estrutura aliada danificada mais próxima em 360 blocos. A passiva fica suspensa por Tesla.
2. [x] Kit de Reparos: powerup coletável automático; cura 25 HP do coletor e repara até 2 pontos em até duas Sentinelas ou Hastes aliadas próximas. Sua chance de aparecer nas escolhas do Engenheiro é favorecida pela sinergia de classe.
3. [x] Artes individuais no padrão pixel art das cartas; biblioteca, seleção de classe, lobby, HUD e miniatura de coleta usam os mesmos arquivos, sem deslocar células dos atlas existentes.
4. [ ] Revisar balanceamento do Engenheiro em partidas longas de equipes e medir frequência de estruturas sobreviventes. Validar legibilidade das novas miniaturas em iPhone e Android físicos.
5. [x] Incendiário: todos os tiros incendeiam a área do impacto e lançam três labaredas de alcance médio. Seu fogo dura uma rodada a mais, causa +10 HP por rodada e não fere o próprio tanque. Não recebe Molotov automaticamente; Tesla suspende os bônus ativos.
6. [x] Espuma de Combate: powerup automático que apaga incêndios próximos em solo, plataformas e estruturas e bloqueia dano de fogo na rodada atual e na seguinte. A proteção tem aro azul no tanque; a extinção emite pulso e partículas de espuma.
7. [ ] Testar a taxa de vitória do Incendiário por bioma (especialmente mapas com chuva/Inundação), além do balanceamento do Engenheiro. Validar controles, áudio e miniaturas em aparelhos físicos.

## Expansão pedida pelo jogador — água, Especialista, Elementalista e Portal

> Atualização de balanceamento (2026-10-20): a classe Engenheiro foi removida das escolhas e das regras; a descrição histórica abaixo permanece apenas como registro. O Kit de Reparos continua como powerup independente.

Especificações recebidas em 2026-10-20. Os detalhes não ditos devem ser tratados como decisões de balanceamento explícitas, não como regras já aprovadas.

1. [x] Anfíbio: não afunda; flutua e se move livremente em lagos, sem a perda de tração dos demais tanques. Recebe Canhão de Água exclusivo no arsenal. O jato segue uma linha reta, atravessa vários tanques alinhados, empurra e causa 40 HP em cada um; quando disparado de baixo para cima, lança os alvos ao alto. Quando atinge o solo próximo apontado para baixo, impulsiona o próprio atirador no momento do impacto, com prévia e efeito exclusivos. Arte individual de classe e arma, prévia da linha, testes de física e combate.
2. [x] Especialista: o primeiro drone aparece na rodada 2, com outro a cada duas rodadas. Clique/toque em um drone para reposicioná-lo dentro de 850 blocos do tanque. Cada drone dispara cinco projéteis de 5 HP em até três inimigos dentro de 480 blocos, priorizando o mesmo alvo dos demais drones do dono. Pode reposicionar drones, Sentinelas e Hastes de qualquer tanque (cada estrutura uma vez por turno próprio). Um drone ativo e próximo tem 70% de chance por projétil de avançar para interceptar um disparo dirigido ao dono; é destruído ao absorver o impacto, enquanto drones em pane não defendem. Drones também sofrem efeitos de eventos e servem de âncora aérea para Arpão, Blink e Teleporte; o tanque volta a cair depois de alcançá-los. Arte de classe individual, corpo microblocado, animação de rotores/metralhadora, prévia de alcance e testes automatizados.
3. [x] Elementalista: recebe uma bomba elemental diferente, aleatória a cada turno e recarregada a cada rodada. Fogo explode e incendeia a área por duração normal; Água explode por 30 HP e cria uma inundação no impacto; Vento cria vórtice de ~600 blocos de altura e 200 de largura, deslocado pela força/direção do vento por duas rodadas, que lança inimigos, objetos, estruturas e powerups ao alto e desvia projéteis; ao cruzar um incêndio, torna-se um vórtice de fogo e causa +30 HP por contato/rodada; Terra deforma o cenário criando montanha ou buraco. Quatro artes de bomba, física, animação e sons próprios implementados. Testes de servidor e captura Chromium concluídos; balanceamento em aparelhos físicos permanece no item 5.
4. [ ] Portal: aguardar a descrição do jogador sobre posicionamento, ativações, transporte de tanques/projéteis, colisões, duração e limites. Não presumir mecânica.
5. [ ] QA desktop/mobile: classes, arsenal exclusivo, efeitos físicos, cartas, bots e desempenho em partidas longas.
6. [x] Combate aquático: tanques comuns afundam, movem-se devagar e perdem potência de tiro debaixo d'água; Caçador Aquático, Mina Aquática, Boia e Torpedo Aquático têm regras, artes e testes próprios. A Bomba de Propulsão drena lagos conectados ao ponto de sucção.

## Arenas aquáticas e balanceamento — 2026-10-20

- [x] O cenário sorteado aparece no saguão. Novo bioma Ilhas com canais de água desde o início e plataformas em alturas distintas.
- [x] A largura jogável varia entre 3.200 blocos (duelo) e 5.600 (dez tanques); geração, limites dos tiros, eventos, minimapa e câmera usam o espaço ativo.
- [x] Árvores iniciais e do evento Tempo de Flora só surgem quando toda a base cabe em solo seco; sementes de Flora também evitam lagos.
- [x] Engenheiro removido. Incendiário mantém o tiro normal e acrescenta três labaredas direcionais de médio alcance a cada disparo.
- [x] Balanceamento inicial: Anfíbio recupera 10 HP por rodada enquanto está na água; Especialista mantém até três drones simultâneos, destrutíveis com um único acerto; Elementalista mantém uma bomba por rodada, com elemento trocado aleatoriamente.
- [ ] Validar controles, áudio e desempenho dos cenários aquáticos em iPhone/Android físicos e ajustar estatísticas após partidas longas com jogadores.

## Controles terrestres e aquáticos — 2026-10-20

- [x] Desktop: WASD (e setas) para deslocamento; A/D dirigem, W/S sobem e descem na água. Tanques comuns nadam lentamente e voltam a afundar; Anfíbio/Boia mantêm a profundidade escolhida enquanto se deslocam.
- [x] Mobile: alavanca de movimento em quatro direções, separada da alavanca opcional de mira e posicionada no HUD inferior.
- [x] Aranha invertida se solta do teto ao pressionar S ou a direção para baixo duas vezes; a segunda ativação inicia a queda física sem consumir combustível. Segurar a alavanca não conta como dois toques.
- [x] Arsenal nas teclas Q/E/R/T, powerups nos números; V seleciona o tiro padrão e Y abre o chat para liberar W e T.
- [ ] Conferir ergonomia da alavanca e resposta a toques duplos em aparelhos iPhone/Android físicos.

## Ajustes de combate contínuo — 2026-10-21

- [x] Canhão de Água: emissão sustentada por 2 s, com força reaplicada aos tanques alinhados durante o fluxo. O jato extingue fogo no trajeto, resfria árvores e plataformas em chamas e perturba a superfície de lagos que atravessa.
- [x] Bomba de Propulsão: após a chegada do projétil, o vórtice mantém 4 s de atração física, desprendendo tanques do solo ou plataformas e acelerando-os em direção ao centro. Objetos soltos também continuam sendo atraídos.
- [x] Artes revisadas de Canhão Cinético, Morteiro Criogênico e Salva Meteórica, sem deslocar células existentes do atlas.
- [ ] Medir intensidade do empurrão e legibilidade do fluxo/vórtice em iPhone e Android físicos; as águas rasas por coluna ainda não simulam pressão 2D completa.

## Interação dinâmica do jato — 2026-10-21

- [x] A força, a coleta de alvos e a extinção de fogo usam somente o segmento visível até a primeira superfície sólida; tanques e incêndios atrás de paredes não são afetados.
- [x] Tanques que entram no fluxo enquanto o Canhão de Água ainda emite recebem um único acerto de 40 HP e seguem sendo empurrados; o HUD mostra dano e partículas de água no contato tardio.
- [ ] Validar em aparelhos físicos a legibilidade do aviso de contato tardio e o empurrão contra paredes em mapas de ilhas.

## Apoio físico durante o vórtice — 2026-10-21

- [x] Estruturas arrastadas pela Bomba de Propulsão recalculam o apoio no solo durante a atração e ao término do campo. Um objeto puxado para fora de uma borda cai pelo sistema de estruturas e pode causar dano na aterrissagem.
- [x] Galhos de árvores grandes acompanham a posição do tronco quando o vórtice o desloca; guindastes mantêm a bola alinhada. Objetos ficam limitados à largura jogável do cenário.
- [ ] Rever massa, colisão lateral entre estruturas e fragmentação de construções grandes em partidas longas, sem elevar o custo por tick no mobile.

## Arenas celestes, campo plano e superfícies dinâmicas — 2026-10-21

- [x] Lagos congelados formam placas físicas destrutíveis, com tração própria e estilhaços; tanques perdem apoio ao quebrarem ou derreterem.
- [x] Incêndios distribuem focos por ponto de apoio. Cada foco espera a animação da destruição e cai ao apoio inferior de forma independente.
- [x] Edifícios em terra não ocupam colunas submersas de lagos.
- [x] Tecnópolis: terreno pouco acidentado, rampas, plataformas e transportadores voadores; Ilhas Celestes: quatro ilhas grandes, spawns seguros, plataformas móveis de resgate com impulso e eliminação por queda; Campo Plano: chão nivelado com plataformas e estruturas.
- [ ] Validar visual, desempenho e balanceamento das três arenas e do gelo em aparelhos móveis físicos.

## Tornados do Vendaval e Placa Tornado — 2026-10-21

- [x] Vendaval tem 35% de chance de formar dois tornados em áreas distintas. Eles aparecem ao final da animação do vento, erguem tanques/objetos/powerups, desviam projéteis e duram quatro turnos.
- [x] Placa Tornado selecionável no arsenal: projétil arremessável que ativa no impacto um mini tornado fixo de 165 × 330 blocos por duas rodadas, sem dano direto; recarga de três turnos próprios.
- [x] Arte pixel art própria para a Placa Tornado e para o evento Tempo de Flora, usadas nas cartas, Biblioteca e miniaturas.
- [ ] Avaliar em partidas móveis a legibilidade de vários tornados simultâneos e o balanceamento da Placa Tornado.

## Identidade visual da Tecnópolis — 2026-10-21

- [x] Céu em tons de azul noturno com grade digital e núcleo orbital; horizonte industrial em camadas substitui as montanhas naturais.
- [x] Árvores, guindastes e torres convencionais não surgem na Tecnópolis. Instalações interativas (radar, bobina elétrica, domo, repulsor e terminal) ocupam o solo e as plataformas altas; prédios destrutíveis têm fachada tecnológica própria.
- [x] Tempo de Flora instala equipamentos sintéticos no bioma, sem gerar árvores. Testes cobrem mapas de 2, 6 e 10 tanques e a renderização em navegador.

## Prévias animadas na biblioteca — 2026-10-22

- [x] Todas as 97 entradas atuais da biblioteca (powerups, arsenal, eventos e classes) têm botão para abrir demonstração ilustrativa em microblocos, com três etapas nomeadas.
- [x] Apenas a demonstração aberta anima, com pausa e reinício. O layout cabe em mobile horizontal e respeita a preferência por movimento reduzido.
- [x] Testes de cobertura do catálogo e QA em navegador para animação, interação, mobile e erros de página.
- [x] As gravações MP4 foram removidas após revisão visual; todas as cartas voltaram à demonstração ilustrativa leve, animada e consistente com os microblocos do jogo.
- [x] A demonstração ilustrativa mantém pausa, reinício e etapas do efeito, inclusive em mobile horizontal.
- [ ] Se as prévias forem revisitadas, validar primeiro uma direção visual com o usuário antes de produzir gravações em massa.

## Armas e gelo — 2026-10-22

- [x] Enxame de Drones marca a área e lança três ataques sequenciais após o impacto; busca inimigos próximos e pode ser interceptado por coberturas superiores.
- [x] Mina Aquática deriva na superfície conforme água e vento, com detecção por subetapas para evitar atravessar paredes; em terra permanece inativa e quica.
- [x] Bomba Elemental de Terra anuncia a deformação e alterna entre barreira/cratera conforme o ângulo. O movimento do solo causa até 18 HP adicionais e fratura a armadura por um turno.
- [x] Canhão Cinético arremessa os tanques atingidos com impulso horizontal e vertical, em vez de apenas aplicar recuo instantâneo.
- [x] Gelo ganhou deslize residual, queda ao perder apoio, superfície em microblocos e estilhaços mais legíveis.
