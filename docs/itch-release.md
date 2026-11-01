# Edição HTML para itch.io

Execute `npm run build:itch` na raiz do projeto. O comando gera uma pasta datada em `output/itch`, com `tank-dot-arena-itch.zip`, a cópia descompactada em `game` e instruções em `LEIA-ME.txt`. Não requer bundler adicional; no Windows usa Compress-Archive, nos demais sistemas usa zip.

O ZIP contém `index.html` na raiz, recursos com caminhos relativos e um Worker que executa o motor original de partidas, física e bots. O servidor online não é alterado. Contas, convites e entrada em salas online são omitidos nesta edição. As configurações locais continuam usando o armazenamento do navegador. Partidas em andamento não são restauradas ao recarregar a página.

## Upload

1. Selecione **HTML** no tipo de projeto.
2. Envie apenas `tank-dot-arena-itch.zip` em **Upload files** e marque **This file will be played in the browser**, se aparecer.
3. Prefira **Click to launch in fullscreen**. Para incorporar na página, use **1280 × 720** e habilite o botão de tela cheia.
4. Mantenha **Click to Play** ativado. Teste a prévia antes de tornar a página pública.

O jogo precisa carregar os recursos pela internet ao abrir a página, mas a simulação não usa conexão, backend ou Node.js. Esta entrega não inclui instalação PWA ou garantia de recarregamento offline. O arquivo HTML não deve ser aberto por `file://`; use o itch.io ou uma hospedagem estática HTTP/HTTPS.

## Validação

`node scripts/qa-itch.mjs <diretório game>` serve o pacote em uma subpasta e testa carregamento, treino, preparação com classe e arsenal, disparo sem conexão e turnos dos bots. Registra capturas e estado em `output/web-game/itch`. Use `SERVE_ONLY=1` para manter uma hospedagem local aberta durante testes manuais.

O build reutiliza o protocolo de `server/index.js`. Ao alterar o protocolo, execute novamente a validação do pacote; as verificações do gerador interrompem o build se os pontos de integração esperados desaparecerem.

Requisitos oficiais: [Uploading HTML5 games](https://itch.io/docs/creators/html5).
