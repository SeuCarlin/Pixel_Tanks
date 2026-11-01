# Servidor no seu PC

## Pacote para outros anfitriões

Baixe **TankDots — Servidor Windows** no itch.io, extraia o ZIP inteiro e execute **INICIAR_ONLINE.bat**. O pacote inclui Node.js para Windows x64 e dependências de produção. Não é necessário instalar Node ou npm. A primeira execução precisa de internet para baixar o cloudflared oficial. O pacote distribuído nunca inclui contas, senhas, sessões ou o endereço do autor.

Para gerar o pacote, use `npm run build:host` em Windows x64. O ZIP é criado em `output/host`. Envie-o ao itch.io como download Windows adicional, sem marcar para jogar no navegador. O texto pronto para a descrição está em [Orientações online](./itch-online-instructions.md).

Cada anfitrião mantém sua própria base de contas e coleção. Não há sincronização automática entre servidores. Compartilhe com os amigos o endereço HTTPS e o código da sala; todos precisam estar no mesmo servidor. Ao atualizar, extraia a versão nova em outra pasta e transfira a pasta `data` com o servidor parado.

Abra **INICIAR_ONLINE.bat** na pasta principal. O iniciador instala o cloudflared oficial na primeira execução, valida SHA-256 e inicia Node.js com um túnel HTTPS. O endereço aparece na janela e em `output/pc-server-url.txt`. Mantenha PC, conexão e processo ligados; Ctrl+C encerra os dois processos iniciados pelo programa.

Não precisa abrir portas do roteador. O Quick Tunnel gratuito é temporário: muda de hostname a cada reinício e não tem garantia de disponibilidade. Para um endereço fixo, a evolução é um Cloudflare Tunnel nomeado com domínio próprio. [Documentação oficial](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Contas e dados

O servidor salva usuários, hashes de senha, sessões, estatísticas, XP, Battle Dots e cartas em `data/accounts.json`. Faça backup dessa pasta quando o servidor estiver parado. Nunca envie esse arquivo ao GitHub nem ao itch.io. `TANKDOTS_DATA_DIR` pode apontar para outra pasta persistente. A chave de sessão é armazenada como hash; senhas usam scrypt.

As quatro classes iniciais são Blindado, Atacante, Bombardeiro e Curandeiro. As seis cartas iniciais são Obus Pesado, Fragmentária, Pulo Balístico, Granada Ricochete, Bomba Marcadora e Sinal de Resgate. As outras 38 cartas têm desafio cumulativo, nível alternativo e preço em Battle Dots, definidos em `shared/progression.js`.

Uma carta pode ser liberada concluindo o desafio **ou** alcançando o nível **ou** comprando com moeda ganha no jogo. A árvore mostra progresso, condição, nível, preço e propriedade. A coleção é validada no servidor ao selecionar classe/arsenal; o cliente não concede XP ou moeda.

Partida concluída concede 40 Battle Dots e 50 XP de participação, com bônus limitados por dano, destruição, abates e vitória (+60 Dots e +100 XP por vitória). O XP necessário para chegar ao nível N é `150 × (N−1)²`. Cada partida é creditada uma única vez por conta, inclusive depois de sair do histórico visível. Compras descontam o saldo uma única vez; cartas já liberadas não podem ser compradas novamente.

Treino, laboratório e o motor offline não concedem XP, moeda ou desbloqueios persistentes. O modo local offline permite as cartas iniciais; as demais são usadas jogando conectado à conta no servidor. Os bots não precisam desbloquear cartas.

## itch.io

O novo ZIP mantém o modo local e adiciona **ONLINE • LOGIN E CARTAS**. Esse botão abre o endereço do servidor no próprio navegador; login e partidas online rodam na mesma origem HTTPS. Isso evita depender de cookies de terceiros ou expor credenciais entre o iframe e outra origem.

O build lê `host-config.json` ou `TANKDOTS_PUBLIC_URL` para preencher o endereço. Quando o túnel mudar, os jogadores podem editar o endereço no botão Online, ou você pode gerar um novo ZIP com `npm run build:itch`. O progresso permanece no PC, não no endereço temporário.

## Validação

`node scripts/qa-progression.mjs` usa dados isolados e dois navegadores para validar login, compra, seleção de carta liberada, bloqueio de classe não adquirida, partida online e entrega de XP/Dots. Não altera os dados reais do servidor.
