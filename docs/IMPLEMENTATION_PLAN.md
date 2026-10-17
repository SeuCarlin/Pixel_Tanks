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
