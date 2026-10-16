# Pixel Tanks

> Artilharia multiplayer por turnos em um mundo de microblocos totalmente destrutível.

![Tela inicial do Pixel Tanks](docs/screenshots/home.png)

Pixel Tanks é um jogo de estratégia e artilharia para navegador, feito para partidas locais ou em LAN. Cada disparo altera o campo de batalha: abre crateras, revela itens, ativa objetos e pode derrubar tanques no vazio. Não há instalação no cliente — basta abrir o endereço do servidor no navegador.

## Destaques

- Multiplayer em tempo real via WebSocket, com salas privadas por código.
- Cenário de microblocos destrutível e mapas gerados proceduralmente.
- Partidas para até 10 jogadores, com bots em três dificuldades.
- Turnos com vento, gravidade, mira, força e diferentes tipos de munição.
- Arsenal pessoal: cada jogador escolhe três poderes antes da batalha.
- Fogos de Artifício, Ira de Zeus, Bala de Propulsão e Teleporte Tático.
- Cargas do Arsenal restauradas automaticamente a cada três turnos.
- 20 tipos de power-up, inventário acumulável e escolha de recompensa.
- Power-ups coletados pelo tanque, pela trajetória do projétil ou pela explosão.
- Eventos para partidas longas: bombardeios, raios e colapso do cenário.
- Chat dentro da partida, reconexão e substituição por bot ao abandonar.
- Velocidade configurável de `0,75×` a `2×`.
- Interface responsiva para desktop e dispositivos móveis.

## Arsenal pessoal

![Seleção do Arsenal](docs/screenshots/arsenal.png)

![Contagem regressiva do Arsenal](docs/screenshots/arsenal-countdown.png)

Cada comandante escolhe exatamente três itens no saguão. As habilidades têm uma carga e são recarregadas em conjunto a cada três turnos.

| Poder | Categoria | Efeito |
| --- | --- | --- |
| Obus Pesado | Tiro | Grande explosão e dano elevado. |
| Fragmentária | Tiro | Lança três projéteis espalhados. |
| Fogos de Artifício | Tiro | Produz três explosões secundárias ao redor do impacto. |
| Ira de Zeus | Tiro | Invoca um raio e empurra fortemente os inimigos próximos. |
| Bala de Propulsão | Tiro | Puxa tanques próximos para o centro do impacto. |
| Teleporte Tático | Movimento | Transporta o tanque para um terreno seguro próximo. |

## A batalha

![Partida do Pixel Tanks](docs/screenshots/battle.png)

Antes do primeiro disparo, uma roleta animada sorteia de forma sincronizada quem começa a partida.

![Roleta do primeiro turno](docs/screenshots/roulette.png)

O terreno muda continuamente. Explosões removem blocos, plataformas podem quebrar, minas reagem em cadeia e cápsulas enterradas são reveladas pelas crateras. A cada três turnos todos recebem três power-ups aleatórios para escolher um, além da recarga do Arsenal.

![Escolha de power-up em três cartas](docs/screenshots/powerup-cards.png)

Quando uma partida se prolonga, a arena acelera o confronto com eventos especiais:

- chuva de bombardeio;
- tempestade de raios;
- destruição e colapso do cenário;
- novos suprimentos e abalos da arena.

## Saguão e configuração

![Saguão multiplayer](docs/screenshots/lobby.png)

O anfitrião pode configurar número máximo de jogadores, bots, dificuldade da IA, vida inicial, duração dos turnos, velocidade, mapa, quantidade de power-ups e minas terrestres. Cada jogador configura seu próprio Arsenal antes do início.

## Como executar

### Pacote portátil para Windows

1. Execute `INICIAR_JOGO.bat`.
2. Aguarde o navegador abrir `http://localhost:3000`.
3. Para jogar em LAN, compartilhe o endereço exibido no terminal com os outros jogadores.

Uma distribuição portátil pode incluir `node.exe` e dispensar a instalação global. No código-fonte do GitHub, instale Node.js 20+; o inicializador detecta automaticamente a instalação do sistema.

### Desenvolvimento

Requer Node.js 20 ou superior.

```bash
npm install
npm start
```

Para reiniciar automaticamente após alterações no servidor:

```bash
npm run dev
```

## Controles

| Ação | Controle |
| --- | --- |
| Mover | `A` / `D`, setas ou botões na tela |
| Mirar | Arrastar no campo ou usar os controles de ângulo e força |
| Disparar | `Espaço` ou botão **Atirar** |
| Abrir o chat | `T` |
| Enviar mensagem | `Enter` |
| Fechar o chat | `Esc` |
| Zoom | Roda do mouse |
| Teleporte Tático | Selecionar `TP` e tocar no destino |

## Estrutura

```text
client/             Interface, áudio e renderização Canvas
server/             Salas, física, terreno e servidor WebSocket
shared/             Constantes e protocolo compartilhado
scripts/            Ferramentas de desenvolvimento
test/               Testes automatizados
docs/screenshots/   Capturas usadas na documentação
```

O servidor usa Express e `ws`. A renderização é feita diretamente em Canvas 2D, sem frameworks de interface ou assets externos obrigatórios.

## Testes

```bash
npm test
```

A suíte cobre configuração e recarga do Arsenal, recompensas periódicas, velocidade da partida, coleta de power-ups pela trajetória e efeitos especiais.

## Atualizar screenshots

Com o servidor rodando na porta `3012`:

```powershell
$env:PIXEL_TANKS_URL='http://localhost:3012'
node scripts/capture-screenshots.mjs
```

O script usa o Google Chrome instalado no Windows e recria as quatro imagens de documentação.

## Tecnologias

- JavaScript com ES Modules
- Node.js
- Express 5
- WebSocket (`ws`)
- Canvas 2D
- CSS responsivo
- Node Test Runner

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).

