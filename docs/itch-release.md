# Edição HTML para itch.io

Execute `npm run build:itch` na raiz do projeto. O comando gera uma pasta datada em `output/itch`, com `tank-dot-arena-itch.zip`, a cópia descompactada em `game` e instruções em `LEIA-ME.txt`. Não requer bundler adicional; no Windows usa um empacotador .NET com caminhos portáveis, nos demais sistemas usa zip.

O ZIP contém `index.html` na raiz, recursos com caminhos relativos e um Worker que executa o motor original de partidas, física e bots. O servidor online não é alterado. Contas, convites e entrada em salas online são omitidos nesta edição. As configurações locais continuam usando o armazenamento do navegador. Partidas em andamento não são restauradas ao recarregar a página.

## Multiplayer no mesmo dispositivo

Escolha **Humanos neste dispositivo** (1 a 10) e a quantidade de bots; a soma é limitada a 10 tanques. Com dois ou mais humanos, é possível jogar sem bots. Cada pessoa escolhe sua própria classe e três cartas e marca **Pronto**; a preparação passa para a próxima. Durante a partida, câmera, mira, inventário e comandos acompanham o humano cujo turno começou. Bots continuam automáticos. A revanche mantém os participantes.

## Áudio mobile

Ative os sons com um toque. Os WAVs são pré-carregados e decodificados também no mobile. Efeitos prontos usam um único AudioContext desbloqueado para sobreposição; a reprodução nativa cobre o carregamento inicial, com recuperação pelo mixer quando uma troca de arquivo é bloqueada. Música nativa é desbloqueada no mesmo gesto. Sons de interface têm prioridade sobre os canais ambientais. Volumes continuam independentes.

## Upload

1. Selecione **HTML** no tipo de projeto.
2. Envie apenas `tank-dot-arena-itch.zip` em **Upload files** e marque **This file will be played in the browser**, se aparecer.
3. Prefira **Click to launch in fullscreen**. Para incorporar na página, use **1280 × 720** e habilite o botão de tela cheia.
4. Mantenha **Click to Play** ativado. Teste a prévia antes de tornar a página pública.

O jogo precisa carregar os recursos pela internet ao abrir a página, mas a simulação não usa conexão, backend ou Node.js. Esta entrega não inclui instalação PWA ou garantia de recarregamento offline. O arquivo HTML não deve ser aberto por `file://`; use o itch.io ou uma hospedagem estática HTTP/HTTPS.

## Validação

`node scripts/qa-itch.mjs <diretório game>` serve o pacote em uma subpasta e testa carregamento, treino, preparação com classe e arsenal, disparo sem conexão e turnos dos bots. Registra capturas e estado em `output/web-game/itch`. Use `SERVE_ONLY=1` para manter uma hospedagem local aberta durante testes manuais.

`node scripts/qa-local-multiplayer.mjs <URL>` valida preparação independente, rolagem de confirmação, troca de dois turnos sem internet e os 130 efeitos em emulação mobile Chromium. Com `QA_BROWSER=webkit`, verifica também o fluxo local no WebKit; a distribuição Windows desse motor não oferece AudioContext, portanto não valida o mixer nem substitui um teste em iPhone físico.

O build reutiliza o protocolo de `server/index.js`. Ao alterar o protocolo, execute novamente a validação do pacote; as verificações do gerador interrompem o build se os pontos de integração esperados desaparecerem.

### Caminhos internos do ZIP

Os nomes das entradas devem usar `/`, inclusive no Windows. `Compress-Archive` pode gravar `\`, que o Windows normaliza ao extrair, mas o CDN do itch.io não encontra pelas URLs do navegador. O build verifica diretamente o diretório central do ZIP com `verify-itch-zip.mjs`, rejeitando barras invertidas e conferindo caminhos essenciais. A validação de gameplay roda dentro de um iframe com sandbox.

Requisitos oficiais: [Uploading HTML5 games](https://itch.io/docs/creators/html5).

## Servidor online e coleção

O pacote inclui um acesso ao servidor online do PC, configurado durante o build por TANKDOTS_PUBLIC_URL. Login, cartas, conquistas e Battle Dots ficam no servidor. O modo local não concede recompensas persistentes. Consulte [Servidor no PC](./pc-server.md). O endereço do Quick Tunnel muda quando reiniciado; gere outro pacote ou informe o novo endereço na tela de conexão.
