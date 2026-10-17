# QA e entrega — TankDots Wars

## Verificado nesta entrega (2026-10-17)

- `npm test`: 92 testes aprovados, inclusive simulação longa, física de estruturas, atlas de cartas, evoluções, Sobrevivência, Domínio por Equipes, preparação em etapas, mira assistida e áudio sem efeitos atrasados.
- Fluxos reais em navegador: sala com dois jogadores em Sobrevivência até a rodada 6 e sala com humano e três bots em Domínio por Equipes. Capturas desktop e mobile horizontal (844×390) sem rolagem nem erros de página.
- Aviso e impacto dos eventos de assinatura dos seis biomas, além de bombardeio, renderizados com sementes fixas. Helicóptero, cargas e flash do raio inspecionados separadamente.
- Na partida de Sobrevivência, carta coletada, recompensa e alerta da lava não se sobrepõem. A área inundada passa a ser visível sobre o solo.
- Preparação em navegador mobile horizontal: classe por 10 s, arsenal por 10 s, sorteio e partida; etiqueta das classes visível sobre os marcadores dos tanques. Assistência de mira testada contra bot com vento e impacto confirmado no servidor. Helicóptero inspecionado nas duas direções e céu de cor única por bioma.

## Ainda requer aparelhos físicos

O navegador emulado não comprova funcionamento de áudio, vibração, latência de toque ou desempenho em um dispositivo real. Antes de considerar o bloco 12 validado em produção, testar pelo menos um iPhone/Safari e um Android/Chrome em orientação horizontal:

1. Abrir o menu, tocar para liberar áudio e verificar música, hover/toque, tiro, movimento e trovão; mudar os três controles de volume separadamente.
2. Confirmar vibração em tiro, dano e evento **se o navegador disponibilizar a API**. Safari no iPhone pode não oferecer vibração; ausência nesse navegador não deve impedir jogar.
3. Criar sala, escolher classe antes do arsenal, mirar com e sem ASSIST, travar mira, atirar segurando a mira, mover, trocar cartas e fechar modais. Nenhum controle deve cobrir outro nem exigir rolagem fora dos catálogos de cartas.
4. Jogar pelo menos uma partida de Sobrevivência até o fim e uma de Domínio por Equipes com bots. Conferir foco da câmera, zona contestada, placar, maré de lava, resultado e reinício.
5. Observar engasgos durante bombardeio, raio, erupção, queda de prédio e mega bomba; coletar perfil de FPS/memória e ajustar limite de partículas ou desenho do terreno se necessário.
6. Repetir uma partida com dois aparelhos conectados à mesma sala e conferir sincronização após alternar aplicativo, perder conexão e voltar.

O servidor mantém salas somente em memória e o serviço de produção deve usar uma instância. Reinícios do processo encerram partidas em andamento.
